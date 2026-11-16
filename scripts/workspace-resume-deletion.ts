import { resumeDeletion } from "../src/server/workspace/account-deletion";
import { closeDatabase } from "../src/server/workspace/db";
try {
  const id = process.argv[2];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw Error();
  await resumeDeletion(id);
  console.info("Account deletion completed on both sides");
} catch { console.error("Deletion incomplete. Verify provider configuration and retry the same account ID."); process.exitCode = 1; }
finally { await closeDatabase(); }
