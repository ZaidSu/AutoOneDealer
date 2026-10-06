// The AI's working days and hours, saved in the database so staff can change them (AI > Automations).
import { dropCached, cached } from "@/lib/utils/cache";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { cleanSchedule, DEFAULT_SCHEDULE, describeSchedule, nextOpening, withinSchedule, type AiSchedule } from "./hours";
export { describeSchedule, type AiSchedule };

const KEY = "ai_schedule";

export function getAiSchedule(): Promise<AiSchedule> {
  return cached("sched:ai", 20_000, async () => {
    try {
      const raw = await getSetting(KEY);
      return raw ? cleanSchedule(JSON.parse(raw)) : DEFAULT_SCHEDULE;
    } catch { return DEFAULT_SCHEDULE; }
  });
}

export async function saveAiSchedule(input: AiSchedule): Promise<AiSchedule> {
  const clean = cleanSchedule(input);
  await setSetting(KEY, JSON.stringify(clean));
  dropCached("sched:");
  return clean;
}

/** True during the days and hours the AI works. Replaces the old fixed Mon to Sat, 9 to 7. */
export async function aiHoursOpen(now = new Date()): Promise<boolean> {
  return withinSchedule(await getAiSchedule(), now, dealership.timeZone);
}

/** Plain words for messages: "every day, 9 AM to 8 PM". */
export async function aiHoursText(): Promise<string> {
  return describeSchedule(await getAiSchedule());
}

/** "tomorrow at 9 AM": when waiting replies get written. */
export async function aiNextOpening(now = new Date()): Promise<string> {
  return nextOpening(await getAiSchedule(), now, dealership.timeZone);
}
