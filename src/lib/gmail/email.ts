// Builds outgoing emails. Kept free of other imports so the unit tests can load it directly.
/** A plain-text email in the format Gmail's send API expects (headers can't be broken by line breaks). */
export function buildEmail({ from, fromName, to, subject, body, inReplyTo, references }: {
  from: string; fromName?: string; to: string; subject: string; body: string; inReplyTo?: string | null; references?: string | null;
}): string {
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
  const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);
  const sender = fromName ? `${encodeHeader(clean(fromName).replace(/"/g, ""))} <${from}>` : from;
  return [
    `From: ${sender}`, `To: ${clean(to)}`, `Subject: ${encodeHeader(clean(subject))}`,
    // Replies carry these so Gmail and the customer's email app keep the conversation in one thread.
    ...(inReplyTo ? [`In-Reply-To: ${clean(inReplyTo)}`] : []),
    ...(references || inReplyTo ? [`References: ${clean([references, inReplyTo].filter(Boolean).join(" "))}`] : []),
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}

/** Just what the customer wrote this time, without the quoted earlier emails underneath. */
export function newPartOnly(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const cut = lines.findIndex((l) => /^On .{4,200}wrote:\s*$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || /^>/.test(l.trim()) || /^From: .+/.test(l.trim()));
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim().slice(0, 4000);
}
