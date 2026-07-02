import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getPrintavoSalesReport,
  testPrintavoConnection,
} from "@/lib/printavo/client";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canViewReports } from "@/lib/auth/roles";
import { formatCurrency } from "@/lib/formatters";

const reportStartDate = "2025-12-01";
const reportEndDate = "2026-06-30";
const csvReportGrandTotal = 1485316.06;

export default async function PrintavoSalesReportPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canViewReports(profile.role)) {
    redirect("/dashboard");
  }

  const [printavoConnection, printavoSalesReport] = await Promise.all([
    testPrintavoConnection(),
    getPrintavoSalesReport({
      endDate: reportEndDate,
      startDate: reportStartDate,
    }),
  ]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <div className="flex gap-4 text-sm text-neutral-400">
            <Link href="/dashboard" className="hover:text-neutral-200">
              Dashboard
            </Link>
            <Link href="/reporting" className="hover:text-neutral-200">
              Reporting
            </Link>
          </div>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Printavo
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Orders by day and owner
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Sum of Printavo order subtotal by submission date. This first pass
            is intentionally unfiltered while we reconcile it against the CSV
            export.
          </p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Connection</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Read-only account endpoint test.
              </p>
            </div>
            <span
              className={
                printavoConnection.ok
                  ? "rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-200"
                  : "rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-xs font-medium text-red-200"
              }
            >
              {printavoConnection.ok ? "Connected" : "Failed"}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Endpoint</dt>
              <dd className="mt-1 font-mono text-neutral-200">
                {printavoConnection.url ?? "Not requested"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Status</dt>
              <dd className="mt-1 font-mono text-neutral-200">
                {printavoConnection.status ?? "n/a"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          {printavoSalesReport.ok ? (
            <>
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold">Report output</h2>
                <div className="text-sm text-neutral-400">
                  {printavoSalesReport.rows.length} days ·{" "}
                  {printavoSalesReport.matchedOrders} orders ·{" "}
                  {formatCurrency(printavoSalesReport.grandTotal.amount)}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-neutral-500">Date range</p>
                  <p className="mt-1 font-mono">
                    {printavoSalesReport.startDate} to{" "}
                    {printavoSalesReport.endDate}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-neutral-500">Pages fetched</p>
                  <p className="mt-1 font-mono">
                    {printavoSalesReport.pagesFetched}
                    {printavoSalesReport.totalPages
                      ? ` / ${printavoSalesReport.totalPages}`
                      : ""}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-neutral-500">Orders scanned</p>
                  <p className="mt-1 font-mono">
                    {printavoSalesReport.scannedOrders}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-neutral-500">Matched subtotal</p>
                  <p className="mt-1 font-mono">
                    {formatCurrency(printavoSalesReport.grandTotal.amount)}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-50">
                <p className="font-medium">CSV reconciliation needed</p>
                <p className="mt-1 text-amber-100/80">
                  The uploaded CSV grand total is{" "}
                  {formatCurrency(csvReportGrandTotal)}. The live API total
                  below includes every visible Printavo status, so the next step
                  is confirming which statuses and date fields belong in
                  Cole&apos;s weekly sales report.
                </p>
                <p className="mt-2 font-mono text-xs text-amber-100/80">
                  Difference:{" "}
                  {formatCurrency(
                    printavoSalesReport.grandTotal.amount - csvReportGrandTotal,
                  )}
                </p>
              </div>

              {printavoSalesReport.truncated ? (
                <p className="mt-4 rounded-md border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-100">
                  Report hit the page limit before reaching the start date.
                  Results may be incomplete.
                </p>
              ) : null}

              <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-500 text-left text-white">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-500 px-3 py-2 font-semibold">
                        Submission Date
                      </th>
                      {printavoSalesReport.owners.map((owner) => (
                        <th
                          className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                          key={owner}
                        >
                          {owner}
                        </th>
                      ))}
                      <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                        Grand Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                    {printavoSalesReport.rows.map((row) => (
                      <tr key={row.dateKey}>
                        <th className="sticky left-0 bg-neutral-950 px-3 py-2 text-left font-medium text-neutral-200">
                          {row.date}
                        </th>
                        {printavoSalesReport.owners.map((owner) => {
                          const cell = row.owners[owner];

                          return (
                            <td
                              className="whitespace-nowrap px-3 py-2 text-right font-mono text-neutral-200"
                              key={owner}
                            >
                              {cell ? formatCurrency(cell.amount) : ""}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-neutral-50">
                          {formatCurrency(row.total.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-neutral-900">
                      <th className="sticky left-0 bg-neutral-900 px-3 py-2 text-left font-semibold text-neutral-50">
                        Grand Total
                      </th>
                      {printavoSalesReport.owners.map((owner) => (
                        <td
                          className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-neutral-50"
                          key={owner}
                        >
                          {formatCurrency(
                            printavoSalesReport.totalsByOwner[owner]?.amount ??
                              0,
                          )}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-emerald-200">
                        {formatCurrency(printavoSalesReport.grandTotal.amount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-neutral-800 text-left text-neutral-200">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Orders
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                    {printavoSalesReport.statusBreakdown.map((status) => (
                      <tr key={status.status}>
                        <th className="px-3 py-2 text-left font-medium text-neutral-200">
                          {status.status}
                        </th>
                        <td className="px-3 py-2 text-right font-mono text-neutral-200">
                          {status.count}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-neutral-200">
                          {formatCurrency(status.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
              {printavoSalesReport.error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
