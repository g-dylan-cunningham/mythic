"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { calculate, defaults, finishingServices, rushOptions, stitchRanges, type PricingInput, type Service } from "@/lib/pricing/calculate";
import { money, parseSnapshots, range, serviceLabels, snapshot, type Snapshot } from "@/lib/pricing/quote";
import { copyEmail, copyImage, downloadText } from "./quote-sharing";
import styles from "./pricing.module.css";

export function PricingTool({ userId }: { userId: string }) {
  const [service, setService] = useState<Service>("print");
  return <main className={styles.tool}>
    <div className={styles.shell}>
      <Link href="/dashboard" className={styles.back}>← Dashboard</Link>
      <header className={styles.heading}><p>MYTHIC PRESS · PRICING TOOLS</p><h1>Price your next project.</h1><span>Build an estimate, compare options, and share a quote.</span></header>
      <nav aria-label="Pricing services" className={styles.tabs}>
        {(Object.keys(serviceLabels) as Service[]).map(key => <button key={key} type="button" aria-pressed={key === service} onClick={() => setService(key)}>{serviceLabels[key]}</button>)}
      </nav>
      <Calculator key={`${userId}:${service}`} service={service} userId={userId} />
    </div>
  </main>;
}

function Calculator({ service, userId }: { service: Service; userId: string }) {
  const [input, setInput] = useState<PricingInput>(() => defaults(service));
  const [project, setProject] = useState("Sample quote");
  const [garment, setGarment] = useState(service === "embroidery" ? "Standard polo" : "Standard tee");
  const [options, setOptions] = useState<Snapshot[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const storageKey = `mythic-quote-options-${service}:${userId}`;
  useEffect(() => {
    // Restore browser-only snapshots after hydration; never persist the server's empty state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setOptions(parseSnapshots(sessionStorage.getItem(storageKey), service)); }
    catch { setMessage("Session storage is unavailable. Options will remain available until you leave this page."); }
    setReady(true);
  }, [storageKey, service]);
  const quote = calculate(input);
  const update = <K extends keyof PricingInput>(key: K, value: PricingInput[K]) => setInput(current => ({ ...current, [key]: value }));
  const finish = <K extends keyof PricingInput["finishing"]>(key: K, value: PricingInput["finishing"][K]) => setInput(current => ({ ...current, finishing: { ...current.finishing, [key]: value } }));
  const reset = () => { setInput(defaults(service)); setProject("Sample quote"); setGarment(service === "embroidery" ? "Standard polo" : "Standard tee"); };
  const persist = (next: Snapshot[]) => {
    setOptions(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setMessage("Unable to persist options in this browser. Keep this page open or export your quotes."); }
  };
  const current = () => snapshot(quote, service, project, garment, input.quantity);
  const save = () => {
    if (!quote.valid || !ready) return;
    if (options.length >= 3) { setMessage("Three options are saved. Remove one before adding another."); return; }
    persist([...options, current()]); reset(); setMessage("Option saved. Build your next option below.");
  };
  const share = async (kind: "email" | "image", selection: Snapshot[]) => {
    setBusy(true);
    try { setMessage(await (kind === "email" ? copyEmail(selection) : copyImage(selection))); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to export. Use Download text instead."); }
    finally { setBusy(false); }
  };
  const numeric = (label: string, key: keyof PricingInput, value: number, min = 0, step = "1", max?: number) => <label>{label}<input type="number" min={min} max={max} step={step} value={Number.isNaN(value) ? "" : value} onChange={e => update(key, e.target.value === "" ? NaN : Number(e.target.value))} /></label>;
  const check = (label: string, key: "puff" | "newDesign" | "hemTags") => <label className={styles.check}><input type="checkbox" checked={input[key]} onChange={e => update(key, e.target.checked)} />{label}</label>;
  return <>
    <div className={styles.grid}>
      <section className={styles.card} aria-label={`${serviceLabels[service]} project inputs`}>
        <div className={styles.cardTitle}><h2>{serviceLabels[service]} project</h2><button type="button" onClick={reset}>Reset inputs</button></div>
        <div className={styles.fields}>
          <label>Project name<input maxLength={160} value={project} onChange={e => setProject(e.target.value)} /></label>
          <label>Garment / style<input maxLength={160} value={garment} onChange={e => setGarment(e.target.value)} /></label>
          {numeric("Quantity", "quantity", input.quantity, 1)}
          {numeric("Blank garment cost ($)", "garmentCost", input.garmentCost, 0, "0.01")}
        </div>
        {service === "print" && <>
          {input.colors.map((colors, index) => <fieldset key={index} disabled={index === 2 && input.colors[1] === 0} className={styles.colors}>
            <legend>Location {index + 1} colors {index > 0 && "(optional)"}</legend>
            <div>{Array.from({ length: index === 0 ? 8 : 9 }, (_, i) => index === 0 ? i + 1 : i).map(value => <button type="button" key={value} aria-pressed={colors === value} onClick={() => {
              const next: PricingInput["colors"] = [...input.colors]; next[index] = value; if (index === 1 && value === 0) next[2] = 0; update("colors", next);
            }}>{value || "None"}</button>)}</div>
            {index === 2 && input.colors[1] === 0 && <p>Add location 2 first.</p>}
          </fieldset>)}
          <label>Specialty inks · $40 each<select value={input.specialtyInks} onChange={e => update("specialtyInks", Number(e.target.value))}>{Array.from({ length: 9 }, (_, n) => <option key={n} value={n}>{n === 0 ? "None" : `${n} · ${money(n * 40)} project fee`}</option>)}</select></label>
        </>}
        {service === "embroidery" && <>
          <label>Order type<select value={input.mode} onChange={e => update("mode", e.target.value as PricingInput["mode"])}><option value="supplied">Mythic-supplied garment</option><option value="walk-in">Walk-in / first-time contract</option><option value="recurring">Recurring contract</option></select></label>
          <label>Stitch count<select value={input.stitches} onChange={e => update("stitches", Number(e.target.value))}>{stitchRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          {input.stitches > 25000 && <p className={styles.notice}>Consult the embroidery department for an estimate above 25,000 stitches.</p>}
          <div className={styles.fields}>{numeric("Additional hat locations", "hatLocations", input.hatLocations)}{numeric("Stitch-outs · $10 each", "stitchOuts", input.stitchOuts)}{numeric("Color changes · $5 each", "colorChanges", input.colorChanges)}{numeric("Winter surcharge / piece ($)", "winterSurcharge", input.winterSurcharge, 0, "0.01")}</div>
          {check("New design / digitizing", "newDesign")}{check("Puff embroidery · $3 / piece", "puff")}{check("Hem tags", "hemTags")}
        </>}
        {service === "dtg-dtf" && <>
          <label>Method<select value={input.method} onChange={e => setInput(current => ({ ...current, method: e.target.value as PricingInput["method"], firstLocation: "full" }))}><option value="dtf">DTF</option><option value="dtg">DTG</option></select></label>
          <label>First location<select value={input.firstLocation} onChange={e => update("firstLocation", e.target.value as PricingInput["firstLocation"])}><option value="full">Full chest</option><option value="left-chest">Left chest</option>{input.method === "dtf" && <option value="hat">Hat</option>}</select></label>
          <div className={styles.fields}>{(["secondLocation", "thirdLocation"] as const).map((key, i) => <label key={key}>Location {i + 2}<select value={input[key]} onChange={e => update(key, e.target.value as PricingInput[typeof key])}><option value="none">Not used</option><option value="full">Full front / back</option><option value="small">Small · left chest / yoke</option></select></label>)}</div>
          {input.method === "dtg" && <label>Garment preparation<select value={input.garmentPreparation} onChange={e => update("garmentPreparation", e.target.value as PricingInput["garmentPreparation"])}><option value="light">Light garment</option><option value="pretreated">Pretreated garment</option></select></label>}
        </>}
        <fieldset className={styles.finishing}><legend>Finishing services</legend>
          <label>Folding / packaging<select value={input.finishing.service} onChange={e => finish("service", e.target.value as PricingInput["finishing"]["service"])}>{Object.entries(finishingServices).map(([key, service]) => <option key={key} value={key}>{service.label}</option>)}</select></label>
          <label>Clothing steaming<select value={input.finishing.steamingRate} onChange={e => finish("steamingRate", Number(e.target.value))}>{[0, 1, 1.25, 1.5, 1.75, 2].map(n => <option key={n} value={n}>{n ? `${money(n)} / piece` : "None"}</option>)}</select></label>
          {service !== "embroidery" && <label className={styles.check}><input type="checkbox" checked={input.finishing.insideTags} onChange={e => finish("insideTags", e.target.checked)} />Inside sizing tags · $3–$2 / piece</label>}
          <p>Matrix finishing begins at 25 pieces. Rates adjust at 100, 250, and 500 pieces.</p>
        </fieldset>
        <label>Turnaround<select value={input.rush} onChange={e => update("rush", e.target.value)}>{rushOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
      </section>
      <section className={`${styles.card} ${styles.estimate}`} aria-label="Live estimate">
        <p className={styles.eyebrow}>LIVE ESTIMATE · {quote.valid ? quote.review ? "REVIEW REQUIRED" : "READY" : "CHECK INPUTS"}</p>
        <h2>{project || "Untitled quote"}</h2><p>{input.quantity || "—"} × {garment || "Garment"}</p>
        {quote.valid ? <>
          <p className={styles.unitLabel}>SELLING PRICE / PIECE</p><p className={styles.price}>{quote.review ? "Approval required" : range(quote.lowUnit, quote.highUnit)}</p>
          <div className={styles.total}><span>{quote.review ? "Provisional base total" : "Estimated order total"}</span><strong>{quote.review ? `${money(quote.provisionalTotal)}+` : range(quote.lowTotal, quote.highTotal)}</strong></div>
          {quote.reviewReasons.map(reason => <p key={reason} className={styles.notice}>{reason}</p>)}
          <dl><dt>Quantity tier</dt><dd>{quote.tier}</dd><dt>Turnaround</dt><dd>{rushOptions.find(r => r.value === input.rush)?.label}</dd><dt>Project fees</dt><dd>{money(quote.projectFees)}</dd></dl>
          <details><summary>Pricing detail</summary><dl>{quote.details.map(d => <div key={d.label}><dt>{d.label}</dt><dd>{money(d.value)}</dd></div>)}</dl><p>Project fees are separate from the displayed unit price. Totals retain full precision until display.</p></details>
        </> : <p role="alert" className={styles.notice}>{quote.error}</p>}
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={!quote.valid || !ready || options.length >= 3} onClick={save}>Save option & build next</button><button type="button" disabled={!quote.valid || busy} onClick={() => share("image", [current()])}>Copy image</button><button type="button" disabled={!quote.valid || busy} onClick={() => share("email", [current()])}>Copy for email</button><button type="button" disabled={!quote.valid} onClick={() => downloadText([current()])}>Download text</button></div>
        <p>Up to three options per service. Resetting inputs keeps your saved options.</p>
      </section>
    </div>
    <section className={styles.saved} aria-label="Saved quote options"><h2>Saved options <span>{options.length} / 3</span></h2>
      <p>Saved in this browser tab for your account. Export quotes before closing the tab.</p>
      <div className={styles.optionGrid}>{options.map(option => <article className={styles.card} key={option.id}>
        <label>Option name<input maxLength={160} value={option.name} onChange={e => persist(options.map(o => o.id === option.id ? { ...o, name: e.target.value } : o))} /></label>
        <p>{option.subtitle}</p><strong>{option.unitPrice} / piece</strong><p>Order total: {option.total}</p>
        {option.facts.filter(f => f.label === "Review").map((f, i) => <p key={i} className={styles.notice}>{f.value}</p>)}
        <div className={styles.actions}><button type="button" disabled={options.length >= 3} onClick={() => persist([...options, { ...option, id: crypto.randomUUID(), name: `${option.name} copy` }])}>Duplicate</button><button type="button" onClick={() => persist(options.filter(o => o.id !== option.id))}>Remove</button><button type="button" disabled={busy} onClick={() => share("email", [option])}>Copy email</button><button type="button" disabled={busy} onClick={() => share("image", [option])}>Copy image</button></div>
      </article>)}</div>
      {options.length > 0 && <div className={styles.actions}><button type="button" disabled={busy} onClick={() => share("email", options)}>Copy comparison for email</button><button type="button" disabled={busy} onClick={() => share("image", options)}>Copy comparison image</button><button type="button" onClick={() => downloadText(options)}>Download comparison text</button><button type="button" onClick={() => { if (window.confirm("Clear all saved options for this service?")) persist([]); }}>Clear saved options</button></div>}
    </section>
    <p role="status" aria-live="polite" className={styles.status}>{message}</p>
    <footer className={styles.footer}>MYTHIC PRESS · Estimate only. Final pricing is subject to artwork review, garment availability, size mix, and production requirements. Shipping and applicable taxes are excluded.</footer>
  </>;
}
