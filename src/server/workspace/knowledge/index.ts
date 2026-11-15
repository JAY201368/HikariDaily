import "server-only";
import type { PoolClient } from "pg";
import { knowledgeImportSchema, type KnowledgeContext, type KnowledgeEvidence, type KnowledgeReference } from "../../../domain/workspace/knowledge";
import { query, transaction } from "../db";
import { invalid, WorkspaceError } from "../errors";
/** Empty condition list means unrestricted; unknown context never satisfies a specific condition. */
export function applicable(entry: KnowledgeEvidence, context: KnowledgeContext) {
  const c = entry.conditions;
  const match = (allowed: string[], actual: string[]) => !allowed.length || (actual.length > 0 && !actual.includes("unknown") && actual.every(t => allowed.includes(t)));
  const required = (needed: string[], actual: string[]) => needed.every(t => t !== "unknown" && actual.includes(t));
  return c.genres.includes(context.genre) && match(c.phases, context.phases) && match(c.characters, context.characters)
    && required(c.weather, context.weather) && required(c.equipment, context.equipment) && required(c.aesthetics, context.aesthetics)
    && !context.risks.some(r => c.excludedRisks.includes(r));
}
/** Conditions ALWAYS precede ranking. No private records are queried by this shared corpus. */
export function rankKnowledge(entries: KnowledgeEvidence[], context: KnowledgeContext, search: string, limit = 10) {
  const terms = search.toLowerCase().split(/[\s,，。]+/).filter(Boolean);
  return entries.filter(e => applicable(e, context)).map(e => ({ e, score: e.keywords.reduce((n, k) => n + (terms.some(t => k.toLowerCase().includes(t) || t.includes(k.toLowerCase())) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id)).slice(0, Math.max(0, Math.min(30, limit))).map(r => r.e);
}
export async function retrieveKnowledge(context: KnowledgeContext, search: string, limit = 10): Promise<KnowledgeEvidence[]> {
  const { rows } = await query(`SELECT c.data,v.metadata FROM knowledge_chunks c JOIN knowledge_sources s ON s.id=c.source_id AND s.current_version=c.version AND s.active JOIN knowledge_versions v ON v.source_id=c.source_id AND v.version=c.version`);
  return rankKnowledge(rows.map(r => ({ ...r.data, source: r.metadata })), context, search, limit);
}
/** Operator-only import/update. No HTTP write endpoint; sources are reviewed original material. */
export async function importKnowledge(input: unknown) {
  const parsed = knowledgeImportSchema.safeParse(input); if (!parsed.success) throw invalid();
  const value = parsed.data;
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(74190103)");
    const old = (await client.query("SELECT current_version FROM knowledge_sources WHERE id=$1 FOR UPDATE", [value.source.id])).rows[0];
    if (old && value.source.version !== old.current_version + 1) throw new WorkspaceError("KNOWLEDGE_VERSION_CONFLICT", 409, "知识修订版本必须连续递增");
    if (!old && value.source.version !== 1) throw invalid();
    await client.query("INSERT INTO knowledge_sources(id,current_version) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET current_version=$2,active=true,updated_at=now()", [value.source.id, value.source.version]);
    await client.query("INSERT INTO knowledge_versions(source_id,version,metadata) VALUES($1,$2,$3)", [value.source.id, value.source.version, JSON.stringify(value.source)]);
    for (const c of value.chunks) await client.query("INSERT INTO knowledge_chunks(source_id,version,id,data) VALUES($1,$2,$3,$4)", [value.source.id, value.source.version, c.id, JSON.stringify(c)]);
  });
  return { sourceId: value.source.id, version: value.source.version, chunks: value.chunks.length };
}
export async function withdrawKnowledge(sourceId: string, version: number) {
  return transaction(async client => {
    const result = await client.query("UPDATE knowledge_sources SET active=false,updated_at=now() WHERE id=$1 AND current_version=$2 RETURNING id", [sourceId, version]);
    if (!result.rowCount) throw new WorkspaceError("KNOWLEDGE_VERSION_CONFLICT", 409, "知识来源或版本已变更");
    return { sourceId, version, active: false };
  });
}
export const referenceKey = (r: KnowledgeReference) => `${r.sourceId}:${r.version}:${r.chunkId}`;
export const evidenceReference = (e: KnowledgeEvidence): KnowledgeReference => ({ sourceId: e.source.id, version: e.source.version, chunkId: e.id });
/** Inside final commit transaction. SHARE locks prevent withdrawal/update until return commits. */
export async function assertKnowledgeActive(client: PoolClient, references: KnowledgeReference[]) {
  const unique = [...new Map(references.map(r => [referenceKey(r), r])).values()].sort((a,b) => referenceKey(a).localeCompare(referenceKey(b)));
  for (const r of unique) {
    const result = await client.query(`SELECT s.id FROM knowledge_sources s JOIN knowledge_chunks c ON c.source_id=s.id AND c.version=s.current_version WHERE s.id=$1 AND s.current_version=$2 AND s.active AND c.id=$3 FOR SHARE OF s`, [r.sourceId, r.version, r.chunkId]);
    if (!result.rowCount) throw new WorkspaceError("KNOWLEDGE_CHANGED", 409, "知识依据已修订或撤回");
  }
}
