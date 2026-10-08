// What the AI assistant knows about the dealership, saved in the database (app_settings).
import { getSetting, setSetting } from "@/lib/db/data";

import { DAYS, type AiTraining, type DealershipInfo, type QA } from "./types";
export { DAYS, type AiTraining, type DealershipInfo, type QA };

const EMPTY_INFO: DealershipInfo = {
  address: "", phone: "", website: "", links: "", notes: "",
  hours: DAYS.map((d) => ({ open: "10:00", close: "19:00", closed: d === "Sunday" })),
};
const EMPTY_TRAINING: AiTraining = { instructions: "", qa: [] };

function parse<T extends object>(raw: string | null, fallback: T): T {
  try { return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}

export async function getDealershipInfo(): Promise<DealershipInfo> {
  const info = parse(await getSetting("dealership_info"), EMPTY_INFO);
  if (!Array.isArray(info.hours) || info.hours.length !== 7) info.hours = EMPTY_INFO.hours;
  return info;
}

/** The phone the AI texts when a customer asks for a sales rep: the one set for that, otherwise the dealership phone. */
export function repAlertNumber(info: DealershipInfo): string {
  return (info.repAlertPhone ?? "").trim() || info.phone;
}

export async function getAiTraining(): Promise<AiTraining> {
  const saved = parse<AiTraining & { faqs?: string }>(await getSetting("ai_training"), { ...EMPTY_TRAINING });
  let qa = Array.isArray(saved.qa) ? saved.qa.filter((q) => q && typeof q.question === "string") : [];
  // Earlier versions kept questions as one block of text: "question" line, then the answer, blank line between.
  if (qa.length === 0 && saved.faqs?.trim()) {
    qa = saved.faqs.split(/\n\s*\n/).map((block, i) => {
      const [question, ...rest] = block.trim().split("\n");
      return { id: `old-${i}`, question: question.trim(), answer: rest.join("\n").trim() };
    }).filter((q) => q.question);
  }
  return { instructions: saved.instructions ?? "", qa };
}

const time = (v: unknown, fallback: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : fallback);
const text = (v: unknown, max: number) => String(v ?? "").slice(0, max);

export async function saveDealershipInfo(input: DealershipInfo) {
  const clean: DealershipInfo = {
    address: text(input.address, 200).trim(), phone: text(input.phone, 40).trim(), repAlertPhone: text(input.repAlertPhone, 40).trim(), website: text(input.website, 200).trim(),
    links: text(input.links, 4000), notes: text(input.notes, 4000),
    hours: DAYS.map((_, i) => ({ open: time(input.hours?.[i]?.open, "10:00"), close: time(input.hours?.[i]?.close, "19:00"), closed: Boolean(input.hours?.[i]?.closed) })),
  };
  await setSetting("dealership_info", JSON.stringify(clean));
}

function cleanQa(list: QA[]): QA[] {
  return (Array.isArray(list) ? list : []).slice(0, 300).map((q, i) => ({
    id: /^[\w-]{1,40}$/.test(String(q?.id)) ? String(q.id) : `q${Date.now()}-${i}`,
    question: text(q?.question, 500).trim(), answer: text(q?.answer, 3000).trim(),
  })).filter((q) => q.question && q.answer);
}

/** Saves one part of the training (the instructions, or the questions and answers), keeping the other part. */
export async function saveAiTraining(input: Partial<AiTraining>) {
  const current = await getAiTraining();
  const next: AiTraining = {
    instructions: input.instructions !== undefined ? text(input.instructions, 8000) : current.instructions,
    qa: input.qa !== undefined ? cleanQa(input.qa) : current.qa,
  };
  await setSetting("ai_training", JSON.stringify(next));
  return next;
}
