// Convert a Google Sheets URL to a CSV export URL
export function toCsvUrl(url: string): string {
  const trimmed = url.trim();
  // Already a published CSV link
  if (/output=csv/.test(trimmed)) return trimmed;
  // Standard /spreadsheets/d/<ID>/...
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    const id = m[1];
    // Try to extract gid
    const gidM = trimmed.match(/[#&?]gid=(\d+)/);
    const gid = gidM ? gidM[1] : "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }
  return trimmed;
}

// Minimal CSV parser (handles quoted fields)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim().length > 0));
}

export interface SheetRow {
  name: string;
  halaqaName: string;
  nationalId: string;
  phone: string;
  level: string;
  levelType: "gold" | "silver";
}

export function normalizeRows(rows: string[][]): SheetRow[] {
  // Skip header if first row looks like header
  const start = rows[0] && /[ا-ي]/.test(rows[0][0]) && (rows[0][0].includes("اسم") || rows[0][0].includes("الطالب")) ? 1 : 0;
  return rows.slice(start).map((r) => {
    const lt = (r[5] || "").trim();
    return {
      name: (r[0] || "").trim(),
      halaqaName: (r[1] || "").trim(),
      nationalId: (r[2] || "").trim(),
      phone: (r[3] || "").trim(),
      level: (r[4] || "").trim(),
      levelType: lt.includes("فض") ? "silver" : "gold",
    } as SheetRow;
  }).filter((r) => r.name && r.nationalId);
}
