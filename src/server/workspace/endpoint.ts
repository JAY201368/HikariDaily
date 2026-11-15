import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { invalid, WorkspaceError } from "./errors";
export type PinnedAddress = {
    address: string;
    family: 4 | 6;
};
export type Resolver = (hostname: string) => Promise<readonly {
    address: string;
    family: number;
}[]>;
function v4Public(address: string): boolean {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113));
}
export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4)
        return v4Public(address);
    if (family !== 6 || address.includes("%") || address.includes("."))
        return false;
    const parts = address.toLowerCase().split("::");
    if (parts.length > 2)
        return false;
    const left = parts[0].split(":").filter(Boolean);
    const right = (parts[1] ?? "").split(":").filter(Boolean);
    const words = [...left, ...Array(parts.length === 2 ? 8 - left.length - right.length : 0).fill("0"), ...right].map(x => parseInt(x, 16));
    if (words.length !== 8 || words[0] < 0x2000 || words[0] > 0x3fff)
        return false;
    // Global unicast only; exclude transition, protocol assignment and documentation ranges.
    if (words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8))
        return false;
    if (words[0] === 0x2002 || (words[0] === 0x3fff && words[1] < 0x1000))
        return false;
    return true;
}
export function normalizeEndpoint(input: string): string {
    try {
        if (input !== input.trim() || input.includes("\\") || /[\x00-\x20\x7f]/.test(input))
            throw Error();
        const url = new URL(input);
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443"))
            throw Error();
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        if (hostname.endsWith(".") || hostname === "localhost" || (isIP(hostname) && !isPublicAddress(hostname)))
            throw Error();
        if (!/^\/[a-zA-Z0-9/_~.-]*$/.test(url.pathname))
            throw Error();
        const path = url.pathname.replace(/\/+$/, "");
        url.pathname = path.endsWith("/chat/completions") ? path : `${path}/chat/completions`;
        return url.href;
    }
    catch {
        throw invalid();
    }
}
export async function pinEndpoint(input: string, resolver: Resolver = hostname => lookup(hostname, { all: true, verbatim: true })): Promise<{
    url: URL;
    addresses: PinnedAddress[];
}> {
    const url = new URL(normalizeEndpoint(input));
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: readonly {
        address: string;
        family: number;
    }[];
    try {
        addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolver(hostname);
    }
    catch {
        throw new WorkspaceError("MODEL_ENDPOINT_UNAVAILABLE", 502, "模型端点无法连接");
    }
    if (!addresses.length || addresses.some(x => !isPublicAddress(x.address) || x.family !== isIP(x.address)))
        throw invalid();
    return { url, addresses: addresses as PinnedAddress[] };
}
