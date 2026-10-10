/**
 * Local site with real-shaped data and no keys: in-process Postgres + mock
 * APIs, then builds ii-01 from the fake account. Leave it running, and in a
 * second terminal start the site against it (the command is printed below).
 *
 *   pnpm dev:mock
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { API_PORT, api } from "./mocks";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PG_PORT = Number(process.env.MOCK_PG_PORT ?? 54329);

const env = {
  II_SKIP_DOTENV: "1",
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
  DATABASE_SSL: "disable",
  DATABASE_POOL_MAX: "1",
  TWITTERAPI_IO_KEY: "test-key",
  TWITTERAPI_IO_BASE_URL: `http://127.0.0.1:${API_PORT}`,
  TWITTERAPI_IO_MIN_INTERVAL_MS: "0",
  LLM_BASE_URL: `http://127.0.0.1:${API_PORT}`,
  LLM_API_KEY: "test",
  PRICE_API_BASE: `http://127.0.0.1:${API_PORT}`,
  DISTILL_BATCH_TOKENS: "1500",
  II_EXPORT_ROOT: "/tmp/ii-mock-export",
};

const pg = await PGlite.create();
await new PGLiteSocketServer({ db: pg, port: PG_PORT, host: "127.0.0.1", maxConnections: 20 }).start();
await new Promise<void>((r) => api.listen(API_PORT, "127.0.0.1", r));
await new Promise<void>((resolve, reject) => {
  const p = spawn(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "scripts/cli.ts"), "build", "blknoiz06", "--max-usd", "5"], { cwd: ROOT, env: { ...process.env, ...env }, stdio: "inherit" });
  p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
});
console.log(`\nMock stack is up. Start the site against it:\n\n  ${Object.entries(env).filter(([k]) => /DATABASE|LLM|II_/.test(k)).map(([k, v]) => `${k}=${v}`).join(" ")} pnpm dev\n`);
