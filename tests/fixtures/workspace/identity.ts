/** Explicit database identity fixture; never used by application code or live providers. */
import { createHmac, randomUUID } from "node:crypto";
import { query } from "../../../src/server/workspace/db";
import { requireAccount } from "../../../src/server/workspace/auth";
export function identityEnvironment() {
  process.env.HIKARI_AUTH_SECRET = "isolated-tests-only-secret-32-characters";
  process.env.AUTHING_APP_HOST = "https://identity.example.invalid";
  process.env.AUTHING_APP_ID = "test-client";
  process.env.AUTHING_APP_SECRET = "test-client-secret";
  process.env.HIKARI_APP_ORIGIN = "http://localhost:3000";
}
export async function register(input: { username: string; password?: string }, preserveEnvironment = false) {
  const testUrl = process.env.HIKARI_TEST_DATABASE_URL;
  if (!testUrl || process.env.HIKARI_DATABASE_URL !== testUrl || !/test/i.test(new URL(testUrl).pathname)) throw Error("Explicit isolated identity test database required");
  if (!preserveEnvironment) identityEnvironment();
  const id = randomUUID(), subject = randomUUID(), session = randomUUID();
  const email = `${input.username}@example.invalid`;
  await query('INSERT INTO identity_users(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id, input.username, email]);
  await query('INSERT INTO identity_accounts(id,"accountId","providerId","userId","createdAt","updatedAt") VALUES($1,$2,\'authing\',$3,now(),now())', [randomUUID(), subject, id]);
  await query('INSERT INTO identity_sessions(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())', [randomUUID(), session, id]);
  const signature = createHmac("sha256", process.env.HIKARI_AUTH_SECRET!).update(session).digest("base64");
  const token = encodeURIComponent(`${session}.${signature}`);
  const account = await requireAccount(new Request("http://localhost:3000/", { headers: { cookie: `hikari_identity.session_token=${token}` } }));
  return { account, token, userId: id, subject, session };
}
