export type ReportDefinition = {
  description: string;
  href: string;
  source: "Printavo" | "S&S Activewear";
  status: "Discovery" | "Reconciliation";
  title: string;
};

export const reports: ReportDefinition[] = [
  {
    description:
      "Daily order subtotal by Printavo owner, with status breakdown and CSV reconciliation.",
    href: "/reporting/printavo-sales",
    source: "Printavo",
    status: "Reconciliation",
    title: "Orders by Day and Owner",
  },
  {
    description:
      "Manual POC sync for recent paid Printavo orders into Mythic production jobs.",
    href: "/reporting/printavo-sync",
    source: "Printavo",
    status: "Discovery",
    title: "Production Sync POC",
  },
  {
    description:
      "Read-only S&S inventory lookup for a known SKU, including warehouse quantities.",
    href: "/reporting/ss-inventory",
    source: "S&S Activewear",
    status: "Discovery",
    title: "S&S Inventory Test",
  },
];
