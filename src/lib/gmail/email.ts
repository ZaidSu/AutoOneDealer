// Builds outgoing emails. Kept free of other imports so the unit tests can load it directly.
/** A plain-text email in the format Gmail's send API expects (headers can't be broken by line breaks). */
export function buildEmail({ from, fromName, to, subject, body }: { from: string; fromName?: string; to: string; subject: string; body: string }): string {
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
  const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);
  const sender = fromName ? `${encodeHeader(clean(fromName).replace(/"/g, ""))} <${from}>` : from;
  return [
    `From: ${sender}`, `To: ${clean(to)}`, `Subject: ${encodeHeader(clean(subject))}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}
