// Convert a Google Sheets URL to a CSV export URL
export function toCsvUrl(url: string): string {
  const trimmed = url.trim();
  if (/output=csv/.test(trimmed)) return trimmed;
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    const id = m[1];
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

/** Normalize Arabic names for fuzzy matching (alef variants, taa marbuta, ya, spaces, diacritics) */
export function normalizeArabic(s: string): string {
  return (s || "")
    .replace(/[\u064B-\u065F\u0670]/g, "") // diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface SheetRow {
  name: string;
  halaqaName: string;
  nationalId: string;
  phone: string;
  level: string;
  levelType: "gold" | "silver";
  teacherName: string;
  teacherCode: string;
  assistantName: string;
  assistantCode: string;
  isTalqeen: boolean;
}

export function normalizeRows(rows: string[][]): SheetRow[] {
  const start = rows[0] && /[ا-ي]/.test(rows[0][0]) && (rows[0][0].includes("اسم") || rows[0][0].includes("الطالب")) ? 1 : 0;
  return rows.slice(start).map((r) => {
    const lt = (r[5] || "").trim();
    return {
      name: (r[0] || "").trim().replace(/\s+/g, " "),
      halaqaName: (r[1] || "").trim().replace(/\s+/g, " "),
      nationalId: (r[2] || "").trim(),
      phone: (r[3] || "").trim(),
      level: (r[4] || "").trim(),
      levelType: lt.includes("فض") ? "silver" : "gold",
      teacherName: (r[6] || "").trim().replace(/\s+/g, " "),
      teacherCode: (r[7] || "").trim(),
      assistantName: (r[8] || "").trim().replace(/\s+/g, " "),
      assistantCode: (r[9] || "").trim(),
      isTalqeen: /تلقين|نعم|true|1/i.test((r[10] || "").trim()),
    } as SheetRow;
  }).filter((r) => r.name && r.nationalId);
}
