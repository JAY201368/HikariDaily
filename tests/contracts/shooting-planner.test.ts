import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { register } from '@/server/workspace/auth';
import { closeDatabase, query } from '@/server/workspace/db';
import { migrate } from '@/server/workspace/migrate';
import { handleNotebook, handleImage } from '@/server/workspace/planner/routes';
import { emptyNotebook, planSchema } from '@/domain/planner';

const database = process.env.HIKARI_TEST_DATABASE_URL ? describe : describe.skip;
const origin = 'http://localhost:3000';
const accounts: Awaited<ReturnType<typeof register>>[] = [];
function request(index: number, method = 'GET', body?: unknown, expectedOwner = accounts[index]?.account.id) {
  return new Request(`${origin}/api/workspace/planner`, { method, headers: {
    origin, 'content-type': body instanceof Uint8Array ? 'application/octet-stream' : 'application/json',
    cookie: `hikari_session=${accounts[index]?.token}`, 'X-Planner-Owner': expectedOwner,
  }, body: body === undefined ? undefined : body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body) });
}
database('private planner persistence', () => {
  beforeAll(async () => {
    process.env.HIKARI_APP_ORIGIN = origin;
    process.env.HIKARI_DATABASE_URL = process.env.HIKARI_TEST_DATABASE_URL;
    await migrate();
    for (let index = 0; index < 2; index++) accounts.push(await register({ username: `planner_${randomUUID().slice(0, 8)}`, password: 'planner-integration-test-47' }));
  });
  afterAll(async () => {
    for (const account of accounts) await query('DELETE FROM accounts WHERE id=$1', [account.account.id]);
    await closeDatabase();
  });
  it('requires authentication, matching owner and same origin', async () => {
    expect((await handleNotebook(new Request(`${origin}/api/workspace/planner`))).status).toBe(401);
    expect((await handleNotebook(request(0, 'GET', undefined, accounts[1].account.id))).status).toBe(409);
    const forged = request(0, 'PUT', {}); forged.headers.set('origin', 'https://example.net');
    expect((await handleNotebook(forged)).status).toBe(403);
  });
  it('saves once on retry, fences stale versions and isolates accounts', async () => {
    const operationId = randomUUID();
    const input = { baseVersion: 0, operationId, notebook: emptyNotebook() };
    for (let index = 0; index < 2; index++) {
      const saved = await handleNotebook(request(0, 'PUT', input));
      expect(saved.status).toBe(200);
      expect((await saved.json()).data.revision).toBe(1);
    }
    expect((await handleNotebook(request(0, 'PUT', { ...input, operationId: randomUUID() }))).status).toBe(409);
    expect((await (await handleNotebook(request(1))).json()).data.revision).toBe(0);
  });
  it('validates private image bytes, ownership and referenced assets', async () => {
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#b4b8a1' } }).png().toBuffer();
    const id = createHash('sha256').update(bytes).digest('hex');
    expect((await handleImage(request(0, 'PUT', bytes), id)).status).toBe(200);
    expect((await handleImage(request(0, 'PUT', bytes), id)).status).toBe(200);
    expect((await handleImage(request(0, 'PUT', bytes), 'b'.repeat(64))).status).toBe(400);
    const invalid = Buffer.from('<svg onload="alert(1)"></svg>');
    expect((await handleImage(request(0, 'PUT', invalid), createHash('sha256').update(invalid).digest('hex'))).status).toBe(400);
    const image = await handleImage(request(0), id);
    expect(image.headers.get('cache-control')).toContain('no-store');
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(bytes);
    expect((await handleImage(request(1), id)).status).toBe(404);
    const plan = planSchema.parse({ id: 'plan', title: 'test', date: '', location: '', genre: '', intent: '', notes: '', createdAt: 1, updatedAt: 1, schedule: [], checklist: [], extraPages: [], photos: [{ id: 'photo', assetId: id, name: '', caption: '', annotations: [] }] });
    const notebook = { ...emptyNotebook(), plans: [plan] };
    expect((await handleNotebook(request(1, 'PUT', { baseVersion: 0, operationId: randomUUID(), notebook }))).status).toBe(409);
    expect((await handleNotebook(request(0, 'PUT', { baseVersion: 1, operationId: randomUUID(), notebook }))).status).toBe(200);
    await query('DELETE FROM accounts WHERE id=$1', [accounts[0].account.id]);
    expect((await query('SELECT id FROM planner_images WHERE owner_id=$1', [accounts[0].account.id])).rowCount).toBe(0);
    expect((await query('SELECT owner_id FROM planner_notebooks WHERE owner_id=$1', [accounts[0].account.id])).rowCount).toBe(0);
  });
});
