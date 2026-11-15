import "server-only";
import type { PoolClient } from "pg";
import { modelInputSchema, type ModelCapabilities, type ModelConfigView } from "../../domain/workspace/model";
import { lockOwner, query, transaction } from "./db";
import { encryptCredential } from "./credentials";
import { pinEndpoint } from "./endpoint";
import { invalid, staleConfig, WorkspaceError } from "./errors";
import { cancelOwnerCalls } from "./inflight";
export const untestedCapabilities = (): ModelCapabilities => ({ text: "untested", image: "untested", tools: "untested" });
export async function getModelConfig(ownerId: string): Promise<ModelConfigView> {
    const { rows } = await query("SELECT a.model_version,c.endpoint,c.model,c.capabilities FROM accounts a LEFT JOIN model_configs c ON c.owner_id=a.id WHERE a.id=$1", [ownerId]);
    if (!rows[0])
        throw new WorkspaceError("UNAUTHORIZED", 401, "请先登录");
    const row = rows[0];
    return { configured: !!row.endpoint, version: row.model_version, baseUrl: row.endpoint ?? null, model: row.model ?? null, capabilities: row.capabilities ?? untestedCapabilities() };
}
export async function putModelConfig(ownerId: string, input: unknown) {
    const parsed = modelInputSchema.safeParse(input);
    if (!parsed.success)
        throw invalid();
    const value = parsed.data;
    const { url } = await pinEndpoint(value.baseUrl);
    const version = await transaction(async (client) => {
        const account = await lockOwner(client, ownerId);
        if (account.model_version !== value.baseVersion)
            throw new WorkspaceError("VERSION_CONFLICT", 409, "配置已更新，请重新载入", { currentVersion: account.model_version });
        const version = account.model_version + 1;
        const credential = encryptCredential(ownerId, version, value.apiKey);
        await client.query(`INSERT INTO model_configs(owner_id,version,endpoint,model,credential) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(owner_id) DO UPDATE SET version=$2,endpoint=$3,model=$4,credential=$5,capabilities=$6,updated_at=now()`, [ownerId, version, url.href, value.model, credential, untestedCapabilities()]);
        await client.query("UPDATE accounts SET model_version=$2 WHERE id=$1", [ownerId, version]);
        return version;
    });
    cancelOwnerCalls(ownerId, version);
    return getModelConfig(ownerId);
}
export async function deleteModelConfig(ownerId: string, baseVersion: number) {
    if (!Number.isSafeInteger(baseVersion) || baseVersion < 0)
        throw invalid();
    const version = await transaction(async (client) => {
        const account = await lockOwner(client, ownerId);
        if (account.model_version !== baseVersion)
            throw new WorkspaceError("VERSION_CONFLICT", 409, "配置已更新，请重新载入", { currentVersion: account.model_version });
        await client.query("DELETE FROM model_configs WHERE owner_id=$1", [ownerId]);
        await client.query("UPDATE accounts SET model_version=model_version+1 WHERE id=$1", [ownerId]);
        return account.model_version + 1;
    });
    cancelOwnerCalls(ownerId, version);
    return getModelConfig(ownerId);
}
/** Call INSIDE an owner-locked transaction immediately before writing generated content. */
export async function assertConfigVersion(client: PoolClient, ownerId: string, version: number): Promise<void> {
    // Reacquiring this same owner lock is harmless and enforces correct usage by callers.
    const account = await lockOwner(client, ownerId);
    const active = await client.query("SELECT 1 FROM model_configs WHERE owner_id=$1 AND version=$2", [ownerId, version]);
    if (account.model_version !== version || !active.rowCount)
        throw staleConfig();
}
export async function checkConfigVersion(ownerId: string, version: number) {
    const { rowCount } = await query("SELECT 1 FROM accounts a JOIN model_configs c ON c.owner_id=a.id WHERE a.id=$1 AND a.model_version=$2 AND c.version=$2", [ownerId, version]);
    if (!rowCount)
        throw staleConfig();
}
export async function storeCapabilities(ownerId: string, version: number, capabilities: ModelCapabilities) {
    await transaction(async (client) => {
        await assertConfigVersion(client, ownerId, version);
        await client.query("UPDATE model_configs SET capabilities=$3 WHERE owner_id=$1 AND version=$2", [ownerId, version, capabilities]);
    });
}
