// Single-dealership settings for now. Becomes a database record per dealership in Phase 6.
export const dealership = {
  name: process.env.DEALERSHIP_NAME || "Auto One Motors",
  timeZone: "America/Chicago",
  // The Pipeline tracks new customers from this day on (Monday of the week before it went live), so years of
  // older leads don't flood the "New" column. Customers staff already worked on always show.
  pipelineStart: process.env.PIPELINE_START || "2026-09-21",
};

export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: dealership.timeZone }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
