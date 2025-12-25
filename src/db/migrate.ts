import { MikroORM } from "@mikro-orm/core";
import config from "../mikro-orm.config";

const extractName = (m: unknown): string => {
  if (typeof m === "string") return m;
  if (m && typeof m === "object") {
    const o = m as Record<string, unknown>;
    return (
      (o.name as string | undefined) ??
      (o.fileName as string | undefined) ??
      (o.className as string | undefined) ??
      (o.filename as string | undefined) ??
      String(m)
    );
  }
  return String(m);
};

const run = async () => {
  const orm = await MikroORM.init(config);
  const migrator = orm.getMigrator();

  const action = process.argv[2] || "up";
  if (action === "list") {
    const executed: unknown[] = await migrator.getExecutedMigrations();
    const pending: unknown[] = await migrator.getPendingMigrations();
    console.log("Executed migrations (ORM):");
    executed.forEach((m) => console.log(" -", extractName(m)));
    console.log("Pending migrations (ORM):");
    pending.forEach((m) => console.log(" -", extractName(m)));
    console.log("Recorded migrations (DB):");
    await orm.close(true);
    return;
  }

  if (action === "up") {
    console.log("Running migrations (up)...");
    await migrator.up();
    // Record any newly applied migrations in DB
    console.log("Migrations complete.");
    await orm.close(true);
    return;
  }

  if (action === "down") {
    const opts = process.argv.slice(3);
    const all = opts.includes("--all");
    const namesArgIndex = opts.findIndex((o) => o === "--names");
    const names =
      namesArgIndex >= 0 && opts[namesArgIndex + 1]
        ? opts[namesArgIndex + 1].split(",")
        : [];

    const executed: unknown[] = await migrator.getExecutedMigrations();
    const executedNames: string[] = executed.map(extractName);

    if (executedNames.length === 0) {
      console.log("No executed migrations to rollback.");
      await orm.close(true);
      return;
    }

    if (all) {
      console.log("Reverting all migrations...");
      while ((await migrator.getExecutedMigrations()).length > 0) {
        await migrator.down();
      }
      console.log("All migrations reverted.");
      await orm.close(true);
      return;
    }

    if (names.length > 0) {
      const indices: number[] = [];
      names.forEach((t) => {
        const idx = executedNames.findIndex((n) => n.includes(t) || n === t);
        if (idx === -1) {
          console.warn(`Migration name not found in executed list: ${t}`);
        } else {
          indices.push(idx);
        }
      });
      if (indices.length === 0) {
        console.log("No matching migrations to revert.");
        await orm.close(true);
        return;
      }
      indices.sort((a, b) => b - a);
      let currentExecuted: unknown[] = await migrator.getExecutedMigrations();
      let currentExecutedNames: string[] = currentExecuted.map(extractName);
      for (const targetIdx of indices) {
        const targetName = executedNames[targetIdx];
        const idx = currentExecutedNames.findIndex(
          (n) => n.includes(targetName) || n === targetName
        );
        if (idx === -1) continue;
        const steps = currentExecutedNames.length - idx;
        console.log(
          `Reverting ${steps} steps to remove migration ${targetName}...`
        );
        for (let i = 0; i < steps; i++) {
          await migrator.down();
        }
        currentExecuted = await migrator.getExecutedMigrations();
        currentExecutedNames = currentExecuted.map(extractName);
      }
      // sync DB recorded list
      console.log("Selected migrations reverted.");
      await orm.close(true);
      return;
    }

    console.log("Reverting last migration...");
    await migrator.down();
    // sync DB recorded list
    console.log("Reverted one migration.");
    await orm.close(true);
    return;
  }

  console.error(
    "Unknown action. Use: up | down | list. For down use --all or --names name1,name2"
  );
  await orm.close(true);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
