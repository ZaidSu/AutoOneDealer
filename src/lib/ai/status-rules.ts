// Rules every AI prompt shares about cars that have a deposit on them, and about knowing when a conversation is over.
// Pure text and one check, so it is easy to test.

/** What the AI answers when the customer has already said goodbye and there is nothing left to say. */
export const NO_REPLY = "NO_REPLY";
export const isNoReply = (text: string) => /^\W*NO[ _-]?REPLY\W*$/i.test(String(text ?? "").trim());

/** A short "okay" / "thanks" / thumbs-up: the customer is just acknowledging, so there is nothing to answer. */
const ACK_CORE = new Set(["ok", "okay", "okey", "k", "kk", "thanks", "thank", "thx", "ty", "perfect", "great", "cool", "alright", "awesome", "nice", "noted", "understood", "gotcha", "appreciate", "appreciated", "helps", "got", "sounds"]);
const ACK_FILLER = new Set(["you", "so", "much", "very", "a", "lot", "it", "that", "will", "help", "do", "good", "sir", "maam"]);
export function isAcknowledgment(text: string): boolean {
  const raw = String(text ?? "");
  if (raw.includes("?")) return false;
  const words = raw.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return /\p{Extended_Pictographic}/u.test(raw); // only an emoji, like a thumbs-up
  if (words.length > 6) return false;
  return words.every((w) => ACK_CORE.has(w) || ACK_FILLER.has(w)) && words.some((w) => ACK_CORE.has(w));
}

/** The dealership's last message was asking something (so a short "okay" is an answer, not a goodbye). */
export const askedAQuestion = (text: string) => /\?/.test(String(text ?? "").replace(/reply stop[^.]*\.?/i, "").slice(-200));

/** True when the customer only said "okay" / "thanks" after a message that asked nothing: send no reply. */
export const staySilentAfter = (customerText: string, lastDealershipText: string | null | undefined) =>
  Boolean(lastDealershipText) && isAcknowledgment(customerText) && !askedAQuestion(String(lastDealershipText));

const CAR_INFO_RULES = `
- HOLDS: customers ask you to hold, save or reserve a car (for days, weeks or months). You cannot do that: never say yes, sure or "we'll hold it", and never say a car will still be there. A car is held only with a deposit (around $500, for 1 to 2 weeks) and only a sales rep can set that up. Say that plainly and that a rep will reach out to arrange it. Anything longer than 2 weeks isn't possible; the rep can go over options.
- NEVER PROMISE: no price, discount, "out the door" total, trade-in value, payment, interest rate, fees, taxes or registration cost; never say approved, pre-approved or guaranteed; never describe a car's condition or history (no accidents, runs great, no problems, warranty); never promise a rep will call at an exact time. Say a sales rep will go over it, or that a team member will confirm.
- PRIVATE INFO: if a customer starts sending a Social Security number, birth date, driver's license number, or card or bank numbers, ask them to wait and give it to the team by phone, not text. A city or zip code (for shipping) is fine.
- TITLE: you do not know any car's title status. If the customer asks about the title (clean, salvage, rebuilt, lien), say it ONCE in one plain sentence: you don't have the title status in front of you so you won't guess, and a team member will text them the answer (the team is alerted automatically). Share the Carfax link if the car's line has one. Never say yes or no to the title, and never repeat this or keep asking them to call.
- BY TEXT: if the customer says they want to text, are at work, or can't talk, stay by text. Never ask them to call or offer a call again; say a team member will text them. Never send the same ask twice in a row, and if you already asked something and they didn't take it, answer what they asked instead.
- VIN: if the customer asks for a car's VIN, give the full 17-character VIN from the lists (it is public and fine to share). If that car's line shows no VIN, say you'll have the team send it.
- CARFAX: a car's line can include "CARFAX report: <link>". When the customer asks for the Carfax or vehicle history report, share that link. If the car's line has no Carfax link, say you'll have the team send the Carfax report. Never make up a link, and never say what a history report shows (accidents, owners, title): say the report has the details.`;

