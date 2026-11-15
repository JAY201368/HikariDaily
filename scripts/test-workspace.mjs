import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Never load a user's ordinary .env or silently fall back to the application database.
let isolated = false;
try {
  const target = new URL(process.env.HIKARI_TEST_DATABASE_URL ?? "");
  isolated = ["postgres:", "postgresql:"].includes(target.protocol) && /test/i.test(decodeURIComponent(target.pathname));
} catch { /* Invalid input is reported without echoing a connection string. */ }
if (!isolated) {
  console.error("Set HIKARI_TEST_DATABASE_URL to an explicitly isolated PostgreSQL database whose name contains test. This command does not load .env files.");
  process.exit(1);
}
// Corpus revision and withdrawal tests share knowledge state and run serially.
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)), "run", ...process.argv.slice(2), "--fileParallelism=false"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
  env: { ...process.env, HIKARI_DATABASE_URL: process.env.HIKARI_TEST_DATABASE_URL },
});
if (result.error) { console.error("Unable to start the workspace verification process"); process.exit(1); }
process.exit(result.status ?? 1);
