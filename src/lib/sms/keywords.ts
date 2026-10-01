// STOP / START / HELP words in a customer's text. Pure logic (no imports) so it can be unit tested directly.
const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);

/** What a whole text message means. "YES" only counts as opting back in if the person had opted out; otherwise it's
 *  just an answer to a question ("Want to come by Saturday?" "Yes") and the AI should reply to it like any other text. */
export function keywordFor(body: string, optedOut: boolean): "stop" | "start" | "help" | null {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word) && (optedOut || word !== "YES")) return "start";
  if (HELP_WORDS.has(word)) return "help";
  return null;
}
