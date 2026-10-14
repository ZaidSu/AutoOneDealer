// Open or closed right now, as lines for the AI's instructions.
import { closedNote, openStatus, statusLine, type DayHours } from "@/lib/ai/open-now";
import { dealership } from "@/lib/dealership";

/** Whether the dealership is open this minute (from the opening hours under Dealership info), and how to answer when it's closed. */
export function hoursBlock(info: { hours: DayHours[]; phone: string }, now = new Date()): string {
  const status = openStatus(info.hours, now, dealership.timeZone);
  return [statusLine(status), closedNote(status, info.phone)].filter(Boolean).join("\n");
}
