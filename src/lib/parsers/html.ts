// Turns notification-email HTML into clean text lines. We never render email HTML in the app.
// No project imports, so it can be unit tested directly.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return match;
  });
}

export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|tr|p|div|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function htmlToText(html: string): string {
  return htmlToLines(html).join("\n");
}

/** Finds the href of the first link whose visible text contains `label`. */
export function linkByText(html: string, label: string): string | null {
  const pattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, "")).trim();
    if (text.toLowerCase().includes(label.toLowerCase())) return decodeEntities(match[1]);
  }
  return null;
}
