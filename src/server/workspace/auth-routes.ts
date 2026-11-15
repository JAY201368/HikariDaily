import "server-only";
import { z } from "zod";
import { changePassword, cookieHeader, deleteAccount, login, logout, parseCredentials, register, requireAccount } from "./auth";
import { invalid } from "./errors";
import { json, rateLimit, readJson, requireSameOrigin, route } from "./http";
export type AuthAction = "register" | "login" | "logout" | "session" | "password" | "account";
export function handleAuth(action: AuthAction, request: Request) {
    return route(async () => {
        if (action === "session")
            return json(await requireAccount(request));
        requireSameOrigin(request);
        if (action === "register" || action === "login") {
            // Stable global cap cannot be bypassed with forged cookies / forwarded addresses.
            await rateLimit(`auth-global:${action}`, action === "register" ? 30 : 120);
            const input = parseCredentials(await readJson(request));
            await rateLimit(`auth-user:${action}:${input.username}`, action === "register" ? 5 : 10);
            const result = await (action === "register" ? register(input) : login(input));
            return json(result.account, action === "register" ? 201 : 200, { "Set-Cookie": cookieHeader(result.token) });
        }
        const account = await requireAccount(request);
        await rateLimit(`auth:${action}:${account.id}`, action === "logout" ? 60 : 10);
        if (action === "logout") {
            await logout(request);
            return json({ loggedOut: true }, 200, { "Set-Cookie": cookieHeader(null) });
        }
        if (action === "password") {
            const input = z.object({ currentPassword: z.string().max(256), nextPassword: z.string().min(12).max(256) }).strict().safeParse(await readJson(request));
            if (!input.success)
                throw invalid();
            const token = await changePassword(account.id, input.data.currentPassword, input.data.nextPassword);
            return json({ changed: true }, 200, { "Set-Cookie": cookieHeader(token) });
        }
        const input = z.object({ password: z.string().max(256) }).strict().safeParse(await readJson(request));
        if (!input.success)
            throw invalid();
        await deleteAccount(account.id, input.data.password);
        return json({ deleted: true }, 200, { "Set-Cookie": cookieHeader(null) });
    });
}
