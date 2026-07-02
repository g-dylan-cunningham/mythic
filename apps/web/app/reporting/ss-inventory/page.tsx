import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canViewReports } from "@/lib/auth/roles";
import { formatCurrency } from "@/lib/formatters";
import { getSsStyleInventoryReport } from "@/lib/ss/client";

type SearchParams = {
  color?: string | string[];
  minQty?: string | string[];
  product?: string | string[];
  size?: string | string[];
  warehouse?: string | string[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function stockTone(qty: number) {
  if (qty >= 500) {
    return "bg-emerald-400";
  }

  if (qty >= 100) {
    return "bg-cyan-300";
  }

  if (qty > 0) {
    return "bg-amber-300";
  }

  return "bg-red-400";
}

function colorStyle(color: string | null) {
  return color ? { backgroundColor: color } : undefined;
}

function getParam(searchParams: SearchParams, key: keyof SearchParams) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function availabilityMessage(matchCount: number, requiredQty: number) {
  if (matchCount === 0) {
    return "No matching supplier variants found";
  }

  if (matchCount === 1) {
    return `1 matching supplier variant can meet ${requiredQty}+ units`;
  }

  return `${matchCount} matching supplier variants can meet ${requiredQty}+ units`;
}

export default async function SsInventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canViewReports(profile.role)) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const minQty = Number(getParam(resolvedSearchParams, "minQty") || "1");
  const report = await getSsStyleInventoryReport({
    color: getParam(resolvedSearchParams, "color"),
    minQty: Number.isFinite(minQty) ? minQty : 1,
    search: getParam(resolvedSearchParams, "product"),
    size: getParam(resolvedSearchParams, "size"),
    warehouse: getParam(resolvedSearchParams, "warehouse"),
  });

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
            S&S Activewear
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Style inventory
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            A read-only supplier availability lookup. Use it the way a customer
            conversation sounds: choose a style or SKU, narrow to color and
            size, then check whether S&S has enough units available to source.
          </p>
        </header>

        {report.ok ? (
          <>
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <form className="grid gap-4 lg:grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.7fr_auto] lg:items-end">
                <label className="block">
                  <span className="text-sm font-medium text-neutral-300">
                    Style or SKU
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
                    defaultValue={report.query.search}
                    name="product"
                    placeholder="00760 or B00760004"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-neutral-300">
                    Color contains
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
                    defaultValue={report.query.color}
                    list="ss-colors"
                    name="color"
                    placeholder="Black, Navy, Safety"
                  />
                  <datalist id="ss-colors">
                    {report.availableColors.map((color) => (
                      <option key={color} value={color} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-neutral-300">
                    Size
                  </span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
                    defaultValue={report.query.size}
                    name="size"
                  >
                    <option value="">Any</option>
                    {report.availableSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-neutral-300">
                    Warehouse
                  </span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
                    defaultValue={report.query.warehouse}
                    name="warehouse"
                  >
                    <option value="">Any</option>
                    {report.availableWarehouses.map((warehouse) => (
                      <option key={warehouse} value={warehouse}>
                        {warehouse}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-neutral-300">
                    Need qty
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
                    defaultValue={report.query.minQty}
                    min="1"
                    name="minQty"
                    type="number"
                  />
                </label>
                <PendingSubmitButton
                  className="h-11 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
                  pendingLabel="Checking"
                >
                  Check
                </PendingSubmitButton>
              </form>
            </section>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-200">
                      Connected
                    </span>
                    {report.partNumber ? (
                      <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                        Part {report.partNumber}
                      </span>
                    ) : null}
                    <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                      Style ID {report.styleID}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold">
                    {report.brandName} {report.styleName}
                  </h2>
                  <p className="mt-2 text-sm text-neutral-400">
                    Endpoint:{" "}
                    <span className="font-mono text-neutral-300">
                      {report.endpoint}
                    </span>
                  </p>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:min-w-[26rem]">
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                    <p className="text-neutral-500">Matching variants</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatNumber(report.filteredVariantCount)}
                    </p>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                    <p className="text-neutral-500">Matching units</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatNumber(report.filteredTotalQty)}
                    </p>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                    <p className="text-neutral-500">Catalog variants</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatNumber(report.variantCount)}
                    </p>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                    <p className="text-neutral-500">Rate limit remaining</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {report.remainingRequests ?? "n/a"}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`mt-5 rounded-md border px-3 py-3 text-sm ${
                  report.filteredVariantCount > 0
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-red-400/30 bg-red-400/10 text-red-100"
                }`}
              >
                <p className="font-medium">
                  {availabilityMessage(
                    report.filteredVariantCount,
                    report.query.minQty,
                  )}
                </p>
                <p className="mt-1 opacity-80">
                  This confirms supplier availability only. Customer-facing
                  promises still need production capacity, decoration details,
                  and final purchasing approval.
                </p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
                <h2 className="text-lg font-semibold">Warehouse inventory</h2>
                <div className="mt-5 space-y-3">
                  {report.warehouseTotals.map((warehouse) => {
                    const width = percent(warehouse.qty, report.totalQty);

                    return (
                      <div key={warehouse.warehouse}>
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium text-neutral-200">
                            {warehouse.warehouse}
                          </span>
                          <span className="font-mono text-neutral-400">
                            {formatNumber(warehouse.qty)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${Math.max(width, 1)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
                <h2 className="text-lg font-semibold">Size coverage</h2>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {report.sizeTotals.map((size) => (
                    <div
                      className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
                      key={size.sizeName}
                    >
                      <p className="text-sm text-neutral-500">{size.sizeName}</p>
                      <p className="mt-1 font-mono text-lg font-semibold">
                        {formatNumber(size.qty)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-semibold">Top colors</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Highest available quantity across all sizes and warehouses.
                  </p>
                </div>
                <span className="text-sm text-neutral-400">
                  Showing 12 of {report.colorCount}
                </span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {report.colorTotals.slice(0, 12).map((color) => (
                  <div
                    className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
                    key={color.colorName}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 overflow-hidden rounded-md border border-neutral-700">
                        <span className="flex-1" style={colorStyle(color.color1)} />
                        {color.color2 ? (
                          <span
                            className="flex-1"
                            style={colorStyle(color.color2)}
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-100">
                          {color.colorName}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {color.variantCount} variants
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 font-mono text-lg font-semibold">
                      {formatNumber(color.qty)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-semibold">Matching variants</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Filtered to variants that can satisfy the requested
                    quantity.
                  </p>
                </div>
                <span className="text-sm text-neutral-400">
                  {report.filteredVariantCount} matching · {report.variantCount}{" "}
                  catalog variants
                </span>
              </div>

              {report.filteredVariants.length > 0 ? (
                <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-neutral-800 text-left text-neutral-200">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Color</th>
                        <th className="px-3 py-2 font-semibold">Size</th>
                        <th className="px-3 py-2 font-semibold">SKU</th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Price
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Total
                        </th>
                        <th className="px-3 py-2 font-semibold">Warehouses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                      {report.filteredVariants.slice(0, 80).map((variant) => (
                        <tr key={variant.sku}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="flex h-6 w-6 overflow-hidden rounded border border-neutral-700">
                                <span
                                  className="flex-1"
                                  style={colorStyle(variant.color1)}
                                />
                                {variant.color2 ? (
                                  <span
                                    className="flex-1"
                                    style={colorStyle(variant.color2)}
                                  />
                                ) : null}
                              </span>
                              <span className="whitespace-nowrap">
                                {variant.colorName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {variant.sizeName}
                          </td>
                          <td className="px-3 py-2 font-mono text-neutral-300">
                            {variant.sku}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatCurrency(variant.customerPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">
                            {formatNumber(variant.totalQty)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex max-w-lg flex-wrap gap-1">
                              {variant.warehouses
                                .filter((warehouse) =>
                                  report.query.warehouse
                                    ? warehouse.warehouse ===
                                      report.query.warehouse
                                    : true,
                                )
                                .slice(0, 8)
                                .map((warehouse) => (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-xs font-medium text-neutral-950 ${stockTone(
                                      warehouse.qty,
                                    )}`}
                                    key={`${variant.sku}-${warehouse.warehouse}`}
                                  >
                                    {warehouse.warehouse}{" "}
                                    {formatNumber(warehouse.qty)}
                                  </span>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-300">
                  No variants matched this request. Try lowering the quantity,
                  clearing the warehouse, or broadening the color search.
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">Connection</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Read-only S&S products endpoint test.
                </p>
              </div>
              <span className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-xs font-medium text-red-200">
                Failed
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <dt className="text-neutral-500">Endpoint</dt>
                <dd className="mt-1 break-all font-mono text-neutral-200">
                  {report.endpoint ?? "Not requested"}
                </dd>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <dt className="text-neutral-500">Status</dt>
                <dd className="mt-1 font-mono text-neutral-200">
                  {report.status ?? "n/a"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
              {report.error}
            </p>
            {report.data ? (
              <pre className="mt-5 max-h-[28rem] overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs leading-5 text-neutral-300">
                {JSON.stringify(report.data, null, 2)}
              </pre>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
