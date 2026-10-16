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
import postgres from "postgres";

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
  DEXSCREENER_BASE: `http://127.0.0.1:${API_PORT}`,
  GECKOTERMINAL_BASE: `http://127.0.0.1:${API_PORT}/gt`,
  GECKOTERMINAL_DELAY_MS: "0",
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
// Group chat needs several brains: give ii-02…ii-04 a copy of the mock brain.
{
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  await sql`
    insert into brains (influencer_id, version, files, prompt, prompt_tokens, model, posts_from, posts_to)
    select i.id, 1, b.files, replace(b.prompt, '@blknoiz06', '@' || i.handle), b.prompt_tokens, b.model, b.posts_from, b.posts_to
    from influencers i, (select * from brains where influencer_id = (select id from influencers where code = 'ii-01') order by version desc limit 1) b
    where i.code in ('ii-02', 'ii-03', 'ii-04') on conflict do nothing`;
  await sql`update influencers set status = 'ready', posts_parsed = 234, one_line_mind = 'Mock brain for local testing' where code in ('ii-02', 'ii-03', 'ii-04')`;
  await sql.end();
}
console.log(`\nMock stack is up. Start the site against it:\n\n  ${Object.entries(env).filter(([k]) => /DATABASE|LLM|II_/.test(k)).map(([k, v]) => `${k}=${v}`).join(" ")} pnpm dev\n`);
