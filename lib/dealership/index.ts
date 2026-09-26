// Single-dealership settings for now. Becomes a database record per dealership in Phase 6.
export const dealership = {
  name: process.env.DEALERSHIP_NAME || "Auto One Motors",
  timeZone: "America/Chicago",
};

export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: dealership.timeZone }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
