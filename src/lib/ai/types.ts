// Shapes shared by the AI pages and the browser forms (no database code here, so forms can import it).
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Hours = { open: string; close: string; closed: boolean };
export type DealershipInfo = { address: string; phone: string; website: string; hours: Hours[]; links: string; notes: string };
/** One question customers ask and the answer the AI should give. */
export type QA = { id: string; question: string; answer: string };
export type AiTraining = { instructions: string; qa: QA[] };
