import type { Actions } from "@/lib/actions-type";
import type { Data } from "@/lib/types";

// What every page view receives. The same views render on the server (real database) and in the browser (preview mode).
export type ViewProps = {
  data: Data;
  params: Record<string, string | undefined>;
  editable: boolean;
  act: Actions;
  today: string;
  contractorId?: string;
  invoiceId?: string;
};
