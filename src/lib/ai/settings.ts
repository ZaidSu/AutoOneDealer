// What the AI assistant knows about the dealership, saved in the database (app_settings).
import { getSetting, setSetting } from "@/lib/db/data";

import { DAYS, type AiTraining, type DealershipInfo } from "./types";
export { DAYS, type AiTraining, type DealershipInfo };

const EMPTY_INFO: DealershipInfo = {
  address: "", phone: "", website: "", links: "", notes: "",
  hours: DAYS.map((d) => ({ open: "10:00", close: "19:00", closed: d === "Sunday" })),
};
const EMPTY_TRAINING: AiTraining = { instructions: "", faqs: "" };

function parse<T extends object>(raw: string | null, fallback: T): T {
  try { return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}

export async function getDealershipInfo(): Promise<DealershipInfo> {
  const info = parse(await getSetting("dealership_info"), EMPTY_INFO);
  if (!Array.isArray(info.hours) || info.hours.length !== 7) info.hours = EMPTY_INFO.hours;
  return info;
}

export async function getAiTraining(): Promise<AiTraining> {
  return parse(await getSetting("ai_training"), EMPTY_TRAINING);
}

const time = (v: unknown, fallback: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : fallback);
const text = (v: unknown, max: number) => String(v ?? "").slice(0, max);

export async function saveDealershipInfo(input: DealershipInfo) {
  const clean: DealershipInfo = {
    address: text(input.address, 200).trim(), phone: text(input.phone, 40).trim(), website: text(input.website, 200).trim(),
    links: text(input.links, 4000), notes: text(input.notes, 4000),
    hours: DAYS.map((_, i) => ({ open: time(input.hours?.[i]?.open, "10:00"), close: time(input.hours?.[i]?.close, "19:00"), closed: Boolean(input.hours?.[i]?.closed) })),
  };
  await setSetting("dealership_info", JSON.stringify(clean));
}

export async function saveAiTraining(input: AiTraining) {
  await setSetting("ai_training", JSON.stringify({ instructions: text(input.instructions, 8000), faqs: text(input.faqs, 12000) }));
}
