/**
 * Applies the hand-written SQL in drizzle/manual/ without needing psql.
 *
 *   npm run db:manual                     -- applies 0007 and 0008
 *   npm run db:manual -- drizzle/manual/0005_grants.sql
 *   npm run db:manual -- --all            -- 0001 through 0008, in order
 *
 * Connects as careflow_owner (CAREFLOW_OWNER_URL_UNPOOLED). Every file in
 * drizzle/manual/ is written to run as the owner, and 0007's row-level
 * security means most of them cannot work as careflow_app.
 *
 * Two things this does that a plain "paste it into a SQL console" does not:
 *
 *  1. Substitutes psql's `:'name'` variable syntax, which only
 *     0001_extensions_and_roles.sql uses, from the matching environment
 *     variable. psql is the only client that understands that syntax, and
 *     this project does not otherwise require psql to be installed.
 *  2. Sends each file as a single simple-query message, so a file is one
 *     implicit transaction and a failure half-way leaves nothing behind.
 *
 * Ordering and prerequisites are documented in drizzle/manual/README.md.
 * This script does not enforce them — it applies what it is given, in the
 * order given.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { config } from "dotenv";
import { Client } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });

/** Applied when no files are named: the two Phase 03 migrations. */
const DEFAULT_FILES = [
  "drizzle/manual/0007_row_level_security.sql",
  "drizzle/manual/0008_impersonation_audit.sql",
];

const ALL_FILES = [
  "drizzle/manual/0001_extensions_and_roles.sql",
  "drizzle/manual/0002_audit_log.sql",
  "drizzle/manual/0003_no_double_booking.sql",
  "drizzle/manual/0004_follow_ups_view.sql",
  "drizzle/manual/0005_grants.sql",
  "drizzle/manual/0006_audit_log_actor_nullable.sql",
  ...DEFAULT_FILES,
];

/**
 * psql's `:'variable'` interpolation, resolved from the environment.
 *
 * Values are single-quoted and internal quotes doubled, which is the SQL
 * literal escape — the same thing psql does. These are passwords being
 * written into a CREATE ROLE statement; they cannot be bound as parameters
 * because a simple-query message takes none.
 */
function substitute(sql: string, file: string): string {
  return sql.replace(/:'([A-Za-z_][A-Za-z0-9_]*)'/g, (_match, name: string) => {
    const value = process.env[name.toUpperCase()] ?? process.env[name];
    if (!value) {
      throw new Error(
        `${file} needs the psql variable :'${name}', which means the environment variable ` +
          `${name.toUpperCase()} must be set. It becomes a role password; pick a strong one and ` +
          `keep it — it is what CAREFLOW_OWNER_URL_UNPOOLED and DATABASE_URL are built from.`,
      );
    }
    return `'${value.replace(/'/g, "''")}'`;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const files = args.includes("--all")
    ? ALL_FILES
    : args.length > 0
      ? args
      : DEFAULT_FILES;

  const url = process.env.CAREFLOW_OWNER_URL_UNPOOLED;
  if (!url) {
    console.error(
      "apply-sql: CAREFLOW_OWNER_URL_UNPOOLED is not set.\n" +
        "It must be the careflow_owner role's direct (unpooled) connection string.\n" +
        "See drizzle/manual/README.md, 'Which connection string, in practice'.",
    );
    process.exit(1);
  }

  const client = new Client(url);
  await client.connect();

  try {
    const who = await client.query("SELECT current_user AS role, current_database() AS db");
    console.log(`apply-sql: connected to ${who.rows[0].db} as ${who.rows[0].role}\n`);

    for (const file of files) {
      const path = join(process.cwd(), file);
      const sql = substitute(readFileSync(path, "utf8"), file);
      process.stdout.write(`  ${file} ... `);
      await client.query(sql);
      console.log("ok");
    }

    console.log(`\napply-sql: applied ${files.length} file(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("\napply-sql: FAILED.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
