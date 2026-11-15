import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { unavailable } from "./errors";
type Ciphertext = {
    keyId: string;
    iv: string;
    tag: string;
    data: string;
};
function keys(): [
    string,
    Buffer
][] {
    try {
        const entries = Object.entries(JSON.parse(process.env.HIKARI_CREDENTIAL_KEYS ?? "{}"));
        if (!entries.length)
            throw Error();
        return entries.map(([id, value]) => {
            if (!/^[\w-]{1,64}$/.test(id) || typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
                throw Error();
            const key = Buffer.from(value, "base64");
            if (key.length !== 32)
                throw Error();
            return [id, key];
        });
    }
    catch {
        throw unavailable();
    }
}
export function encryptCredential(ownerId: string, version: number, secret: string): Ciphertext {
    const [keyId, key] = keys()[0];
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`${ownerId}:${version}`));
    const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return { keyId, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}
export function decryptCredential(ownerId: string, version: number, value: Ciphertext): string {
    try {
        const key = keys().find(([id]) => id === value.keyId)?.[1];
        if (!key)
            throw Error();
        const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
        cipher.setAAD(Buffer.from(`${ownerId}:${version}`));
        cipher.setAuthTag(Buffer.from(value.tag, "base64"));
        return Buffer.concat([cipher.update(Buffer.from(value.data, "base64")), cipher.final()]).toString("utf8");
    }
    catch {
        throw unavailable();
    }
}
