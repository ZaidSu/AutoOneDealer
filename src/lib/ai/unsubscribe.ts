// Does a customer's email say "stop emailing me"? Pure logic (no imports), unit tested directly.
/** True if the new part of their email is basically just a request to stop ("unsubscribe", "stop", "remove me"...). */
export function wantsNoMoreEmail(body: string): boolean {
  const text = body.trim().slice(0, 300).toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  if (/^(please\s+)?(unsubscribe|stop|remove me|opt[- ]?out)\b/.test(text)) return true;
  return /\b(unsubscribe|remove me from|take me off|stop (emailing|sending|contacting) me|do not (email|contact) me|don'?t (email|contact) me)\b/.test(text);
}
