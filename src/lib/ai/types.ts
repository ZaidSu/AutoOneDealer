// Shapes shared by the AI pages and the browser forms (no database code here, so forms can import it).
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Hours = { open: string; close: string; closed: boolean };
export type DealershipInfo = { address: string; phone: string; website: string; hours: Hours[]; links: string; notes: string };
export type AiTraining = { instructions: string; faqs: string };
