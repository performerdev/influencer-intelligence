import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { InfluencerRow, Sql } from "@ii/db";

import { latestBrain } from "./assemble";
import { day } from "./format";

export const brainDirName = (inf: { code: string; handle: string }) => `${inf.code}-${inf.handle.toLowerCase()}`;
const postUrl = (handle: string, id: string) => `https://x.com/${handle}/status/${id}`;

/**
 * Write the open brain files for one intelligence into <root>/brains/ii-XX-handle/.
 * Post IDs and short call quotes only — no full post texts (X's terms).
 */
export async function exportBrain(sql: Sql, inf: InfluencerRow, root: string) {
  const brain = await latestBrain(sql, inf.id);
  if (!brain) return null;
  const f = brain.files;
  const dir = join(root, "brains", brainDirName(inf));
  mkdirSync(dir, { recursive: true });

  const write = (name: string, body: string) => writeFileSync(join(dir, name), body.endsWith("\n") ? body : `${body}\n`);
  const json = (v: unknown) => JSON.stringify(v, null, 2);

  write("mind.md", f.mind);
  write("rules.md", f.rules);
  write("voice.md", f.voice);
  write("identity.md", f.identity);
  write(
    "calls.json",
    json(
      f.calls.map((c) => ({
        date: day(c.called_at),
        ticker: c.ticker,
        chain: c.chain === "evm" ? "evm" : c.chain,
        address: c.address,
        direction: c.direction,
        quote: c.quote,
        post_id: c.post_id,
        url: postUrl(inf.handle, c.post_id),
      })),
    ),
  );
  write("stats.json", json(f.stats ?? { computed_at: null, note: "not computed yet" }));
  write("examples.json", json(f.example_ids.map((id) => ({ post_id: id, url: postUrl(inf.handle, id) }))));
  write(
    "brain.json",
    json({
      code: inf.code,
      handle: inf.handle,
      version: brain.version,
      distilled_at: new Date(brain.created_at).toISOString(),
      model: brain.model,
      prompt_tokens_estimate: brain.prompt_tokens,
      posts_parsed: inf.posts_parsed,
      posts_from: inf.first_post_at ? day(inf.first_post_at) : null,
      posts_to: inf.last_post_at ? day(inf.last_post_at) : null,
      one_line_mind: f.one_line_mind,
      calls_tracked: f.calls.length,
      files: ["identity.md", "mind.md", "rules.md", "voice.md", "examples.json", "calls.json", "stats.json"],
    }),
  );
  return dir;
}
