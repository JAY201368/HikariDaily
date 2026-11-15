import "server-only";
import { z } from "zod";
import { requireAccount } from "./auth";
import { deleteModelConfig, getModelConfig, putModelConfig } from "./config";
import { invalid } from "./errors";
import { json, rateLimit, readJson, requireSameOrigin, route } from "./http";
import { probeModel } from "./probe";
export function handleModel(action: "get" | "put" | "delete" | "probe", request: Request) {
    return route(async () => {
        if (action !== "get")
            requireSameOrigin(request);
        const account = await requireAccount(request);
        if (action === "get")
            return json(await getModelConfig(account.id));
        await rateLimit(`model:${action}:${account.id}`, action === "probe" ? 5 : 30);
        if (action === "probe")
            return json(await probeModel(account.id, { signal: request.signal }));
        if (action === "put")
            return json(await putModelConfig(account.id, await readJson(request)));
        const input = z.object({ baseVersion: z.number().int().nonnegative() }).strict().safeParse(await readJson(request));
        if (!input.success)
            throw invalid();
        return json(await deleteModelConfig(account.id, input.data.baseVersion));
    });
}
