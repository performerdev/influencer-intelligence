/** "All minds", shared by the server and the browser. */

/** What a mind answers when its posts give it no view (same as NO_VIEW in brain-core). */
export const NO_VIEW = "NO_VIEW";
/** The summary is stored as an assistant message with no mind and this round. */
export const SUMMARY_ROUND = 9;

/** One mind's record on the coin the question names: computed by code from its priced calls. */
export type CoinRecord = { ticker: string; calls: number; priced: number; worked: number | null; med: number | null };
