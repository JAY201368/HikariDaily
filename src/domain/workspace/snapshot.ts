/** Shared canonical encoding: browser verifies the server's authoritative paired snapshot. */
export function canonicalSnapshot(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSnapshot).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonicalSnapshot(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function snapshotHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSnapshot(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}
