// Shapes shared by the AI pages and the browser forms (no database code here, so forms can import it).
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Hours = { open: string; close: string; closed: boolean };
export type DealershipInfo = { address: string; phone: string; /** Where the AI texts when a customer wants a sales rep. Blank = use `phone`. */ repAlertPhone?: string; /** Two more people who get the same alert. */ repAlertPhone2?: string; repAlertPhone3?: string; website: string; hours: Hours[]; links: string; notes: string;
  /** A car's Carfax report link with {VIN} where the VIN goes, e.g. https://www.carfax.com/…?vin={VIN}. Blank until Carfax is set up. */ carfaxLink?: string;
  /** How long the AI "types" before a text goes out: instant, fast, natural or slow. */ typingSpeed?: "instant" | "fast" | "natural" | "slow" };
/** One question customers ask and the answer the AI should give. */
export type QA = { id: string; question: string; answer: string };
export type AiTraining = { instructions: string; qa: QA[] };
