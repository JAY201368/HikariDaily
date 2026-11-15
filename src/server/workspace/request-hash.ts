import "server-only";
import { createHash } from "node:crypto";
import { canonicalSnapshot } from "../../domain/workspace/snapshot";
export const requestHash = (value: unknown) => createHash("sha256").update(canonicalSnapshot(value)).digest("hex");
