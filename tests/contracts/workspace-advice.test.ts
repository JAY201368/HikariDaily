import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import corpus from "../../src/content/knowledge/original-fieldcraft.v1.json";
import quality from "../fixtures/workspace/advice-quality.v1.json";
import { sceneBriefing, at, setAll } from "../fixtures/interpret-helpers";
import { goodNarrative, originalEvidence, qualityBriefing } from "../fixtures/workspace/advice";
import type { Genre } from "../../src/domain/types";
import type { KnowledgeEvidence, KnowledgeImport } from "../../src/domain/workspace/knowledge";
import { knowledgeImportSchema } from "../../src/domain/workspace/knowledge";
import { ADVICE_QUALITY_VERSION } from "../../src/domain/workspace/advice";
import { closeDatabase, query, transaction, withOwnerLock } from "../../src/server/workspace/db";
import { migrate } from "../../src/server/workspace/migrate";
import { register } from "../../src/server/workspace/auth";
import { deleteModelConfig, putModelConfig, storeCapabilities } from "../../src/server/workspace/config";
import { enhanceBriefing, buildAdviceInput } from "../../src/server/workspace/advice";
import { GENRES, adviceContext, buildAdviceFacts, unsafeAdviceText, validateGenreNarrative } from "../../src/server/workspace/advice-policy";
import { applicable, assertKnowledgeActive, importKnowledge, rankKnowledge, retrieveKnowledge, withdrawKnowledge } from "../../src/server/workspace/knowledge";
import { handleAdvice, handleKnowledge } from "../../src/server/workspace/advice-routes";
import { requestHash } from "../../src/server/workspace/request-hash";
import { MODEL_BUDGETS } from "../../src/server/workspace/model";
import type { ModelTransport } from "../../src/server/workspace/transport";
const enhanced = (ownerId: string, base: Parameters<typeof enhanceBriefing>[1], options: Parameters<typeof enhanceBriefing>[2] = {}) => enhanceBriefing(ownerId, base, { now: () => Date.parse(base.generatedAt), ...options });
const testUrl = process.env.HIKARI_TEST_DATABASE_URL;
const database = testUrl ? describe : describe.skip;
const owners: string[] = [], sources: string[] = [];
const source = () => { const id = `test-${randomUUID()}`; sources.push(id); return knowledgeImportSchema.parse({ ...corpus, source: { ...corpus.source, id } }); };
const byGenre = (g: Genre) => rankKnowledge(originalEvidence, adviceContext(qualityBriefing(), g), "", 30);
const req = (path: string, body?: unknown, token?: string, origin = "http://localhost:3000") => new Request(`http://localhost:3000${path}`, { method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json", ...(token ? { cookie: `hikari_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function account(configured = false) {
  const a = await register({ username: `a_${randomUUID().replaceAll("-", "").slice(0, 20)}`, password: "advice-test-password" }); owners.push(a.account.id);
  if (configured) {
    await putModelConfig(a.account.id, { baseVersion: 0, baseUrl: "https://8.8.8.8/v1", model: "quality-test", apiKey: "private-advice-key" });
    await storeCapabilities(a.account.id, 1, { text: "available", image: "untested", tools: "untested" });
  }
  return a;
}
/** Echoes authored examples with actual retrieved references through the real model caller. */
function wire(edit?: (raw: Record<Genre, unknown>) => void, before?: () => Promise<void>): ModelTransport {
  return async (_url, _key, body) => {
    const context = JSON.parse(((body as { messages: { content: string }[] }).messages as { content: string }[])[1].content) as Record<Genre, { facts: Record<string, { context?: { risks: string[] } }>; knowledge: { sourceId: string; version: number; chunkId: string; text: string; topics: string[] }[] }>;
    const raw = Object.fromEntries(GENRES.map(g => [g, goodNarrative(g, context[g].knowledge.map(k => ({ id: k.chunkId, topics: k.topics, source: { id: k.sourceId, version: k.version } })) as KnowledgeEvidence[], !!context[g].facts[`${g}:context`]?.context?.risks.length)])) as Record<Genre, unknown>;
    edit?.(raw); await before?.();
    return { choices: [{ message: { content: JSON.stringify(raw) } }], usage: { total_tokens: 100 } };
  };
}
describe("versioned advice quality and original recall", () => {
  it("validates original authorization and locators, and pins the quality version", () => {
    expect(knowledgeImportSchema.safeParse(corpus).success).toBe(true);
    expect(quality.version).toBe(ADVICE_QUALITY_VERSION);
    corpus.chunks.forEach((c, i) => expect(c.locator).toBe(`#/chunks/${i}`));
    expect(new Set(corpus.chunks.flatMap(c => c.topics))).toEqual(new Set(["subject", "light", "composition", "viewpoint", "alternative", "gear", "film", "direct", "night", "weather"]));
  });
  it.each(quality.cases)("semantic $id", ({ scene, text, allowed }) => {
    const base = qualityBriefing(scene);
    expect(!unsafeAdviceText(text, adviceContext(base, "landscape"), base)).toBe(allowed);
  });
  it.each(quality.recall)("recall $scene/$genre filters before keyword ranking", row => {
    const context = adviceContext(qualityBriefing(row.scene), row.genre as Genre);
    const ranked = rankKnowledge(originalEvidence, context, row.query, 3).map(e => e.id);
    expect(ranked).toContain(row.include); expect(ranked).not.toContain(row.exclude);
    expect(rankKnowledge(originalEvidence, context, row.exclude, 30).map(e => e.id)).not.toContain(row.exclude);
  });
  it("keeps unknown/stale/conflict/mixed window light unassertable and empty hours unknown", () => {
    for (const scene of ["stale", "conflict", "null"]) expect(adviceContext(qualityBriefing(scene), "landscape").characters).toContain("unknown");
    const b = qualityBriefing(); b.hours[13].light.character = "diffuse";
    expect(unsafeAdviceText("用侧光突出建筑体积。", adviceContext(b, "landscape"), b)).toBe(true);
    b.generatedAt = "2026-10-23T00:00:00+08:00";
    expect(adviceContext(b, "landscape")).toMatchObject({ phases: ["unknown"], characters: ["unknown"] });
  });
  it("allows soft directional window lighting without claiming direct sunlight", () => {
    const b = qualityBriefing("overcast"), context = adviceContext(b, "portrait");
    expect(unsafeAdviceText("用窗边侧光提亮人物面部。", context, b)).toBe(false);
    expect(unsafeAdviceText("用窗边太阳直射形成硬影。", context, b)).toBe(true);
  });
  it("uses rule-qualified windows for blocking risks and keeps air-quality out of the outdoor exclusion", () => {
    const b = qualityBriefing();
    b.advice.landscape.recommendedWindows = [{ start: b.hours[13].start, end: b.hours[15].start, status: "future", reasons: [], reasonCodes: [], sourceIds: [], limitations: [] }];
    b.hours[20].risks.push({ code: "thunderstorm", message: "晚间雷暴", start: b.hours[20].start, end: b.hours[20].end, sourceIds: [] });
    expect(adviceContext(b, "landscape").risks).toEqual([]);
    b.hours[13].risks.push({ code: "air-quality", message: "空气污染", start: b.hours[13].start, end: b.hours[13].end, sourceIds: [] });
    expect(unsafeAdviceText("从河岸取景拍建筑轮廓。", adviceContext(b, "landscape"), b)).toBe(false);
    b.hours[14].risks.push({ code: "heavy-rain", message: "强降水", start: b.hours[14].start, end: b.hours[14].end, sourceIds: [] });
    expect(unsafeAdviceText("从河岸取景拍建筑轮廓。", adviceContext(b, "landscape"), b)).toBe(true);
  });
  it("requires all specific light/weather tags and real equipment/aesthetic conditions", () => {
    const e = structuredClone(originalEvidence[0]); e.conditions.equipment = ["tripod"]; e.conditions.aesthetics = ["graphic"];
    const c = adviceContext(qualityBriefing(), "landscape");
    expect(applicable(e, c)).toBe(false); expect(applicable(e, { ...c, equipment: ["tripod"], aesthetics: ["graphic"] })).toBe(true);
  });
  it("matches every required weather/gear/aesthetic predicate despite extra independent known features", () => {
    const entry = structuredClone(originalEvidence[0]);
    entry.conditions = { genres: ["portrait"], phases: ["day"], characters: ["diffuse"], weather: ["rain-forecast"], equipment: ["50mm"], aesthetics: ["graphic"], excludedRisks: [] };
    const context = { genre: "portrait" as const, phases: ["day"], characters: ["diffuse"], weather: ["rain-forecast", "clear-distance"], equipment: ["50mm", "camera", "tripod"], aesthetics: ["graphic", "retro"], risks: [] };
    expect(applicable(entry, context)).toBe(true);
    for (const [key, actual] of [["weather", ["clear-distance"]], ["equipment", ["camera", "tripod"]], ["aesthetics", ["retro"]]] as const) expect(applicable(entry, { ...context, [key]: [...actual] })).toBe(false);
    entry.conditions.equipment.push("flash"); expect(applicable(entry, context)).toBe(false);
    expect(applicable(entry, { ...context, equipment: [...context.equipment, "flash"] })).toBe(true);
  });
  it("requires every sampled phase/character to fit its range and rejects unknown specific conditions", () => {
    const entry = structuredClone(originalEvidence[0]);
    entry.conditions = { genres: ["portrait"], phases: ["day"], characters: ["diffuse"], weather: ["rain-forecast"], equipment: [], aesthetics: [], excludedRisks: [] };
    const context = { genre: "portrait" as const, phases: ["day"], characters: ["diffuse"], weather: ["rain-forecast", "clear-distance"], equipment: [], aesthetics: [], risks: [] };
    for (const phases of [[], ["unknown"], ["day", "night"]]) expect(applicable(entry, { ...context, phases })).toBe(false);
    for (const characters of [[], ["unknown"], ["diffuse", "direct"]]) expect(applicable(entry, { ...context, characters })).toBe(false);
    expect(applicable(entry, { ...context, weather: ["unknown"] })).toBe(false);
    entry.conditions.characters.push("unknown"); expect(applicable(entry, { ...context, characters: ["unknown"] })).toBe(false);
    entry.conditions.weather = ["unknown"]; expect(applicable(entry, { ...context, weather: ["unknown"] })).toBe(false);
  });
  it.each(GENRES)("accepts complete specific %s narrative and same-source short projections", genre => {
    const b = qualityBriefing(); const n = goodNarrative(genre, byGenre(genre));
    expect(validateGenreNarrative(n, b, genre, byGenre(genre)).reason).toBeNull();
    for (const f of Object.values(n)) expect(f.text).toContain(f.short);
  });
  it("rejects truncated/long short, false references, irrelevant topics, duplicated facets and changed film", () => {
    const b = qualityBriefing(), evidence = byGenre("landscape");
    const check = (mutate: (n: ReturnType<typeof goodNarrative>) => void) => { const n = goodNarrative("landscape", evidence); mutate(n); expect(validateGenreNarrative(n, b, "landscape", evidence).narrative).toBeNull(); };
    check(n => { n.subject.short = n.subject.text.slice(0, -1); });
    check(n => { n.subject.text = n.subject.short = "拍".repeat(37) + "。"; });
    check(n => { n.subject.factIds = ["portrait:context"]; });
    check(n => { n.subject.knowledge[0].version = 999; });
    check(n => { n.film.knowledge = n.subject.knowledge; });
    check(n => { n.light = n.subject; });
    check(n => { n.film.text = n.film.short = "用黑白负片突出窗框的线条。"; });
  });
  it("rejects false declared claims even with neutral prose, and requires indoor subject under risk", () => {
    const b = qualityBriefing("overcast"), n = goodNarrative("landscape", byGenre("landscape")); n.light.claims = ["direct-light"];
    expect(validateGenreNarrative(n, b, "landscape", byGenre("landscape")).reason).toBe("CLAIM_CONDITION_MISMATCH");
    const riskBase = qualityBriefing("risk"), riskEvidence = rankKnowledge(originalEvidence, adviceContext(riskBase, "landscape"), "", 30);
    expect(validateGenreNarrative(goodNarrative("landscape", riskEvidence), riskBase, "landscape", riskEvidence).reason).toBe("RISK_REQUIRES_INDOOR_ACTION");
    expect(validateGenreNarrative(goodNarrative("landscape", riskEvidence, true), riskBase, "landscape", riskEvidence).reason).toBeNull();
  });
  it("fits real deterministic rule output with full passages inside the same model input budget", () => {
    for (const b of [sceneBriefing(at(12)), sceneBriefing(at(12), d => setAll(d, { cloudTotal: 95 })), sceneBriefing(at(12), d => setAll(d, { precipitation: 2 })), sceneBriefing(at(21))]) {
      const knowledge = Object.fromEntries(GENRES.map(g => [g, rankKnowledge(originalEvidence, adviceContext(b, g), "主体 用光 构图 视角 替代 胶片 器材", 12)])) as Record<Genre, KnowledgeEvidence[]>;
      expect(Buffer.byteLength(JSON.stringify(buildAdviceInput(b, knowledge)))).toBeLessThanOrEqual(MODEL_BUDGETS.advice.textBytes);
    }
  });
  it("compacts a concrete day of disjoint long risk descriptions without losing authoritative display text", () => {
    const b = qualityBriefing();
    b.interpretation.risks = b.hours.map((h, i) => ({ code: i % 2 ? "strong-wind" : "heavy-rain", status: i < 12 ? "past" : "future", start: h.start, end: h.end, text: "人工合成风险说明。".repeat(16) }));
    const original = structuredClone(b.interpretation.risks);
    const knowledge = Object.fromEntries(GENRES.map(g => [g, rankKnowledge(originalEvidence, adviceContext(b, g), "主体 用光 构图 视角 替代 胶片 器材", 12)])) as Record<Genre, KnowledgeEvidence[]>;
    const input = buildAdviceInput(b, knowledge);
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThanOrEqual(MODEL_BUDGETS.advice.textBytes);
    const uncompacted = JSON.parse(JSON.stringify(input));
    const context = JSON.parse(uncompacted.messages[1].content);
    for (const g of GENRES) context[g].facts[`${g}:conditions`].risks = b.interpretation.risks;
    uncompacted.messages[1].content = JSON.stringify(context);
    expect(Buffer.byteLength(JSON.stringify(uncompacted))).toBeGreaterThan(MODEL_BUDGETS.advice.textBytes);
    expect(b.interpretation.risks).toEqual(original);
  });
  it("serializes actual complete passages and facts including system instructions under the 24KiB input budget", () => {
    for (const scene of ["sunny", "overcast", "rain", "night", "stale", "conflict", "null", "risk"]) {
      const b = qualityBriefing(scene);
      const knowledge = Object.fromEntries(GENRES.map(g => [g, rankKnowledge(originalEvidence, adviceContext(b, g), "主体 用光 构图 视角 替代 胶片 器材", 12)])) as Record<Genre, KnowledgeEvidence[]>;
      const input = buildAdviceInput(b, knowledge);
      expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThanOrEqual(MODEL_BUDGETS.advice.textBytes);
      const context = JSON.parse(input.messages[1].content);
      for (const g of GENRES) { expect(context[g].facts).toEqual(JSON.parse(JSON.stringify(buildAdviceFacts(b, g)))); expect(context[g].knowledge.every((k: { text: string }) => knowledge[g].some(e => e.text === k.text))).toBe(true); }
    }
  });
});
database("real PostgreSQL shared knowledge and isolated advice", () => {
  let imported: KnowledgeImport;
  beforeAll(async () => {
    process.env.HIKARI_DATABASE_URL = testUrl!; process.env.HIKARI_APP_ORIGIN = "http://localhost:3000";
    process.env.HIKARI_CREDENTIAL_KEYS = JSON.stringify({ test: randomBytes(32).toString("base64") });
    await migrate(); imported = source(); await importKnowledge(imported);
  });
  afterAll(async () => {
    if (owners.length) await query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [owners]);
    for (const id of owners) await query("DELETE FROM workspace_rate_limits WHERE key_hash=$1", [(await import("../../src/server/workspace/auth")).tokenHash(`advice:${id}`)]);
    if (sources.length) await query("DELETE FROM knowledge_sources WHERE id=ANY($1::text[])", [sources]);
    await closeDatabase();
  });
  it("applies explicit migration 005, imports, revises, withdraws and rejects stale evidence", async () => {
    expect((await query("SELECT version FROM workspace_migrations WHERE version='005_knowledge.sql'")).rowCount).toBe(1);
    const v1 = source(); await importKnowledge(v1);
    const c = adviceContext(qualityBriefing(), "landscape");
    expect((await retrieveKnowledge(c, "主体", 30)).some(e => e.source.id === v1.source.id)).toBe(true);
    await expect(importKnowledge(v1)).rejects.toMatchObject({ code: "KNOWLEDGE_VERSION_CONFLICT" });
    const v2 = { ...v1, source: { ...v1.source, version: 2 }, chunks: v1.chunks.map(c => ({ ...c, text: `修订。${c.text}` })) };
    await importKnowledge(v2);
    const entries = (await retrieveKnowledge(c, "主体", 30)).filter(e => e.source.id === v1.source.id);
    expect(entries.length).toBeGreaterThan(0); expect(entries.every(e => e.source.version === 2)).toBe(true);
    await expect(transaction(client => assertKnowledgeActive(client, [{ sourceId: v1.source.id, version: 1, chunkId: v1.chunks[0].id }]))).rejects.toMatchObject({ code: "KNOWLEDGE_CHANGED" });
    await withdrawKnowledge(v1.source.id, 2);
    expect((await retrieveKnowledge(c, "主体", 30)).some(e => e.source.id === v1.source.id)).toBe(false);
    expect((await query("SELECT 1 FROM knowledge_versions WHERE source_id=$1", [v1.source.id])).rowCount).toBe(2);
  });
  it("compares an independently specified recall gate and restores a prior corpus as a new version", async () => {
    const original = source(), direct = original.chunks.find(c => c.conditions.characters.includes("direct"))!;
    const keyword = `rollback-${randomUUID().slice(0,16)}`;
    const v1 = { ...original, chunks: [{ ...direct, keywords: [keyword], conditions: { ...direct.conditions, genres: ["landscape"], characters: [] } }] };
    // Deliberately faulty baseline permits direct-light knowledge under diffuse light.
    const contexts = [adviceContext(qualityBriefing("sunny"), "landscape"), adviceContext(qualityBriefing("overcast"), "landscape")];
    const expected = [true, false];
    const evaluate = async () => Promise.all(contexts.map(async c => (await retrieveKnowledge(c, keyword, 30)).some(e => e.source.id === v1.source.id)));
    await importKnowledge(v1); const before = await evaluate(); expect(before).toEqual([true, true]);
    const v2 = { ...v1, source: { ...v1.source, version: 2 }, chunks: v1.chunks.map(c => ({ ...c, conditions: { ...c.conditions, characters: ["direct"] } })) };
    await importKnowledge(v2); const after = await evaluate(); expect(after).toEqual(expected);
    expect(after.filter((v, i) => v === expected[i]).length).toBeGreaterThan(before.filter((v, i) => v === expected[i]).length);
    // Rollback is a reviewed import at the next version; immutable history never rewinds.
    await importKnowledge({ ...v1, source: { ...v1.source, version: 3 } }); expect(await evaluate()).toEqual(before);
    expect((await query("SELECT 1 FROM knowledge_versions WHERE source_id=$1", [v1.source.id])).rowCount).toBe(3);
    await expect(transaction(client => assertKnowledgeActive(client, [{ sourceId: v1.source.id, version: 2, chunkId: direct.id }]))).rejects.toMatchObject({ code: "KNOWLEDGE_CHANGED" });
    await withdrawKnowledge(v1.source.id, 3);
  });
  it("holds active evidence locks until final transaction completes; withdrawal then takes effect", async () => {
    const v = source(); await importKnowledge(v);
    const { account: a } = await account();
    let unlocked!: () => void, ready!: () => void;
    const latch = new Promise<void>(r => { unlocked = r; }), entered = new Promise<void>(r => { ready = r; });
    const final = withOwnerLock(a.id, async client => { await assertKnowledgeActive(client, [{ sourceId: v.source.id, version: 1, chunkId: v.chunks[0].id }]); ready(); await latch; });
    await entered;
    const external = new Pool({ connectionString: testUrl });
    const other = await external.connect();
    try {
      await other.query("SET lock_timeout='50ms'");
      await expect(other.query("UPDATE knowledge_sources SET active=false WHERE id=$1", [v.source.id])).rejects.toMatchObject({ code: "55P03" });
    } finally { unlocked(); await final; other.release(); }
    await external.query("UPDATE knowledge_sources SET active=false WHERE id=$1", [v.source.id]); await external.end();
    await expect(transaction(c => assertKnowledgeActive(c, [{ sourceId: v.source.id, version: 1, chunkId: v.chunks[0].id }]))).rejects.toMatchObject({ code: "KNOWLEDGE_CHANGED" });
  });
  it("has explicit no-Key and unverified-capability fallback without transport calls", async () => {
    const { account: a } = await account(); const transport = vi.fn(wire());
    expect((await enhanced(a.id, qualityBriefing(), { transport })).enhancement.landscape.reason).toBe("MODEL_NOT_CONFIGURED");
    await putModelConfig(a.id, { baseVersion: 0, baseUrl: "https://8.8.8.8", model: "test", apiKey: "secret" });
    expect((await enhanced(a.id, qualityBriefing(), { transport })).enhancement.landscape.reason).toBe("TEXT_CAPABILITY_UNVERIFIED"); expect(transport).not.toHaveBeenCalled();
  });
  it("generates distinct paired genres using one call; preserves the entire deterministic base and all fact/film/risk objects", async () => {
    const { account: a } = await account(true), base = qualityBriefing(); const before = structuredClone(base);
    const transport = vi.fn(wire()); const result = await enhanced(a.id, base, { transport });
    expect(transport).toHaveBeenCalledTimes(1); expect(result.baseBriefing).toBe(base); expect(base).toEqual(before); expect(result.factsHash).toBe(requestHash(base));
    expect(result.metadata).toMatchObject({ configVersion: 1, model: "quality-test", qualityVersion: quality.version });
    for (const key of ["subject", "light", "composition", "viewpoint", "film"] as const) expect(new Set(GENRES.map(g => result.enhancement[g].full?.[key].text)).size).toBe(3);
    for (const g of GENRES) { const e = result.enhancement[g]; expect(e.reason).toBeNull(); expect(e.status).toBe("generated"); expect(e.short?.newspaper).toBe(e.full?.subject.short); expect(e.evidence.length).toBeGreaterThan(0); }
    const sent = transport.mock.calls[0][2] as { max_tokens: number; response_format?: unknown }; expect(sent.max_tokens).toBe(8192); expect(sent.response_format).toBeUndefined();
  });
  it.each(["overcast", "rain", "night", "stale", "conflict", "null", "risk"])("returns usable per-genre outputs for %s while preserving unknown and source facts", async scene => {
    const { account: a } = await account(true), base = qualityBriefing(scene), before = structuredClone(base);
    const result = await enhanced(a.id, base, { transport: wire() });
    for (const g of GENRES) expect(result.enhancement[g].status).toBe("generated");
    expect(base).toEqual(before); expect(result.baseBriefing).toEqual(before);
  });
  it("rejects one invalid genre only, and rejects all repeated subjects symmetrically", async () => {
    const { account: a } = await account(true);
    const r = await enhanced(a.id, qualityBriefing(), { transport: wire(raw => { (raw.portrait as { light: unknown }).light = {}; }) });
    expect(r.enhancement.portrait.status).toBe("fallback"); expect(r.enhancement.landscape.status).toBe("generated"); expect(r.enhancement.street.status).toBe("generated");
    const missing = await enhanced(a.id, qualityBriefing(), { transport: wire(raw => { delete (raw as Partial<typeof raw>).portrait; }) });
    expect(missing.enhancement.landscape.status).toBe("generated"); expect(missing.enhancement.portrait.status).toBe("fallback");
    const duplicate = await enhanced(a.id, qualityBriefing(), { transport: wire(raw => { const p = raw.portrait as ReturnType<typeof goodNarrative>, l = raw.landscape as ReturnType<typeof goodNarrative>; p.subject.text = l.subject.text; p.subject.short = l.subject.short; }) });
    expect(duplicate.enhancement.landscape.reason).toBe("DUPLICATED_GENRE_SUBJECT"); expect(duplicate.enhancement.portrait.reason).toBe("DUPLICATED_GENRE_SUBJECT"); expect(duplicate.enhancement.street.status).toBe("generated");
  });
  it("never shares private generated results and handles malformed JSON and transport failure locally", async () => {
    const a = await account(true), b = await account(); const transport = vi.fn(wire());
    expect((await enhanced(a.account.id, qualityBriefing(), { transport })).enhancement.street.status).toBe("generated");
    expect((await enhanced(b.account.id, qualityBriefing(), { transport })).enhancement.street.reason).toBe("MODEL_NOT_CONFIGURED"); expect(transport).toHaveBeenCalledTimes(1);
    const broken = await enhanced(a.account.id, qualityBriefing(), { transport: async () => ({ choices: [{ message: { content: "not json" } }] }) });
    expect(broken.enhancement.street.reason).toBe("INVALID_MODEL_JSON"); expect(broken.baseBriefing.hours).toHaveLength(24);
    const failed = await enhanced(a.account.id, qualityBriefing(), { transport: async () => { throw Error("private upstream"); } });
    expect(failed.enhancement.street.reason).toBe("MODEL_UNAVAILABLE"); expect(JSON.stringify(failed)).not.toContain("private upstream");
  });
  it("rejects config revocation and knowledge withdrawal between retrieval and return", async () => {
    const { account: a } = await account(true);
    const revoked = await enhanced(a.id, qualityBriefing(), { transport: wire(undefined, () => deleteModelConfig(a.id, 1).then(() => {})) });
    expect(GENRES.every(g => revoked.enhancement[g].status === "fallback")).toBe(true); expect(revoked.enhancement.landscape.reason).toBe("CONFIG_CHANGED");
    const { account: b } = await account(true);
    const used = new Set<string>();
    const changed = await enhanced(b.id, qualityBriefing(), { transport: wire(raw => { GENRES.forEach(g => Object.values(raw[g] as ReturnType<typeof goodNarrative>).forEach(f => f.knowledge.forEach(k => used.add(k.sourceId)))); }, async () => { for (const id of used) { expect(sources).toContain(id); await withdrawKnowledge(id, 1); } }) });
    expect(GENRES.every(g => changed.enhancement[g].reason === "KNOWLEDGE_CHANGED")).toBe(true);
    // Restore only this test's source as a new revision, for subsequent tests.
    await importKnowledge({ ...imported, source: { ...imported.source, version: 2 } });
  });
  it.each(["sunset", "midnight", "window"])("rejects an eligibility transition across %s and records actual finish time", async boundary => {
    const { account: a } = await account(true), base = qualityBriefing();
    base.generatedAt = boundary === "midnight" ? "2026-10-22T23:59:50+08:00" : "2026-10-22T17:29:50+08:00";
    if (boundary === "window") {
      base.solar.sunset = "2026-10-22T18:30:00+08:00";
      for (const g of GENRES) base.advice[g].recommendedWindows = [{ start: "2026-10-22T17:00:00+08:00", end: "2026-10-22T17:30:00+08:00", status: "current", reasons: [], reasonCodes: [], limitations: [], sourceIds: [] }];
    }
    let clock = Date.parse(base.generatedAt);
    const result = await enhanced(a.id, base, { now: () => clock, transport: wire(undefined, async () => { clock += 20000; }) });
    expect(GENRES.every(g => result.enhancement[g].reason === "TIMING_CHANGED")).toBe(true);
    expect(result.metadata.snapshotGeneratedAt).toBe(base.generatedAt); expect(result.metadata.generatedAt).toBe(new Date(clock).toISOString());
    expect(result.baseBriefing).toBe(base);
  });
  it("API authenticates, checks origin/input and obtains the authoritative base exactly once", async () => {
    expect((await handleAdvice(req("/api/workspace/advice", { place: "geonames:1796236" }))).status).toBe(401);
    const a = await account(); const base = qualityBriefing();
    const getBriefing = vi.fn(async () => ({ data: base, error: null, status: 200 })); const enhance = vi.fn(enhanceBriefing);
    const deps = { getBriefing: getBriefing as never, enhanceBriefing: enhance };
    expect((await handleAdvice(req("/api/workspace/advice", { place: base.location.id }, a.token, "https://bad.example"), deps)).status).toBe(403);
    expect((await handleAdvice(req("/api/workspace/advice", { place: base.location.id, baseBriefing: {} }, a.token), deps)).status).toBe(400);
    const response = await handleAdvice(req("/api/workspace/advice", { place: base.location.id }, a.token), deps);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(getBriefing).toHaveBeenCalledTimes(1); expect(enhance.mock.calls[0][1]).toBe(base);
    const data = (await response.json()).data; expect(data.factsHash).toBe(requestHash(base)); expect(data.baseBriefing).toEqual(base);
    expect((await handleKnowledge(req("/api/workspace/knowledge?genre=street", undefined, a.token))).status).toBe(200);
    expect((await handleKnowledge(req("/api/workspace/knowledge?genre=street"))).status).toBe(401);
  });
});
