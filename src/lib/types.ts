export type TaxStatus = "resale" | "exempt" | "taxable";

/** A product you sell. Items are created for you from invoices, and you can add or fix them on the Items page. */
export type Item = { id: string; name: string; upc: string | null; sku: string | null; category: string | null };
export type Customer = { id: string; name: string; default_tax_status: TaxStatus; cert_file_id: string | null; notes: string | null };
export type Contractor = { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
export type Payment = {
  id: string; contractor_id: string; amount: number; paid_on: string; method: string | null; reference: string | null; notes: string | null;
};

/** What a batch of items is recorded from: an invoice you sent (Wave) or a purchase order the customer sent you. */
export type DocKind = "invoice" | "po";

/**
 * An invoice is the one thing you enter. It holds its items (lines), and everything else is worked out from it:
 * what they owe you, your cost of goods, and your profit. Miles belong to the invoice (one trip, counted once).
 */
export type Invoice = {
  id: string; kind: DocKind; invoice_no: string; customer_id: string | null; invoice_date: string;
  status: "unpaid" | "paid"; paid_on: string | null; file_id: string | null; notes: string | null;
  /** Who paid for the goods out of their own pocket (you owe them the cost). Null = the company paid. */
  contractor_id: string | null;
  /** Where the goods were bought (Walmart, Amazon...). */
  store: string | null;
  /** Business miles driven to buy the goods for this invoice. */
  miles: number;
  /** How the sale is taxed, and the sales tax charged on it (always 0 unless taxable). */
  tax_status: TaxStatus; sales_tax: number;
  /** When set, this is what they owe you, instead of adding up the items. */
  total_override: number | null;
  /** When set, this is the cost of goods, instead of adding up each item's cost. */
  cost_override: number | null;
  /** Dollars of this invoice's goods that were paid for on the customer's card. When set, it replaces what the items' "Bought with" choices add up to. */
  their_card: number | null;
  /** Which of your own cards paid for the rest (free text, e.g. "Chase Ink"). */
  my_card: string | null;
};

/** One item on an invoice. */
export type InvoiceLine = {
  id: string; invoice_id: string; item_id: string; qty: number; unit_price: number; unit_cost: number; position: number;
  /** Bought with your own card (they owe the full price) or, when false, with their card (they owe only your profit). Missing means your own card. */
  own_card?: boolean;
};

/**
 * An invoice from a contractor, for just you: what they bought, and what they sell it to you for. It is kept apart from your own
 * invoices, so it never shows up in your sales, profit or taxes.
 */
export type ContractorInvoice = { id: string; contractor_id: string; invoiced_on: string; ref: string | null; notes: string | null };
export type ContractorInvoiceLine = {
  id: string; invoice_id: string; name: string; upc: string | null; qty: number;
  /** What the contractor paid for each one. */
  buy_price: number;
  /** What the contractor charges you for each one (what you owe them). */
  sell_price: number;
  position: number;
};

export type Business = "resale" | "software" | "shared";
export type Expense = {
  id: string; spent_on: string; category: string; vendor: string | null; amount: number; receipt_file_id: string | null; notes: string | null;
  /** Which part of the company the expense belongs to, so each can be reported separately. */
  business: Business;
};

/** The software side of the company: the jobs you do, and the money that comes in from them. */
export type ProjectStatus = "active" | "paused" | "done";
export type Project = { id: string; name: string; client: string | null; status: ProjectStatus; notes: string | null };
export type Income = { id: string; received_on: string; source: string; project_id: string | null; amount: number; notes: string | null };

export type Settings = { mileageRates: Record<string, number> };

/** The totals frozen when a quarter was finalized. */
export type QuarterSnapshot = {
  totalSales: number; cogs: number; expenses: number; netProfit: number; miles: number; mileageExpense: number; invoices: number; unpaid: number; items: number;
};
/** A quarter you've finalized: its invoices and expenses are locked until you reopen it. */
export type QuarterRecord = { year: number; quarter: number; finalized_at: string; note: string | null; snapshot: QuarterSnapshot };

export type Data = {
  settings: Settings;
  quarters: QuarterRecord[];
  items: Item[]; customers: Customer[]; contractors: Contractor[];
  payments: Payment[]; invoices: Invoice[]; lines: InvoiceLine[]; expenses: Expense[];
  projects: Project[]; income: Income[];
  contractor_invoices: ContractorInvoice[]; contractor_lines: ContractorInvoiceLine[];
};
