// Local testing only: books a sample appointment for tomorrow.
import * as d from "../../lib/db/data";
import { db } from "../../lib/db/index";
import { addDays, dayKey, zonedToUtc } from "../../lib/time";
const t = dayKey(Date.now(), "America/Chicago");
const zach = (await d.listReps()).find((r) => r.name === "Zach")!;
await d.createAppointment({ customerKey: "p-9725550177", customerName: "Pat Example", phone: "9725550177", vehicle: "2019 Toyota Camry", repId: zach.id, startsAt: zonedToUtc(addDays(t, 1), "14:00", "America/Chicago")!, durationMin: 60, notes: "" });
console.log("seeded");
await db()!.end();
