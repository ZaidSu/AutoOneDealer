// OfferUp: when a buyer messages about a car, OfferUp emails the dealership from a private address like
// "Zaid (OfferUp) <reply-808138aa...@messages.offerup.com>" with the subject "Re: 2015 Nissan Murano".
// Replying to that address sends the answer to the buyer inside OfferUp. There is no phone number or real email in these emails.
// No project imports other than the HTML helper (unit tested directly).
import { htmlToText } from "./html.ts";

export type OfferUpMessage = {
  /** The buyer's name as OfferUp shows it. */
  name: string;
  /** Where to send the answer: OfferUp passes mail sent here on to the buyer. */
  replyAddress: string;
  /** What the buyer wrote. */
  message: string;
  /** The car they asked about, from the subject ("2015 Nissan Murano"). */
  vehicle: string;
  /** The asking price OfferUp prints under the car, if any. */
  listedPrice: number | null;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const Q = "[\\u201C\\u201D\"]"; // curly or straight quote

/** Reads one OfferUp buyer-message email. Returns null for anything else (OfferUp's promotions come from other addresses). */
export function parseOfferUp(email: { from: string; subject?: string; text?: string; html?: string }): OfferUpMessage | null {
  const replyAddress = /<?(reply-[A-Za-z0-9._-]+@messages\.offerup\.com)>?/i.exec(email.from)?.[1]?.toLowerCase();
  if (!replyAddress) return null;

  const name = email.from.replace(/<[^>]*>/, "").replace(/\(OfferUp\)/i, "").replace(/["']/g, "").trim() || "OfferUp buyer";
  const vehicle = String(email.subject ?? "").replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim();

  // The plain-text part, or the HTML turned into text if the plain part doesn't have the message.
  // (&ldquo; and &rdquo; aren't known to the shared HTML helper, so the curly quotes are put in first.)
  const htmlText = email.html ? htmlToText(email.html.replace(/&ldquo;/gi, "\u201C").replace(/&rdquo;/gi, "\u201D")) : "";
  const bodies = [email.text ?? "", htmlText].map((b) => b.replace(/\r/g, "")).filter((b) => b.trim());
  for (const body of bodies) {
    const afterCar = vehicle ? new RegExp(`${esc(name)}\\s*:\\s*${Q}([\\s\\S]*?)${Q}\\s*\\n\\s*${esc(vehicle)}`, "i").exec(body) : null;
    const byName = new RegExp(`${esc(name)}\\s*:\\s*${Q}([\\s\\S]*?)${Q}\\s*(?:\\n|$)`, "i").exec(body);
    // Last resort: the first quoted block after the "Respond to ... by simply replying" line.
    const from = body.search(/respond to .{1,80} by simply replying/i);
    const firstQuote = new RegExp(`${Q}([^\\u201C\\u201D"]{1,2000})${Q}`).exec(from >= 0 ? body.slice(from) : body);
    const message = (afterCar?.[1] ?? byName?.[1] ?? firstQuote?.[1] ?? "").trim();
    if (!message) continue;
    const price = /\$\s*([\d,]+(?:\.\d{2})?)/.exec(body.slice(body.indexOf(message) + message.length))?.[1];
    return { name, replyAddress, message: message.slice(0, 3000), vehicle, listedPrice: price ? Math.round(parseFloat(price.replace(/,/g, ""))) : null };
  }
  return null;
}
