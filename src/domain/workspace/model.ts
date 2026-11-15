import { z } from "zod";
export const capabilityStatus = z.enum(["untested", "available", "unavailable"]);
export const modelInputSchema = z.object({
    baseVersion: z.number().int().nonnegative(),
    baseUrl: z.string().min(1).max(2048),
    model: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/),
    apiKey: z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/),
}).strict();
export type CapabilityStatus = z.infer<typeof capabilityStatus>;
export type ModelCapabilities = Record<"text" | "image" | "tools", CapabilityStatus>;
export interface ModelConfigView {
    configured: boolean;
    version: number;
    baseUrl: string | null;
    model: string | null;
    capabilities: ModelCapabilities;
}
