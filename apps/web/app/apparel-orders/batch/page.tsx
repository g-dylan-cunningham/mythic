import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  combinedHistoricalWindow,
  evaluateHistoricalOrderSafely,
  type HistoricalOrderEvaluation,
} from "@/lib/apparel-ordering/historical-order-batch";
import { analyzeHistoricalBatch } from "@/lib/apparel-ordering/historical-order-ai";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { getRecentHistoricalPrintavoOrders } from "@/lib/printavo/recent-orders";
import { getSsOrderHistory, type SsPlacedOrder } from "@/lib/ss/client";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SearchParams = {
  ai?: string | string[];
};

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not provided";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "America/Phoenix",
      }).format(parsed);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function InfoDisclosure({
  children,
  label = "How is this calculated?",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="group mt-3 text-sm text-neutral-400">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-cyan-200 hover:text-cyan-100">
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/50 text-xs font-semibold"
        >
          i
        </span>
        {label}
      </summary>
      <div className="mt-2 max-w-4xl rounded-md border border-neutral-800 bg-neutral-900/70 px-3 py-2 leading-6 text-neutral-300">
        {children}
      </div>
    </details>
  );
}

function bucketClasses(bucket: HistoricalOrderEvaluation["finding"]["bucket"]) {
  if (bucket === "No issue detected") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }
  if (bucket === "Insufficient evidence") {
    return "border-neutral-700 bg-neutral-900 text-neutral-200";
  }

  return "border-amber-400/30 bg-amber-400/10 text-amber-100";
}

function BatchSummary({ evaluations }: { evaluations: HistoricalOrderEvaluation[] }) {
  const exact = evaluations.filter(
    (evaluation) => evaluation.finding.outcome === "Exact match",
  ).length;
  const needsVerification = evaluations.filter(
    (evaluation) => evaluation.finding.bucket === "Insufficient evidence",
  ).length;
  const tool = evaluations.filter(
    (evaluation) => evaluation.finding.bucket === "Ordering-tool issue",
  ).length;

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Orders evaluated", evaluations.length],
        ["Exact matches", exact],
        ["Needs manual verification", needsVerification],
        ["Tool issues", tool],
      ].map(([label, value]) => (
        <div
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
          key={label}
        >
          <p className="text-sm text-neutral-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
      ))}
    </section>
  );
}

