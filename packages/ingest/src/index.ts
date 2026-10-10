import { OfficialXSource } from "./official-x";
import { TwitterApiIoSource } from "./twitterapi-io";
import type { XSource } from "./types";

export * from "./types";
export { ingestInfluencer, type IngestOptions, type IngestProgress, type IngestResult } from "./runner";
export { TwitterApiIoSource } from "./twitterapi-io";
export { OfficialXSource } from "./official-x";

/** X_SOURCE=twitterapi (default) | official */
export function createSource(): XSource {
  return process.env.X_SOURCE === "official" ? new OfficialXSource() : new TwitterApiIoSource();
}