export const DEPOSIT_RULES = `- DEPOSIT: a car marked "DEPOSIT TAKEN" in the lists below has a customer's deposit on it. It is spoken for: tell them plainly "that one has a deposit on it right now", never offer to show it or say it is available, never use "it will sell fast" pressure. Offer similar cars from the list instead (with their links), or say you can let them know if the deal falls through. If the customer says someone on our team told them a car has a deposit, is on hold, pending or sold, believe them: our team knows better than you do. Agree ("Yes, that one has a deposit on it"), don't say you are unsure what they were told, never suggest the team member was wrong, and don't push them to hurry. Offer similar cars or a call from a sales rep to confirm.${CAR_INFO_RULES}`;

export const CONVERSATION_RULES = `- KNOW WHEN IT IS OVER: if the customer is saying goodbye, thanking you, or says they are going elsewhere or not interested, and they asked nothing you still need to answer, reply with exactly ${NO_REPLY} and nothing else. If they decline for the first time, one short, kind message is fine; after that send nothing. Never try to win back someone who has clearly decided.
- UPSET CUSTOMERS: if the customer is angry, says they were lied to, or threatens a bad review, don't argue, don't defend, don't promise anything, and don't sell. At most one short sentence saying you are sorry and that a manager will reach out, then ${NO_REPLY} to anything after that. (The team is alerted automatically.)
- A SHORT "OKAY" OR "THANKS" (or a thumbs-up) after you or the team said something and asked nothing: reply with exactly ${NO_REPLY}. Never answer an acknowledgment with another message, an apology or a repeat of what was already said.`;

/** What the dealership charges per mile to ship a car, for the AI's estimates. */
export const DEFAULT_SHIPPING_PER_MILE = 1.5;
export function cleanShippingRate(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SHIPPING_PER_MILE;
  return Math.min(20, Math.round(n * 100) / 100);
}
export const shippingRule = (rate?: number) => `- SHIPPING: we ship cars. When a customer asks what shipping would cost, estimate the road miles from our lot to their city or zip, multiply by $${cleanShippingRate(rate).toFixed(2)} per mile, round to the nearest $25, and say it will be "around $X" and that it could be a bit more or a bit less, with the team confirming the exact price. Use ONLY this rate, even if other text in this prompt mentions a different per-mile price. A city and state (or a zip) is enough: never ask for a street address and never tell them not to share one. Don't promise a delivery date.`;

/** A last check on what the AI wrote: if it promised something only a person can promise, it is NOT sent on its own;
 *  it waits as a draft for the team. Returns why, or null when the reply is fine. */
export function riskyPromise(text: string): string | null {
  const t = String(text ?? "");
  if (/\bdeposit\b/i.test(t)) return null; // explaining the hold policy
  if (/\b(i|we)(?:'ll| will| can| could)\s+(?:go ahead and\s+)?(?:hold|save|reserve|keep|set aside|put aside)\b|\b(?:consider it|it'?s|it is)\s+(?:held|reserved|saved)\b|\b(?:hold|keep|save)\s+(?:it|that|this|the car|the [\w-]+)\s+for you\b/i.test(t)) return "promised to hold a car";
  if (/(?<!\bif |whether )\byou(?:'re| are| will be| will get)\s+(?:pre-?)?approved\b|\bguarantee(?:d)?\b/i.test(t)) return "promised an approval or a guarantee";
  if (!/\b(?:can'?t|cannot|don'?t|won'?t|unable|not able)\b/i.test(t) && /\b(?:accident[- ]free|no accidents|clean title|clean carfax|no issues|no problems)\b/i.test(t)) return "made a claim about the car's condition or history";
  if (/\b(?:we|i)(?:'ll| will)\s+(?:take|do|sell (?:it )?(?:to you )?for)\s+\$?\d/i.test(t)) return "agreed to a price";
  return null;
}
