// Who may sign in, and what each role may do.
// Keep this file free of other project imports so it can be unit tested directly.

export type Role = "owner" | "accountant";
const ROLES: Role[] = ["owner", "accountant"];

export function normalizeEmail(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Parses STAFF_ACCESS ("a@x.com:owner,b@x.com:accountant").
 * If STAFF_ACCESS is empty, OWNER_EMAIL is the only person who can sign in.
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
  // Owners add, change and delete records. Accountants can read everything and download reports.
  edit: (role: Role) => role === "owner",
};

export const roleLabel: Record<Role, string> = {
  owner: "Owner",
  accountant: "Accountant (view only)",
};
