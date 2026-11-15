import "server-only";
const calls = new Map<string, Map<AbortController, number>>();
export function trackOwnerCall(ownerId: string, version: number, controller: AbortController): () => void {
    const set = calls.get(ownerId) ?? new Map<AbortController, number>();
    calls.set(ownerId, set);
    set.set(controller, version);
    return () => { set.delete(controller); if (!set.size)
        calls.delete(ownerId); };
}
export function cancelOwnerCalls(ownerId: string, beforeVersion = Infinity) {
    const set = calls.get(ownerId);
    for (const [controller, version] of set ?? [])
        if (version < beforeVersion) {
            controller.abort();
            set?.delete(controller);
        }
    if (!set?.size)
        calls.delete(ownerId);
}
