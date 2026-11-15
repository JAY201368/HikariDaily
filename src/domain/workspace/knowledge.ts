import { z } from "zod";
import { GenreSchema } from "../schemas";
const id = z.string().regex(/^[a-z][a-z0-9-]{2,79}$/);
const tags = z.array(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)).max(30);
export const knowledgeConditionsSchema = z.strictObject({
  genres: z.array(GenreSchema).min(1), phases: tags, characters: tags,
  weather: tags, equipment: tags, aesthetics: tags, excludedRisks: tags,
});
export const knowledgeSourceSchema = z.strictObject({
  id, version: z.number().int().positive(), title: z.string().min(1).max(200),
  author: z.string().min(1).max(200), sourceFile: z.string().min(1).max(400),
  permission: z.literal("CC BY 4.0"), permissionUrl: z.literal("https://creativecommons.org/licenses/by/4.0/"),
  updatedAt: z.iso.datetime({ offset: true }), original: z.literal(true),
});
export const knowledgeChunkSchema = z.strictObject({
  id, locator: z.string().min(1).max(200), title: z.string().min(1).max(160),
  text: z.string().min(1).max(1800), topics: tags.min(1), keywords: z.array(z.string().min(1).max(40)).max(30),
  conditions: knowledgeConditionsSchema,
});
export const knowledgeImportSchema = z.strictObject({ source: knowledgeSourceSchema, chunks: z.array(knowledgeChunkSchema).min(1).max(500) })
  .refine(v => new Set(v.chunks.map(c => c.id)).size === v.chunks.length, "条目ID不可重复");
export const knowledgeReferenceSchema = z.strictObject({ sourceId: id, chunkId: id, version: z.number().int().positive() });
export type KnowledgeImport = z.infer<typeof knowledgeImportSchema>;
export type KnowledgeReference = z.infer<typeof knowledgeReferenceSchema>;
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;
export type KnowledgeEvidence = KnowledgeChunk & { source: z.infer<typeof knowledgeSourceSchema> };
export type KnowledgeContext = { genre: z.infer<typeof GenreSchema>; phases: string[]; characters: string[]; weather: string[]; equipment: string[]; aesthetics: string[]; risks: string[] };
