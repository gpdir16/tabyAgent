import { spawn } from "node:child_process";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "chromium";

const PAD_X = 16;
const PAD_Y = 8;
const ROW_H = 24;
const BODY_PAD = 10;
const MAX_WIDTH = 960;
const FONT = '12px/1.35 "Noto Sans CJK KR", "Noto Sans", system-ui, sans-serif';

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function cellTextWidth(text) {
    let w = 0;
    for (const ch of String(text ?? "")) {
        const code = ch.codePointAt(0) ?? 0;
        w += code > 0xff ? 13 : 7;
    }
    return w;
}

function measureTable(rows) {
    const colCount = Math.max(...rows.map((r) => r.length), 0);
    const colWidths = Array(colCount).fill(40);
    for (const row of rows) {
        for (let i = 0; i < colCount; i++) {
            colWidths[i] = Math.max(colWidths[i], cellTextWidth(row[i] ?? "") + PAD_X);
        }
    }

    let tableWidth = colWidths.reduce((a, b) => a + b, 0) + 2;
    let wrap = false;
    if (tableWidth > MAX_WIDTH - BODY_PAD * 2) {
        const scale = (MAX_WIDTH - BODY_PAD * 2) / tableWidth;
        for (let i = 0; i < colCount; i++) colWidths[i] = Math.max(48, Math.floor(colWidths[i] * scale));
        tableWidth = colWidths.reduce((a, b) => a + b, 0) + 2;
        wrap = true;
    }

    const width = Math.ceil(tableWidth + BODY_PAD * 2);
    const height = Math.ceil(rows.length * ROW_H + 2 + BODY_PAD * 2);
    return { colWidths, tableWidth, width, height, wrap };
}

function buildTableHtml(rows) {
    if (!rows.length) return "";
    const [header, ...body] = rows;
    const size = measureTable(rows);
    const { colWidths, tableWidth, width, height, wrap } = size;
    const cols = colWidths.map((w) => `<col style="width:${w}px">`).join("");
    const ths = header.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const trs = body.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
    const wrapCss = wrap ? "td, th { white-space: normal; word-break: break-word; }" : "td, th { white-space: nowrap; }";

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  body { padding: ${BODY_PAD}px; background: #17212b; color: #e8e8e8; }
  table { border-collapse: collapse; table-layout: fixed; width: ${tableWidth}px; font: ${FONT}; }
  th, td {
    border: 1px solid #3d4f5f;
    padding: ${Math.floor(PAD_Y / 2)}px ${Math.floor(PAD_X / 2)}px;
    text-align: left;
    vertical-align: top;
  }
  ${wrapCss}
  th { background: #232e3c; font-weight: 600; color: #fff; }
  tr:nth-child(even) td { background: #1a2330; }
  tr:nth-child(odd) td { background: #17212b; }
</style></head><body>
<table><colgroup>${cols}</colgroup><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
</body></html>`;
}

function runChromiumScreenshot(htmlPath, pngPath, width, height) {
    return new Promise((resolve, reject) => {
        const args = [
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            `--window-size=${width},${height}`,
            `--screenshot=${pngPath}`,
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            `file://${htmlPath}`,
        ];
        const proc = spawn(CHROMIUM, args, { stdio: ["ignore", "pipe", "pipe"] });
        let err = "";
        proc.stderr.on("data", (d) => {
            err += d.toString();
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code === 0 && fs.existsSync(pngPath)) resolve(pngPath);
            else reject(new Error(err.trim() || `chromium exit ${code}`));
        });
    });
}

/** Single table → tight dark PNG (sent as its own Telegram photo). */
export async function renderTablePng(rows) {
    if (!rows?.length) throw new Error("empty table");
    const size = measureTable(rows);
    const id = randomUUID();
    const htmlPath = `/tmp/taby-table-${id}.html`;
    const pngPath = `/tmp/taby-table-${id}.png`;
    fs.writeFileSync(htmlPath, buildTableHtml(rows), "utf8");
    try {
        await runChromiumScreenshot(htmlPath, pngPath, size.width, size.height);
        return pngPath;
    } finally {
        fs.unlink(htmlPath, () => {});
    }
}
