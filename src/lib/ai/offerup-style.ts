// OfferUp chats arrive and leave as emails, but the customer sees them as chat messages in the app.
// So replies there should read like a quick text: no greeting block, no sign-off, no footer.

export function isOfferUp(provider?: unknown, email?: unknown): boolean {
  return /offerup/i.test(String(provider ?? "")) || /@([\w-]+\.)*offerup\.com$/i.test(String(email ?? "").trim());
}

export const OFFERUP_TEXT_RULES = `This customer is chatting in the OfferUp app, so write like a TEXT MESSAGE, not an email:
- 1 to 3 short sentences, about 10 to 40 words total. Casual and friendly, like a salesperson texting back.
- No subject-style opening, no "Dear", no "Thank you for your inquiry", no "Best regards", no sign-off, no signature, no "The team at...", no phone number block. A first name is fine only if natural ("Hey Mike,").
- Answer exactly what they asked. If it's natural, end with one simple question or time suggestion ("Want to come by today?"). Don't pitch.
- Never make up prices, approvals, trade-in values or anything not in the facts. If you don't know, say you'll double check.
- Availability: only say what the LIVE INVENTORY CHECK says; if there is none, say you'll confirm.
- Only give the phone number or address if they asked for it.
- No markdown, no bullet points, no emojis. If they wrote in Spanish, reply in Spanish.`;

/** Safety net: strips email-style endings the AI might still add to a text-style reply. */
export function textify(body: string): string {
  const lines = body.replace(/\r/g, "").trim().split("\n");
  const signoff = /^(best|best regards|regards|kind regards|sincerely|thanks|thank you|thanks again|warm regards|cheers)[,.!]?$/i;
  const team = /^(the team at|-+\s*$|--\s*$)/i;
  while (lines.length > 1) {
    const last = lines[lines.length - 1].trim();
    if (last === "" || signoff.test(last) || team.test(last) || /^\+?[\d\s().-]{10,}$/.test(last)) lines.pop();
    else break;
  }
  return lines.join("\n").trim();
}
