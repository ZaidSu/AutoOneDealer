// Which view each page shows. Shared by the server (real database) and the browser (preview mode).
import type { ComponentType } from "react";
import ContractorView from "./ContractorView";
import ContractorsView from "./ContractorsView";
import CustomersView from "./CustomersView";
import DashboardView from "./DashboardView";
import ExpensesView from "./ExpensesView";
import InvoicesView from "./InvoicesView";
import AnalyticsView from "./AnalyticsView";
import ImportView from "./ImportView";
import IncomeView from "./IncomeView";
import ProjectsView from "./ProjectsView";
import InvoiceView from "./InvoiceView";
import ItemsView from "./ItemsView";
import QuartersView from "./QuartersView";
import TaxesView from "./TaxesView";
import type { ViewProps } from "./types";

export type ViewName = "dashboard" | "quarters" | "analytics" | "invoice" | "invoices" | "expenses" | "items" | "contractors" | "contractor" | "customers" | "taxes" | "income" | "projects" | "import";

/** The working pages that show the "quarter is closing" reminder. */
export const BANNER_VIEWS = new Set<ViewName>(["dashboard", "invoices"]);

export const VIEWS: Record<ViewName, { title: string; Component: ComponentType<ViewProps> }> = {
  dashboard: { title: "Dashboard", Component: DashboardView },
  quarters: { title: "Quarters", Component: QuartersView },
  analytics: { title: "Analytics", Component: AnalyticsView },
  invoice: { title: "Invoice", Component: InvoiceView },
  invoices: { title: "Invoices", Component: InvoicesView },
  expenses: { title: "Expenses", Component: ExpensesView },
  items: { title: "Items", Component: ItemsView },
  contractors: { title: "Contractors", Component: ContractorsView },
  contractor: { title: "Contractor", Component: ContractorView },
  customers: { title: "Customers", Component: CustomersView },
  taxes: { title: "Taxes", Component: TaxesView },
  income: { title: "Income", Component: IncomeView },
  import: { title: "Import", Component: ImportView },
  projects: { title: "Projects", Component: ProjectsView },
};
