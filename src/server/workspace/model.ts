import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { query, withOwnerLock } from "./db";
import { assertConfigVersion, checkConfigVersion } from "./config";
import { decryptCredential } from "./credentials";
import { trackOwnerCall } from "./inflight";
import { invalid, WorkspaceError } from "./errors";
import { modelTransport, type ModelTransport } from "./transport";
export const MODEL_BUDGETS = {
    advice: { calls: 1, timeoutMs: 60000, textBytes: 24 * 1024, images: 0, imageBytes: 0 },
    probe: { calls: 3, timeoutMs: 45000, textBytes: 24 * 1024, images: 4, imageBytes: 8 * 1024 * 1024 },
} as const;
export type ModelPurpose = keyof typeof MODEL_BUDGETS;
export type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null | ({
        type: "text";
        text: string;
    } | {
        type: "image_url";
        image_url: {
            url: string;
        };
    })[];
    tool_call_id?: string;
    tool_calls?: {
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }[];
};
export type ChatInput = {
    messages: ChatMessage[];
    tools?: {
        type: "function";
        function: {
            name: string;
            description?: string;
            parameters: Record<string, unknown>;
        };
    }[];
    tool_choice?: unknown;
    response_format?: {
        type: "json_object";
    };
};
const responseSchema = z.object({
    choices: z.array(z.object({ message: z.object({
            role: z.literal("assistant").optional(), content: z.string().nullable().optional(),
            tool_calls: z.array(z.object({ id: z.string().max(200), type: z.literal("function"), function: z.object({ name: z.string().max(200), arguments: z.string().max(64 * 1024) }) })).max(20).optional(),
        }) })).min(1).max(4),
    usage: z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), total_tokens: z.number().int().nonnegative().optional() }).optional(),
});
export type ChatResponse = z.infer<typeof responseSchema>;
export type ModelResult = {
    response: ChatResponse;
    configVersion: number;
    metrics: {
        durationMs: number;
        usage?: ChatResponse["usage"];
    };
};
function validateInput(input: ChatInput, purpose: ModelPurpose) {
    const budget = MODEL_BUDGETS[purpose];
    let imageBytes = 0, images = 0;
    let encoded: string;
    try {
        encoded = JSON.stringify(input, (_key, value) => {
            if (value && typeof value === "object" && value.type === "image_url") {
                const url = value.image_url?.url;
                if (typeof url !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url))
                    throw invalid();
                images++;
                imageBytes += Buffer.from(url.slice(url.indexOf(",") + 1), "base64").length;
                return { type: "image_url", image_url: { url: "[image]" } };
            }
            return value;
        });
    }
    catch {
        throw invalid();
    }
    if (!Array.isArray(input.messages) || !input.messages.length || Buffer.byteLength(encoded) > budget.textBytes || images > budget.images || imageBytes > budget.imageBytes)
        throw new WorkspaceError("MODEL_BUDGET_EXCEEDED", 413, "本轮模型输入超出限制");
    return { textBytes: Buffer.byteLength(encoded), images, imageBytes };
}
/** Each advice or capability check shares a bounded run budget. */
export async function createModelRun(ownerId: string, purpose: ModelPurpose, options: {
    transport?: ModelTransport;
    signal?: AbortSignal;
    /** Trusted service fence, inside the same owner transaction immediately before network dispatch. */
    authorize?: (client: PoolClient) => Promise<void>;
} = {}) {
    const { rows } = await query("SELECT c.version FROM model_configs c JOIN accounts a ON a.id=c.owner_id AND a.model_version=c.version WHERE c.owner_id=$1", [ownerId]);
    if (!rows[0])
        throw new WorkspaceError("MODEL_NOT_CONFIGURED", 503, "请先配置模型");
    const configVersion: number = rows[0].version;
    const budget = MODEL_BUDGETS[purpose];
    const deadline = Date.now() + budget.timeoutMs;
    let calls = 0;
    let totalText = 0, totalImages = 0, totalImageBytes = 0;
    return { configVersion, async call(input: ChatInput): Promise<ModelResult> {
            const size = validateInput(input, purpose);
            if (totalText + size.textBytes > budget.textBytes || totalImages + size.images > budget.images || totalImageBytes + size.imageBytes > budget.imageBytes)
                throw new WorkspaceError("MODEL_BUDGET_EXCEEDED", 413, "本轮模型输入超出限制");
            if (calls >= budget.calls || Date.now() >= deadline)
                throw new WorkspaceError("MODEL_BUDGET_EXCEEDED", 429, "本轮模型调用已达到限制");
            calls++;
            totalText += size.textBytes;
            totalImages += size.images;
            totalImageBytes += size.imageBytes;
            const controller = new AbortController();
            const release = trackOwnerCall(ownerId, configVersion, controller);
            const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
            const onAbort = () => controller.abort();
            options.signal?.addEventListener("abort", onAbort, { once: true });
            if (options.signal?.aborted)
                controller.abort();
            const start = Date.now();
            try {
                await checkConfigVersion(ownerId, configVersion);
                controller.signal.throwIfAborted();
                const { rows } = await query("SELECT endpoint,model,credential FROM model_configs WHERE owner_id=$1 AND version=$2", [ownerId, configVersion]);
                if (!rows[0]) {
                    await checkConfigVersion(ownerId, configVersion);
                    throw invalid();
                }
                const row = rows[0];
                const secret = decryptCredential(ownerId, configVersion, row.credential);
                // Narrow keys prevent arbitrary body overrides (model, credentials, output budget, URLs).
                const body = { model: row.model, messages: input.messages, ...(input.tools ? { tools: input.tools } : {}), ...(input.tool_choice ? { tool_choice: input.tool_choice } : {}), ...(input.response_format ? { response_format: input.response_format } : {}), max_tokens: purpose === "advice" ? 8192 : 4096, stream: false };
                const transport = options.transport ?? modelTransport;
                let stop: (() => void) | undefined;
                const aborted = new Promise<never>((_resolve, reject) => {
                    stop = () => reject(new WorkspaceError("MODEL_CANCELLED", 408, "模型调用已停止"));
                    controller.signal.addEventListener("abort", stop, { once: true });
                    if (controller.signal.aborted)
                        stop();
                });
                let raw: unknown;
                try {
                    raw = await Promise.race([transport(row.endpoint, secret, body, controller.signal, dispatch => withOwnerLock(ownerId, async client => {
                            await assertConfigVersion(client, ownerId, configVersion);
                            await options.authorize?.(client);
                            // No await between the final cancellation check and synchronous HTTP dispatch.
                            controller.signal.throwIfAborted();
                            dispatch();
                        })), aborted]);
                }
                finally {
                    if (stop)
                        controller.signal.removeEventListener("abort", stop);
                }
                await checkConfigVersion(ownerId, configVersion);
                controller.signal.throwIfAborted();
                if (Buffer.byteLength(JSON.stringify(raw) ?? "") > 256 * 1024)
                    throw invalid();
                const parsed = responseSchema.safeParse(raw);
                if (!parsed.success)
                    throw new WorkspaceError("MODEL_INVALID_RESPONSE", 502, "模型返回内容无法读取");
                return { response: parsed.data, configVersion, metrics: { durationMs: Date.now() - start, usage: parsed.data.usage } };
            }
            catch (error) {
                // Revocation wins over timeout/network errors; an uncancellable external response never commits.
                await checkConfigVersion(ownerId, configVersion);
                if (error instanceof WorkspaceError)
                    throw error;
                throw new WorkspaceError(controller.signal.aborted ? "MODEL_CANCELLED" : "MODEL_UNAVAILABLE", controller.signal.aborted ? 408 : 502, controller.signal.aborted ? "模型调用已停止" : "模型调用失败，请检查配置或稍后重试");
            }
            finally {
                clearTimeout(timer);
                release();
                options.signal?.removeEventListener("abort", onAbort);
            }
        } };
}
