import { readFile } from "node:fs/promises";
import { closeDatabase } from "../src/server/workspace/db";
import { importKnowledge, withdrawKnowledge } from "../src/server/workspace/knowledge";
const [command, target, version] = process.argv.slice(2);
try {
  if (command === "import" && target) {
    const result = await importKnowledge(JSON.parse(await readFile(target, "utf8")));
    console.log(JSON.stringify(result));
  } else if (command === "withdraw" && target && /^[1-9]\d*$/.test(version ?? "")) {
    console.log(JSON.stringify(await withdrawKnowledge(target, Number(version))));
  } else { console.error("Usage: workspace:knowledge import <file.json> | withdraw <source-id> <current-version>"); process.exitCode = 1; }
} catch { console.error("Knowledge operation failed; check input, version and database configuration."); process.exitCode = 1; }
finally { await closeDatabase(); }
