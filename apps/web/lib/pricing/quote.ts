import type { Quote, Service } from "./calculate.ts";

export const serviceLabels: Record<Service, string> = { print: "Screen print", embroidery: "Embroidery", "dtg-dtf": "DTG / DTF" };
export const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
export const range = (low: number, high: number) => low === high ? money(low) : `${money(low)}–${money(high)}`;
export type Snapshot = { id: string; name: string; service: Service; project: string; subtitle: string; unitPrice: string; total: string; facts: { label: string; value: string }[] };
export function snapshot(quote: Quote, service: Service, project: string, garment: string, quantity: number): Snapshot {
  return {
    id: crypto.randomUUID(), name: project.trim() || "Untitled quote", service,
    project: project.trim() || "Untitled quote", subtitle: `${quantity} × ${garment.trim() || "Garment"} · ${serviceLabels[service]}`,
    unitPrice: quote.review ? "Approval required" : range(quote.lowUnit, quote.highUnit),
    total: quote.review ? `${money(quote.lowTotal)}+ (provisional)` : range(quote.lowTotal, quote.highTotal),
    facts: [{ label: "Quantity tier", value: quote.tier }, ...quote.details.map(d => ({ label: d.label, value: money(d.value) })),
      ...quote.reviewReasons.map(value => ({ label: "Review", value }))],
  };
}
export function parseSnapshots(value: string | null, service: Service): Snapshot[] {
  if (!value) return [];
  try {
    const data: unknown = JSON.parse(value);
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is Snapshot => {
      if (!item || typeof item !== "object" || item.service !== service) return false;
      return ["id", "name", "project", "subtitle", "unitPrice", "total"].every(key => typeof item[key] === "string" && item[key].length <= 2000)
        && Array.isArray(item.facts) && item.facts.length <= 50 && item.facts.every((fact: { label?: unknown; value?: unknown } | null) => fact && typeof fact.label === "string" && typeof fact.value === "string");
    }).slice(0, 3);
  } catch { return []; }
}
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export function quoteText(options: Snapshot[]) {
  return ["MYTHIC PRESS · QUOTE", ...options.map(option => [option.name, option.subtitle, `Per piece: ${option.unitPrice}`, `Order total: ${option.total}`, ...option.facts.map(f => `${f.label}: ${f.value}`)].join("\n")), "Estimate only. Artwork, availability, shipping, and applicable taxes require confirmation."].join("\n\n");
}
export function quoteHtml(options: Snapshot[]) {
  return `<div style="font-family:Arial,sans-serif;color:#171717;max-width:720px"><h2>MYTHIC PRESS</h2>${options.map(o => `<section style="border-top:2px solid #171717;padding:16px 0"><h3>${escapeHtml(o.name)}</h3><p>${escapeHtml(o.subtitle)}</p><p>Per piece: <strong>${escapeHtml(o.unitPrice)}</strong><br>Order total: <strong>${escapeHtml(o.total)}</strong></p><table>${o.facts.map(f => `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(f.label)}</td><td>${escapeHtml(f.value)}</td></tr>`).join("")}</table></section>`).join("")}<p>Estimate only. Artwork, availability, shipping, and applicable taxes require confirmation.</p></div>`;
}
