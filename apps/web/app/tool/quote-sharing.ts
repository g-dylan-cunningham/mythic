import { quoteHtml, quoteText, type Snapshot } from "@/lib/pricing/quote";

export async function copyEmail(options: Snapshot[]) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([quoteHtml(options)], { type: "text/html" }),
        "text/plain": new Blob([quoteText(options)], { type: "text/plain" }),
      })]);
      return "Copied for email.";
    } catch { /* Try plain text if rich clipboard access is unavailable. */ }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(quoteText(options));
    return "Copied as plain text.";
  }
  throw new Error("Clipboard unavailable. Use Download text instead.");
}
export function downloadText(options: Snapshot[]) {
  download(new Blob([quoteText(options)], { type: "text/plain" }), "mythic-quote.txt");
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyImage(options: Snapshot[]) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable in this browser.");
  const lines: { text: string; heading?: boolean }[] = [{ text: "MYTHIC PRESS", heading: true }, { text: "Your merchandise estimate" }];
  // Wrap measured text before sizing the canvas so long project names are preserved.
  const add = (text: string, heading = false) => {
    context.font = heading ? "bold 26px Arial" : "20px Arial";
    let line = "";
    for (const character of text) {
      if (context.measureText(line + character).width > 780 && line) { lines.push({ text: line, heading }); line = ""; }
      line += character;
    }
    lines.push({ text: line, heading });
  };
  for (const option of options) {
    add(""); add(option.name, true); add(option.subtitle);
    add(`Per piece: ${option.unitPrice}`); add(`Order total: ${option.total}`, true);
    for (const fact of option.facts) add(`${fact.label}: ${fact.value}`);
  }
  add(""); add("Estimate only. Artwork, availability, shipping and taxes require confirmation.");
  canvas.width = 900; canvas.height = 80 + lines.length * 36;
  context.fillStyle = "#101412"; context.fillRect(0, 0, canvas.width, canvas.height);
  lines.forEach((line, index) => {
    context.font = line.heading ? "bold 26px Arial" : "20px Arial";
    context.fillStyle = line.heading ? "#7ee2b8" : "#f4f4f4";
    context.fillText(line.text, 50, 60 + index * 36);
  });
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to create PNG.")), "image/png"));
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); return "Quote image copied."; } catch { /* Download fallback below. */ }
  }
  download(blob, "mythic-quote.png");
  return "Quote image downloaded.";
}
