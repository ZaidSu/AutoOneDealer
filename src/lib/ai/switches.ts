// Master on/off for the AI on each channel. Off means the AI does nothing by itself (no automatic drafts, replies or
// follow-ups); the buttons staff press by hand still work. On unless someone turns it off.
import { getSetting, setSetting } from "@/lib/db/data";

export type Channel = "email" | "text";

export async function channelOn(channel: Channel): Promise<boolean> {
  return (await getSetting(`ai_${channel}_enabled`).catch(() => null)) !== "off";
}
export async function setChannel(channel: Channel, on: boolean) {
  await setSetting(`ai_${channel}_enabled`, on ? "on" : "off");
}
