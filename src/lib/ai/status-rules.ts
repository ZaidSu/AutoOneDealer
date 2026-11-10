// Rules every AI prompt shares about cars that have a deposit on them, and about knowing when a conversation is over.
// Pure text and one check, so it is easy to test.

/** What the AI answers when the customer has already said goodbye and there is nothing left to say. */
export const NO_REPLY = "NO_REPLY";
export const isNoReply = (text: string) => /^\W*NO[ _-]?REPLY\W*$/i.test(String(text ?? "").trim());

export const DEPOSIT_RULES = `- DEPOSIT: a car marked "DEPOSIT TAKEN" in the lists below has a customer's deposit on it. It is spoken for: tell them plainly "that one has a deposit on it right now", never offer to show it or say it is available, never use "it will sell fast" pressure. Offer similar cars from the list instead (with their links), or say you can let them know if the deal falls through. If the customer says someone on our team told them a car has a deposit, is on hold, pending or sold, believe them: our team knows better than you do. Agree ("Yes, that one has a deposit on it"), don't say you are unsure what they were told, never suggest the team member was wrong, and don't push them to hurry. Offer similar cars or a call from a sales rep to confirm.`;

export const CONVERSATION_RULES = `- KNOW WHEN IT IS OVER: if the customer is saying goodbye, thanking you, or says they are going elsewhere or not interested, and they asked nothing you still need to answer, reply with exactly ${NO_REPLY} and nothing else. If they decline for the first time, one short, kind message is fine; after that send nothing. Never try to win back someone who has clearly decided.
- UPSET CUSTOMERS: if the customer is angry, says they were lied to, or threatens a bad review, don't argue, don't defend, don't promise anything, and don't sell. At most one short sentence saying you are sorry and that a manager will reach out, then ${NO_REPLY} to anything after that. (The team is alerted automatically.)`;
