import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { unavailable, unauthorized } from "./errors";
let pool: Pool | undefined;
/** Lazy: ordinary weather continues working without workspace configuration. */
export function getPool(): Pool {
    if (!process.env.HIKARI_DATABASE_URL)
        throw unavailable();
    return pool ??= new Pool({ connectionString: process.env.HIKARI_DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
}
export const query = <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) => getPool().query<T>(sql, values);
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
/** All private writes lock the owner FIRST, then business/config/job rows. */
export async function lockOwner(client: PoolClient, ownerId: string): Promise<{
    id: string;
    model_version: number;
}> {
    const { rows } = await client.query<{
        id: string;
        model_version: number;
    }>("SELECT id, model_version FROM accounts WHERE id=$1 FOR UPDATE", [ownerId]);
    if (!rows[0])
        throw unauthorized();
    return rows[0];
}
export function withOwnerLock<T>(ownerId: string, work: (client: PoolClient) => Promise<T>) {
    return transaction(async (client) => { await lockOwner(client, ownerId); return work(client); });
}
export async function closeDatabase() { await pool?.end(); pool = undefined; }
