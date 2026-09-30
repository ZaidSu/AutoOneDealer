// One color per lead source, so the same source looks the same on every chart.
// Listing sites get their own colors; people-based sources (word of mouth, drive-by) stay gray.
const KNOWN: [RegExp, string][] = [
  [/^cars\.com/i, "#6b2c91"],        // purple
  [/^autotrader/i, "#f08c00"],       // orange
  [/^cargurus/i, "#0ca678"],         // green
  [/^edmunds/i, "#0b7285"],          // teal
  [/^carsforsale/i, "#c2255c"],      // raspberry
  [/^facebook/i, "#1877f2"],         // blue
  [/^carzing/i, "#fab005"],          // yellow
  [/^offerup/i, "#37b24d"],          // light green
  [/^truecar/i, "#3bc9db"],          // cyan
  [/^ncu|credit union/i, "#5c940d"], // olive
  [/^auto link/i, "#66a80f"],        // lime
  [/^google/i, "#4263eb"],           // indigo
  [/^hammer/i, "#795548"],           // brown
  [/^word of mouth/i, "#868e96"],
  [/^repeat/i, "#495057"],
  [/^drive-?by/i, "#adb5bd"],
  [/^(other|not known)/i, "#ced4da"],
];
// For sources added later in Settings: a steady color picked from the name.
const EXTRA = ["#e8590c", "#9c36b5", "#1098ad", "#d6336c", "#2b8a3e", "#5f3dc4", "#e67700", "#364fc7"];

export function sourceColor(name: string): string {
  for (const [pattern, color] of KNOWN) if (pattern.test(name.trim())) return color;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA[hash % EXTRA.length];
}
