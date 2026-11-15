import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { query, withOwnerLock } from '../db';
import { WorkspaceError } from '../errors';

export const maxImageBytes = 15 * 1024 * 1024;
/** Private asset boundary. The deployment can replace this adapter independently. */
export async function putImage(ownerId: string, id: string, bytes: Buffer) {
  if (bytes.length > maxImageBytes || createHash('sha256').update(bytes).digest('hex') !== id)
    throw new WorkspaceError('INVALID_IMAGE', 400, '图片校验失败');
  let metadata;
  try { metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata(); }
  catch { throw new WorkspaceError('INVALID_IMAGE', 400, '图片无法读取，请选择 JPEG、PNG 或 WebP 图片'); }
  const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format as 'jpeg' | 'png' | 'webp'];
  if (!mime || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
    throw new WorkspaceError('INVALID_IMAGE', 400, '请选择单张 JPEG、PNG 或 WebP 图片');
  await withOwnerLock(ownerId, client => client.query(`INSERT INTO planner_images(owner_id,id,mime_type,width,height,bytes)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,id) DO NOTHING`, [ownerId, id, mime, metadata.width, metadata.height, bytes]));
  return { id };
}
export async function getImage(ownerId: string, id: string) {
  const { rows } = await query<{ bytes: Buffer; mime_type: string }>('SELECT bytes,mime_type FROM planner_images WHERE owner_id=$1 AND id=$2', [ownerId, id]);
  if (!rows[0]) throw new WorkspaceError('NOT_FOUND', 404, '图片不存在');
  return rows[0];
}
