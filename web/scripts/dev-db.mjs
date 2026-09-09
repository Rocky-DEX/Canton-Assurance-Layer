// A Postgres for local development, downloaded into node_modules rather than
// installed on the machine. Production and CI use the Postgres in
// docker-compose.yml; this exists so `npm run dev` works on a laptop with
// nothing but Node installed.
//
//   npm run db:dev            # start (idempotent), prints DATABASE_URL, stays up
//
import EmbeddedPostgres from "embedded-postgres";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../.devdb/data");
const port = Number(process.env.DEV_DB_PORT ?? 54329);
const user = "canton";
const password = "canton";
const database = "canton";

mkdirSync(dirname(dataDir), { recursive: true });
const fresh = !existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
  onLog: () => {},
  onError: (m) => console.error(String(m)),
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(database);

const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
console.log(`dev postgres ready\nDATABASE_URL=${url}`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
