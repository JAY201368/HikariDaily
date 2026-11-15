import { migrate } from "../src/server/workspace/migrate";
import { closeDatabase } from "../src/server/workspace/db";
try {
    await migrate();
    console.info("Workspace migrations applied");
}
catch {
    console.error("Workspace migration failed; verify database availability and migration history");
    process.exitCode = 1;
}
finally {
    await closeDatabase();
}
