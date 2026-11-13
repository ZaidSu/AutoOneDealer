// How long the AI "types" before a text goes out, so replies don't land a second after the customer hits send.
// Pure, so it is easy to test.
export type TypingSpeed = "instant" | "fast" | "natural" | "slow";
export const TYPING_SPEEDS: { value: TypingSpeed; label: string; note: string }[] = [
  { value: "instant", label: "Instant", note: "Sends the moment the reply is written." },
  { value: "fast", label: "Quick", note: "A short pause, like someone who is already on their phone." },
  { value: "natural", label: "Natural", note: "A few seconds to read it, then typing time that fits the length." },
  { value: "slow", label: "Slow", note: "A longer pause, like someone busy on the lot." },
];
export const cleanTypingSpeed = (v: unknown): TypingSpeed => (TYPING_SPEEDS.some((s) => s.value === v) ? (v as TypingSpeed) : "natural");

/** The longest wait: texts are sent while the server is still working on the customer's message, which has a time limit. */
export const MAX_TYPING_MS = 30_000;
const PROFILE: Record<TypingSpeed, { thinkMs: number; charsPerSec: number }> = {
  instant: { thinkMs: 0, charsPerSec: Infinity },
  fast: { thinkMs: 2_000, charsPerSec: 14 },
  natural: { thinkMs: 4_000, charsPerSec: 8 },
  slow: { thinkMs: 7_000, charsPerSec: 5.5 },
};

/** Milliseconds to wait before sending `body`: time to read, plus time to type it, with a little variety each time. */
export function typingDelayMs(body: string, speed: unknown, random: () => number = Math.random): number {
  const s = cleanTypingSpeed(speed);
  if (s === "instant") return 0;
  const p = PROFILE[s];
  const ms = (p.thinkMs + (String(body).length / p.charsPerSec) * 1000) * (0.85 + random() * 0.3);
  return Math.min(MAX_TYPING_MS, Math.max(0, Math.round(ms)));
}
