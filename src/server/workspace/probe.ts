import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { storeCapabilities, untestedCapabilities } from "./config";
import { createModelRun, type ChatInput } from "./model";
import type { ModelTransport } from "./transport";
import { WorkspaceError } from "./errors";
function crc32(value: Buffer) { let crc = 0xffffffff; for (const byte of value) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
} return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) { const body = Buffer.concat([Buffer.from(type), data]); const head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE(crc32(body)); return Buffer.concat([head, body, tail]); }
function imageChallenge() {
    const colors: [
        string,
        number[]
    ][] = [["red", [255, 0, 0]], ["green", [0, 255, 0]], ["blue", [0, 0, 255]], ["yellow", [255, 255, 0]]];
    // Random arrangement is absent from text; success requires interpreting the actual image.
    for (let i = 3; i > 0; i--) {
        const j = randomBytes(1)[0] % (i + 1);
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    const rows: Buffer[] = [];
    for (let y = 0; y < 64; y++) {
        const row = Buffer.alloc(1 + 64 * 3);
        for (let x = 0; x < 64; x++) {
            const rgb = colors[(y >= 32 ? 2 : 0) + (x >= 32 ? 1 : 0)][1];
            for (let c = 0; c < 3; c++)
                row[1 + x * 3 + c] = rgb[c];
        }
        rows.push(row);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(64);
    header.writeUInt32BE(64, 4);
    header[8] = 8;
    header[9] = 2;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
    return { url: `data:image/png;base64,${png.toString("base64")}`, expected: colors.map(c => c[0]).join(",") };
}
export async function probeModel(ownerId: string, options: {
    transport?: ModelTransport;
    signal?: AbortSignal;
} = {}) {
    const run = await createModelRun(ownerId, "probe", options);
    const capabilities = untestedCapabilities();
    const token = randomUUID();
    const image = imageChallenge();
    const cases: {
        key: keyof typeof capabilities;
        input: ChatInput;
        validate: (response: Awaited<ReturnType<typeof run.call>>["response"]) => boolean;
    }[] = [
        { key: "text", input: { messages: [{ role: "user", content: `Reply with exactly this token: ${token}` }] }, validate: r => r.choices[0].message.content?.trim() === token },
        { key: "image", input: { messages: [{ role: "user", content: [{ type: "text", text: "Name the four square colors in reading order (top left, top right, bottom left, bottom right). Reply only four lowercase English color names separated by commas." }, { type: "image_url", image_url: { url: image.url } }] }] }, validate: r => r.choices[0].message.content?.trim().toLowerCase().replace(/\s/g, "") === image.expected },
        { key: "tools", input: { messages: [{ role: "user", content: `Call capability_check with token ${token}.` }], tools: [{ type: "function", function: { name: "capability_check", parameters: { type: "object", properties: { token: { type: "string", enum: [token] } }, required: ["token"], additionalProperties: false } } }], tool_choice: { type: "function", function: { name: "capability_check" } } }, validate: r => { const calls = r.choices[0].message.tool_calls; if (calls?.length !== 1 || calls[0].function.name !== "capability_check")
                return false; try {
                return JSON.parse(calls[0].function.arguments).token === token;
            }
            catch {
                return false;
            } } },
    ];
    for (const probe of cases) {
        try {
            capabilities[probe.key] = probe.validate((await run.call(probe.input)).response) ? "available" : "unavailable";
        }
        catch (error) {
            // Only capability incompatibility is a probe result. Authentication, quota,
            // rate limits, cancellation and transport failures remain actionable API errors.
            if (!(error instanceof WorkspaceError) || !["MODEL_REQUEST_REJECTED", "MODEL_INVALID_RESPONSE"].includes(error.code))
                throw error;
            capabilities[probe.key] = "unavailable";
        }
    }
    await storeCapabilities(ownerId, run.configVersion, capabilities);
    return { version: run.configVersion, capabilities };
}
