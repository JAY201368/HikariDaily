import 'server-only';
import { z } from 'zod';
import { assetIds, emptyNotebook, notebookSchema } from '@/domain/planner';
import { requireAccount } from '../auth';
import { query, withOwnerLock } from '../db';
import { invalid, WorkspaceError } from '../errors';
import { json, rateLimit, readJson, requireSameOrigin, route } from '../http';
import { getImage, maxImageBytes, putImage } from './images';

const saveSchema = z.object({ baseVersion: z.number().int().nonnegative(), operationId: z.uuid(), notebook: notebookSchema }).strict();
async function owner(request: Request, writing: boolean) {
  if (writing) requireSameOrigin(request);
  const account = await requireAccount(request);
  const expected = request.headers.get('X-Planner-Owner') ?? new URL(request.url).searchParams.get('owner');
  if (expected !== account.id) throw new WorkspaceError('ACCOUNT_CHANGED', 409, '账户已变化，请重新打开计划本');
  return account.id;
}
export function handleNotebook(request: Request) {
  return route(async () => {
    const writing = request.method === 'PUT';
    const ownerId = await owner(request, writing);
    if (!writing) {
      const { rows } = await query('SELECT revision,operation_id,document FROM planner_notebooks WHERE owner_id=$1', [ownerId]);
      return json({ revision: rows[0]?.revision ?? 0, operationId: rows[0]?.operation_id ?? null, notebook: rows[0]?.document ?? emptyNotebook() });
    }
    await rateLimit(`planner:save:${ownerId}`, 300);
    const parsed = saveSchema.safeParse(await readJson(request, 4 * 1024 * 1024));
    if (!parsed.success) throw invalid();
    const input = parsed.data;
    return withOwnerLock(ownerId, async client => {
      await client.query('INSERT INTO planner_notebooks(owner_id) VALUES($1) ON CONFLICT DO NOTHING', [ownerId]);
      const { rows } = await client.query('SELECT revision,operation_id,document FROM planner_notebooks WHERE owner_id=$1 FOR UPDATE', [ownerId]);
      const current = rows[0];
      if (current.operation_id === input.operationId) return json({ revision: current.revision, operationId: current.operation_id, notebook: current.document });
      if (current.revision !== input.baseVersion) throw new WorkspaceError('PLANNER_CONFLICT', 409, '另一处已更新计划，请合并保存');
      const ids = assetIds(input.notebook);
      const assets = await client.query('SELECT id FROM planner_images WHERE owner_id=$1 AND id=ANY($2::text[])', [ownerId, ids]);
      if (assets.rows.length !== ids.length) throw new WorkspaceError('IMAGES_PENDING', 409, '图片尚未上传完成，请重试保存');
      const revision = current.revision + 1;
      await client.query('UPDATE planner_notebooks SET revision=$2,operation_id=$3,document=$4,updated_at=now() WHERE owner_id=$1', [ownerId, revision, input.operationId, JSON.stringify(input.notebook)]);
      return json({ revision, operationId: input.operationId, notebook: input.notebook });
    });
  });
}
export function handleImage(request: Request, id: string) {
  return route(async () => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw invalid();
    const writing = request.method === 'PUT';
    const ownerId = await owner(request, writing);
    if (!writing) {
      const image = await getImage(ownerId, id);
      return new Response(new Uint8Array(image.bytes), { headers: { 'Content-Type': image.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    await rateLimit(`planner:image:${ownerId}`, 100);
    const reader = request.body?.getReader();
    if (!reader) throw invalid();
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maxImageBytes) { await reader.cancel(); throw new WorkspaceError('IMAGE_TOO_LARGE', 413, '单张图片最多15 MB'); }
      chunks.push(part.value);
    }
    return json(await putImage(ownerId, id, Buffer.concat(chunks)));
  });
}