function OrderReport({
  aiAnalysis,
  evaluation,
}: {
  aiAnalysis:
    | Awaited<ReturnType<typeof analyzeHistoricalBatch>>["analysis"]
    | null;
  evaluation: HistoricalOrderEvaluation;
}) {
  const aiOrder = aiAnalysis?.orderAnalyses.find(
    (analysis) => analysis.orderNumber === evaluation.order.orderNumber,
  );

  return (
    <details
      className="rounded-xl border border-neutral-800 bg-neutral-900/70"
      open
    >
      <summary className="cursor-pointer list-none px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
              Printavo #{evaluation.order.orderNumber}
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {evaluation.order.nickname ??
                evaluation.order.customerName ??
                "Untitled order"}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Due {formatDate(evaluation.order.dueDate)} · Expected PO {evaluation.expectedPoNumber}
            </p>
          </div>
          <span
            className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${bucketClasses(evaluation.finding.bucket)}`}
          >
            {evaluation.finding.bucket}
          </span>
        </div>
      </summary>

      <div className="border-t border-neutral-800 px-5 py-6 sm:px-6">
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            1. What the tool would have done
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs text-neutral-500">Readiness</p>
              <p className="mt-2 font-medium">
                {evaluation.readiness.eligible ? "Ready" : "Blocked"}
              </p>
              {!evaluation.readiness.eligible ? (
                <p className="mt-2 text-sm leading-6 text-amber-100">
                  {evaluation.readiness.reasons.join(" ")}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs text-neutral-500">Generated basket</p>
              <p className="mt-2 font-medium">
                {evaluation.selectedSkuCount} SKUs · {evaluation.selectedUnitCount} units
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs text-neutral-500">Lines</p>
              <p className="mt-2 font-medium">
                {evaluation.lines.filter((line) => line.action === "selected").length} selected ·{" "}
                {evaluation.lines.filter((line) => line.action === "unresolved").length} unresolved ·{" "}
                {evaluation.lines.filter((line) => line.action === "excluded").length} excluded
              </p>
            </div>
          </div>
          <InfoDisclosure>
            Readiness is replayed from the saved Printavo order, including lines now marked ordered. A selected line must resolve to one S&amp;S product, color, and SKU for every requested size. Confidence and mapping source describe why the tool trusted that selection.
          </InfoDisclosure>

          <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-800 text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Printavo item</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">S&amp;S selection</th>
                  <th className="px-4 py-3">Confidence / source</th>
                  <th className="px-4 py-3">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {evaluation.lines.map((line) => (
                  <tr className="align-top" key={line.evidenceId}>
                    <td className="px-4 py-4">
                      <p className="font-medium">{line.description ?? "No description"}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {line.styleNumber ?? "No style"} · {line.color ?? "No color"} · {line.quantity ?? 0} units
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium capitalize">{line.action}</p>
                      <p className="mt-1 max-w-sm text-xs leading-5 text-neutral-400">
                        {line.explanation}
                      </p>
                      {line.issueBucket ? (
                        <p className="mt-2 text-xs font-medium text-amber-200">
                          Owner: {line.issueBucket}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {line.action === "selected" ? (
                        <>
                          <p>{line.supplierStyle} · {line.supplierColor}</p>
                          <p className="mt-1 max-w-sm text-xs leading-5 text-neutral-400">
                            {line.selectedSkus
                              .map(
                                (selection) =>
                                  `${selection.size}: ${selection.sku} × ${selection.requestedQty}`,
                              )
                              .join(", ")}
                          </p>
                        </>
                      ) : (
                        <span className="text-neutral-500">None</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p>{line.confidence ?? "Not applicable"}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {line.mappingSource?.replaceAll("_", " ") ?? "No mapping"}
                        {line.mappingEvidenceCount > 0
                          ? ` · ${line.mappingEvidenceCount} historical examples`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-neutral-500">
                      {line.evidenceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            2. What actually happened
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            S&amp;S history searched from {evaluation.historyWindow.startDate} through {evaluation.historyWindow.endDate}.
          </p>
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
            Printavo currently shows {evaluation.lines.filter((line) => line.disposition === "already_ordered").length} apparel line{evaluation.lines.filter((line) => line.disposition === "already_ordered").length === 1 ? "" : "s"} marked ordered. The saved order was last updated {formatDate(evaluation.order.updatedAt)}. The exact time each line was marked ordered and Printavo comments are not present in the saved order payload, so this report does not infer them.
          </div>
          {evaluation.actualCandidates.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-800 text-neutral-300">
                  <tr>
                    <th className="px-4 py-3">Candidate S&amp;S order</th>
                    <th className="px-4 py-3">PO</th>
                    <th className="px-4 py-3">Order / invoice date</th>
                    <th className="px-4 py-3">Actual basket</th>
                    <th className="px-4 py-3">Warehouses</th>
                    <th className="px-4 py-3">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {evaluation.actualCandidates.map((candidate) => (
                    <tr key={`${candidate.orderNumber}-${candidate.poNumber}`}>
                      <td className="px-4 py-4 font-medium">#{candidate.orderNumber}</td>
                      <td className="px-4 py-4">{candidate.poNumber || "Blank"}</td>
                      <td className="px-4 py-4">
                        {formatDate(candidate.orderDate)} / {formatDate(candidate.invoiceDate)}
                      </td>
                      <td className="px-4 py-4">
                        {candidate.actualSkuCount} SKUs · {candidate.actualTotalQty} units
                      </td>
                      <td className="px-4 py-4">
                        {candidate.warehouses.join(", ") || "Not provided"}
                      </td>
                      <td className="px-4 py-4">
                        {percent(candidate.expectedCoverage)} of generated · {percent(candidate.supplierCoverage)}{" "}of S&amp;S
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              {evaluation.actualCandidates.map((candidate) => (
                <details
                  className="rounded-lg border border-neutral-800 bg-neutral-950"
                  key={`lines-${candidate.orderNumber}-${candidate.poNumber}`}
                >
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-cyan-200">
                    View {candidate.actualSkuCount} actual SKUs and quantities from S&amp;S order #{candidate.orderNumber}
                  </summary>
                  <div className="max-h-96 overflow-auto border-t border-neutral-800">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-neutral-800 text-neutral-300">
                        <tr>
                          <th className="px-4 py-2">SKU</th>
                          <th className="px-4 py-2">Product</th>
                          <th className="px-4 py-2">Color / size</th>
                          <th className="px-4 py-2">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {candidate.actualLines.map((line) => (
                          <tr key={line.sku}>
                            <td className="px-4 py-2 font-mono">{line.sku}</td>
                            <td className="px-4 py-2">
                              {line.brandName} {line.styleName || line.title}
                            </td>
                            <td className="px-4 py-2">
                              {line.colorName || "—"} / {line.sizeName || "—"}
                            </td>
                            <td className="px-4 py-2">{line.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm text-neutral-300">
              {evaluation.error ?? "No comparable S&S order was identified."}
            </div>
          )}
          <InfoDisclosure label="What do the coverage numbers mean?">
            “Generated” coverage asks how much of the tool&apos;s basket appears in the supplier candidate. “S&amp;S” coverage asks how much of that supplier order is explained by this Printavo job. A result can have 100% generated coverage and low S&amp;S coverage when several jobs were purchased together. Without the expected PA reference, a partial-overlap candidate remains an investigative lead rather than a confirmed actual order.
          </InfoDisclosure>
        </section>

        <section className="mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            3. Deterministic comparison
          </p>
          <div className={`mt-4 rounded-lg border px-5 py-4 ${bucketClasses(evaluation.finding.bucket)}`}>
            <p className="font-semibold">{evaluation.finding.outcome}</p>
            <p className="mt-2 leading-6">{evaluation.finding.summary}</p>
          </div>
          <InfoDisclosure>
            This result is calculated from exact SKU and quantity comparisons. Expected PO matches are preferred; otherwise the tool ranks orders by exact-SKU overlap. It stops when top candidates tie instead of guessing.
          </InfoDisclosure>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              4. Likely cause
            </p>
            <p className="mt-3 font-medium">{evaluation.finding.bucket}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-300">
              {evaluation.finding.likelyCause}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Recommended action
            </p>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              {evaluation.finding.recommendation}
            </p>
          </div>
        </section>

        {aiOrder ? (
          <section className="mt-8 rounded-lg border border-violet-400/30 bg-violet-400/10 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
                AI interpretation
              </p>
              <span className="rounded-full border border-violet-300/30 px-2 py-0.5 text-xs text-violet-100">
                {aiOrder.certainty} certainty
              </span>
            </div>
            <p className="mt-3 font-medium text-violet-50">{aiOrder.conclusion}</p>
            <p className="mt-2 text-sm leading-6 text-violet-100/80">
              {aiOrder.likelyCause}
            </p>
            <p className="mt-3 text-sm leading-6 text-violet-100">
              Next step: {aiOrder.recommendedNextStep}
            </p>
            <ul className="mt-4 space-y-2 text-xs text-violet-100/70">
              {aiOrder.evidence.map((evidence) => (
                <li key={`${evidence.evidenceId}-${evidence.detail}`}>
                  <span className="font-mono">{evidence.evidenceId}</span> — {evidence.detail}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-6">
          <Link
            className="text-sm text-cyan-200 hover:text-cyan-100"
            href={`/apparel-orders/${evaluation.order.orderId}?supplier=ss&demo=1&reconcile=1`}
          >
            Open full single-order report →
          </Link>
        </div>
      </div>
    </details>
  );
}

export default async function HistoricalOrderBatchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await getCurrentProfile();

  if (!canAccessFeature(profile, "apparelOrdering")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const aiRequested = paramValue(params.ai) === "1";
  const supabase = await createClient();
  const recent = await getRecentHistoricalPrintavoOrders(supabase, 5);

  if (!recent.ok) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-50">
        <div className="mx-auto max-w-5xl rounded-lg border border-red-400/30 bg-red-400/10 p-5 text-red-100">
          {recent.error}
        </div>
      </main>
    );
  }

  const historyWindow = combinedHistoricalWindow(recent.orders);
  const history =
    recent.orders.length > 0
      ? await getSsOrderHistory(historyWindow)
      : null;
  const historyError = history && !history.ok ? history.error : null;
  const ssOrders: SsPlacedOrder[] = history?.ok ? history.orders : [];
  const evaluations: HistoricalOrderEvaluation[] = [];

  // Run sequentially to keep the S&S catalog/inventory request rate predictable.
  for (const order of recent.orders) {
    evaluations.push(
      await evaluateHistoricalOrderSafely({
        historyError,
        order,
        ssOrders,
        supabase,
      }),
    );
  }

  const ai = await analyzeHistoricalBatch(evaluations, aiRequested);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-[100rem] flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <Link className="text-sm text-neutral-400 hover:text-neutral-200" href="/dashboard">
            Dashboard
          </Link>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Historical order test drive
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Latest 5 completed apparel orders
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-neutral-400">
                A read-only replay of the newest saved Printavo orders containing apparel already marked ordered. Deterministic evidence is calculated first; AI, when requested and configured, can only interpret that evidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                href="/apparel-orders/batch"
              >
                Rerun deterministic report
              </Link>
              <Link
                className="inline-flex h-10 items-center rounded-md border border-violet-400/50 bg-violet-400/10 px-4 text-sm font-medium text-violet-100 hover:bg-violet-400/20"
                href="/apparel-orders/batch?ai=1"
              >
                Run deterministic + AI
              </Link>
            </div>
          </div>
          <InfoDisclosure label="Which five orders are included?">
            The report scans newest saved Printavo snapshots and selects the first five with at least one apparel line whose goods status is “Ordered.” Quotes, non-apparel jobs, and orders without a historical purchase are skipped so every included order is eligible for a meaningful test drive. {recent.scannedOrderCount} recent snapshots were considered in this run.
          </InfoDisclosure>
        </header>

        <BatchSummary evaluations={evaluations} />

        <section className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
                AI analysis layer
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                {ai.status === "completed"
                  ? "Evidence-backed interpretation complete"
                  : ai.status === "not_requested"
                    ? "Optional and separate from the scorecard"
                    : "Deterministic report complete; AI is unavailable"}
              </h2>
            </div>
            {ai.model ? (
              <span className="rounded-full border border-violet-300/20 px-3 py-1 text-xs text-violet-100/80">
                {ai.model}
              </span>
            ) : null}
          </div>

          {ai.status === "completed" && ai.analysis ? (
            <div className="mt-5 space-y-5">
              <p className="max-w-5xl leading-7 text-violet-50">
                {ai.analysis.executiveSummary}
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-violet-300/15 bg-neutral-950/40 p-4">
                  <h3 className="font-medium">Recurring patterns</h3>
                  <ul className="mt-3 space-y-3 text-sm text-violet-100/80">
                    {ai.analysis.recurringPatterns.map((pattern) => (
                      <li key={`${pattern.title}-${pattern.evidenceIds.join("-")}`}>
                        <span className="font-medium text-violet-50">{pattern.title}</span>{" "}
                        ({pattern.orderCount} orders) — {pattern.description}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-violet-300/15 bg-neutral-950/40 p-4">
                  <h3 className="font-medium">Priority actions</h3>
                  <ul className="mt-3 space-y-3 text-sm text-violet-100/80">
                    {ai.analysis.priorityActions.map((action) => (
                      <li key={`${action.action}-${action.evidenceIds.join("-")}`}>
                        <span className="font-medium uppercase text-violet-50">{action.priority}</span>{" "}
                        · {action.owner.replaceAll("_", " ")} — {action.action}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 max-w-4xl text-sm leading-6 text-violet-100/75">
              {ai.error} The deterministic findings below remain complete and are never replaced by model output.
            </p>
          )}
          <InfoDisclosure label="What is AI allowed to do?">
            AI receives the structured deterministic results, not raw credentials or the ability to place orders. It can explain patterns and propose follow-up work, but every displayed claim must cite a valid line or S&amp;S candidate evidence ID. Unknown evidence references are discarded.
          </InfoDisclosure>
        </section>

        {evaluations.length > 0 ? (
          <section className="space-y-5">
            {evaluations.map((evaluation) => (
              <OrderReport
                aiAnalysis={ai.analysis}
                evaluation={evaluation}
                key={evaluation.order.orderId}
              />
            ))}
          </section>
        ) : (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-neutral-300">
            No saved Printavo orders with apparel marked ordered were found.
          </section>
        )}
      </div>
    </main>
  );
}
