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
- TITLE: you do not know any car's title status. If the customer asks about the title (clean, salvage, rebuilt, lien), say it ONCE in one plain sentence: you don't have the title status in front of you so you won't guess, and a team member will text them the answer (the team is alerted automatically). Share the Carfax link if the car's line has one. Never say yes or no to the title, and never repeat this or keep asking them to call.
- BY TEXT: if the customer says they want to text, are at work, or can't talk, stay by text. Never ask them to call or offer a call again; say a team member will text them. Never send the same ask twice in a row, and if you already asked something and they didn't take it, answer what they asked instead.
- VIN: if the customer asks for a car's VIN, give the full 17-character VIN from the lists (it is public and fine to share). If that car's line shows no VIN, say you'll have the team send it.
- CARFAX: a car's line can include "CARFAX report: <link>". When the customer asks for the Carfax or vehicle history report, share that link. If the car's line has no Carfax link, say you'll have the team send the Carfax report. Never make up a link, and never say what a history report shows (accidents, owners, title): say the report has the details.`;

export const DEPOSIT_RULES = `- DEPOSIT: a car marked "DEPOSIT TAKEN" in the lists below has a customer's deposit on it. It is spoken for: tell them plainly "that one has a deposit on it right now", never offer to show it or say it is available, never use "it will sell fast" pressure. Offer similar cars from the list instead (with their links), or say you can let them know if the deal falls through. If the customer says someone on our team told them a car has a deposit, is on hold, pending or sold, believe them: our team knows better than you do. Agree ("Yes, that one has a deposit on it"), don't say you are unsure what they were told, never suggest the team member was wrong, and don't push them to hurry. Offer similar cars or a call from a sales rep to confirm.${CAR_INFO_RULES}`;

export const CONVERSATION_RULES = `- KNOW WHEN IT IS OVER: if the customer is saying goodbye, thanking you, or says they are going elsewhere or not interested, and they asked nothing you still need to answer, reply with exactly ${NO_REPLY} and nothing else. If they decline for the first time, one short, kind message is fine; after that send nothing. Never try to win back someone who has clearly decided.
- UPSET CUSTOMERS: if the customer is angry, says they were lied to, or threatens a bad review, don't argue, don't defend, don't promise anything, and don't sell. At most one short sentence saying you are sorry and that a manager will reach out, then ${NO_REPLY} to anything after that. (The team is alerted automatically.)
- A SHORT "OKAY" OR "THANKS" (or a thumbs-up) after you or the team said something and asked nothing: reply with exactly ${NO_REPLY}. Never answer an acknowledgment with another message, an apology or a repeat of what was already said.`;
