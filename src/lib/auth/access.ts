// Who may sign in, and what each role may do.
// Keep this file free of other project imports so it can be unit tested directly.

export type Role = "owner" | "manager" | "salesperson" | "developer";
const ROLES: Role[] = ["owner", "manager", "salesperson", "developer"];

export function normalizeEmail(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Parses STAFF_ACCESS ("a@x.com:owner,b@x.com:salesperson").
 * If STAFF_ACCESS is empty, the dealership mailbox owner (GMAIL_ALLOWED_EMAIL) is the only staff member.
 * Entries with an unknown role are ignored rather than guessed.
 */
export function parseStaffAccess(staffAccess: string | undefined, fallbackOwner: string | undefined): Map<string, Role> {
  const staff = new Map<string, Role>();
  for (const entry of String(staffAccess ?? "").split(",")) {
    const [rawEmail, rawRole] = entry.split(":");
    const email = normalizeEmail(rawEmail);
    const role = String(rawRole ?? "").trim().toLowerCase() as Role;
    if (email.includes("@") && ROLES.includes(role)) staff.set(email, role);
  }
  const owner = normalizeEmail(fallbackOwner);
  if (staff.size === 0 && owner.includes("@")) staff.set(owner, "owner");
  return staff;
}

export const can = {
  manageIntegrations: (role: Role) => role === "owner" || role === "manager",
  // Removing a customer from AutoDash (spam, tests, duplicates).
  deleteCustomers: (role: Role) => role === "owner" || role === "manager" || role === "developer",
  useDeveloperTools: (role: Role) => role === "owner" || role === "developer",
  // Dealership info and AI training: whoever runs the store, and whoever builds the AI.
  // Billing: the dealership owner sees and pays the bill; only the developer (whoever runs AutoDash) sets prices.
  viewBilling: (role: Role) => role === "owner" || role === "developer",
  manageBilling: (role: Role) => role === "developer",
  editAiSettings: (role: Role) => role === "owner" || role === "manager" || role === "developer",
};

export const roleLabel: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  salesperson: "Salesperson",
  developer: "Developer",
};
