import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transaction } from "./db";
/** Add monotonically named SQL files; applied contents are immutable. */
export async function migrate() {
    const directory = fileURLToPath(new URL("./migrations/", import.meta.url));
    const files = (await readdir(directory)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort();
    await transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(74190101)");
        await client.query("CREATE TABLE IF NOT EXISTS workspace_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
        for (const file of files) {
            if ((await client.query("SELECT 1 FROM workspace_migrations WHERE version=$1", [file])).rowCount)
                continue;
            await client.query(await readFile(`${directory}/${file}`, "utf8"));
            await client.query("INSERT INTO workspace_migrations(version) VALUES($1)", [file]);
        }
    });
}
