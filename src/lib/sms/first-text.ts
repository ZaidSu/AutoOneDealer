// What the very first text to a number looks like. Pure, so it is easy to test.
// - A customer who texted us first already knows who we are, so no business name in front (it only uses up characters).
// - A text WE start (a new lead, a follow-up) says who it is from, because phones show a number, not a name.
// - The first text always says how to opt out.
export function firstTextBody(body: string, o: { dealerName: string; sentBefore: boolean; theyTextedFirst: boolean }): string {
  let out = body.trim();
  if (o.sentBefore) return out;
  if (!o.theyTextedFirst && !out.toLowerCase().includes(o.dealerName.toLowerCase())) out = `${o.dealerName}: ${out}`;
  if (!/\bSTOP\b/.test(out)) out += " Reply STOP to opt out.";
  return out;
}
