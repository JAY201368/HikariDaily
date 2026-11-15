import { z } from 'zod';

const id = z.string().min(1).max(200).regex(/^[\w:-]+$/);
const text = z.string().max(500_000);
const short = z.string().max(1000);
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const annotation = z.object({
  type: z.enum(['pen', 'arrow', 'text', 'rectangle']),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  points: z.array(point).max(20_000).optional(),
  x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(),
  text: z.string().max(1000).optional(),
}).superRefine((value, ctx) => {
  const valid = value.type === 'text'
    ? value.x !== undefined && value.y !== undefined && value.text !== undefined
    : Boolean(value.points && value.points.length >= 2);
  if (!valid) ctx.addIssue({ code: 'custom', message: '批注内容不完整' });
});
export const referenceSchema = z.object({
  id, label: short, location: short, placeId: short, localDate: short, generatedAt: short,
  body: text, sources: z.array(z.object({ name: short, kind: short, fetchedAt: short.nullable(), status: short })).max(30),
});
export const photoSchema = z.object({
  id, assetId: z.string().regex(/^[a-f0-9]{64}$/), name: short, caption: text,
  annotations: z.array(annotation).max(5000),
  rotation: z.number().int().min(0).max(3).default(0),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) })
    .refine(crop => crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001, '裁剪超出原图').nullable().default(null),
});
export const planSchema = z.object({
  status: z.enum(['draft', 'planned', 'done']).default('draft'),
  id, title: short, date: z.string().max(10), location: short, genre: short,
  intent: text, notes: text, createdAt: z.number().nonnegative(), updatedAt: z.number().nonnegative(),
  schedule: z.array(z.object({ id, time: z.string().max(5), title: short, detail: text })).max(2000),
  checklist: z.array(z.object({ id, label: short, checked: z.boolean() })).max(2000),
  photos: z.array(photoSchema).max(500),
  extraPages: z.array(z.object({ id, title: short, text })).max(2000),
  references: z.array(referenceSchema).max(100).default([]),
  breaks: z.record(z.string().max(300), z.array(z.number().int().nonnegative()).max(2000)).default({}),
  copiedFrom: z.object({ id, updatedAt: z.number(), kind: z.enum(['import', 'conflict']) }).optional(),
});
export const notebookSchema = z.object({ version: z.literal(1), plans: z.array(planSchema).max(1000), trash: z.array(planSchema).max(1000) }).superRefine((value, ctx) => {
  const ids = [...value.plans, ...value.trash].map(plan => plan.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '计划标识重复' });
});
export type Plan = z.infer<typeof planSchema>;
export type Notebook = z.infer<typeof notebookSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Photo = z.infer<typeof photoSchema>;
export type NotebookSnapshot = { revision: number; operationId: string | null; notebook: Notebook };
export const emptyNotebook = (): Notebook => ({ version: 1, plans: [], trash: [] });
export function assetIds(notebook: Notebook) { return [...new Set([...notebook.plans, ...notebook.trash].flatMap(plan => plan.photos.map(photo => photo.assetId)))]; }

/** Provenance makes retries idempotent while keeping copied identities bounded. */
export function importNotebook(remote: Notebook, local: Notebook, prefix: 'import' | 'conflict' = 'import'): Notebook {
  const result = structuredClone(remote);
  const existing = [...result.plans, ...result.trash];
  for (const collection of ['plans', 'trash'] as const) {
    for (const plan of local[collection]) {
      if (prefix === 'conflict' && existing.some(item => JSON.stringify(item) === JSON.stringify(plan))) continue;
      if (existing.some(item => item.copiedFrom?.id === plan.id && item.copiedFrom.updatedAt === plan.updatedAt && item.copiedFrom.kind === prefix)) continue;
      const copy = { ...structuredClone(plan), id: crypto.randomUUID(), copiedFrom: { id: plan.id, updatedAt: plan.updatedAt, kind: prefix } };
      copy.breaks = Object.fromEntries(Object.entries(copy.breaks).map(([key, offsets]) => [key.replace(`plan/${plan.id}/`, `plan/${copy.id}/`), offsets]));
      result[collection].push(copy);
      existing.push(copy);
    }
  }
  return notebookSchema.parse(result);
}
