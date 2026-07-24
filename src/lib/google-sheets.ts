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

export function normalizeArabic(s: string): string {
  return (s || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface SheetRow {
  name: string;
  nationalId: string;
  studentPhone: string;
  parentPhone: string;
  halaqaName: string;
  levelType: "gold" | "silver";
  /** المستوى — التأهيل، النجباء، … */
  instituteLevel: string;
  /** رقم المرحلة العام (1–60 فضي · 1–30 ذهبي) */
  phaseNumber: number;
  startHifzSegment: number;
  dailyMurajaFaces: number;
  dailyRabtFaces: number;
  planStartDate: string;
  teacherName: string;
  teacherCode: string;
  assistantName: string;
  assistantCode: string;
  isTalqeen: boolean;
}

function parseTrack(raw: string): "gold" | "silver" {
  const s = raw.trim();
  return s.includes("فض") ? "silver" : "gold";
}

function colIndex(headers: string[], keys: string[]): number {
  const norm = headers.map((h) => normalizeArabic(h));
  for (const k of keys) {
    const nk = normalizeArabic(k);
    const i = norm.findIndex((h) => h.includes(nk) || nk.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function cell(row: string[], i: number): string {
  return i >= 0 ? (row[i] ?? "").trim() : "";
}

function numCell(row: string[], i: number, fallback: number): number {
  if (i < 0) return fallback;
  const n = Number(row[i]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Extended student import row — supports legacy column order + header-based mapping. */
export function normalizeRows(rows: string[][]): SheetRow[] {
  if (rows.length === 0) return [];

  const first = rows[0].map((c) => String(c).trim());
  const hasHeader = first.some((c) => /اسم|هويه|هوية|الطالب|الحلق|مرحل|مستوى|مسار/i.test(c));
  const headers = hasHeader ? first.map(normalizeArabic) : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const idx = hasHeader
    ? {
        name: colIndex(headers, ["اسم", "الاسم", "اسم الطالب"]),
        nationalId: colIndex(headers, ["هوية", "الهوية", "رقم الهوية"]),
        studentPhone: colIndex(headers, ["جوال الطالب", "جوال طالب", "هاتف الطالب"]),
        parentPhone: colIndex(headers, ["ولي", "ولي الامر", "جوال ولي"]),
        halaqa: colIndex(headers, ["حلقة", "الحلقة"]),
        track: colIndex(headers, ["مسار", "النوع", "ذهب", "فض"]),
        instituteLevel: colIndex(headers, ["المستوى", "مستوى"]),
        phase: colIndex(headers, ["رقم المرحلة", "المرحلة", "مرحلة"]),
        startSeg: colIndex(headers, ["بداية", "مقطع", "بداية الحفظ"]),
        murajaFaces: colIndex(headers, ["مراجعة", "اوجه المراجعة"]),
        rabtFaces: colIndex(headers, ["ربط", "اوجه الربط"]),
        planDate: colIndex(headers, ["تاريخ", "بداية الخطة"]),
        teacher: colIndex(headers, ["معلم", "المعلم"]),
        teacherCode: colIndex(headers, ["رمز المعلم", "كود المعلم"]),
        assistant: colIndex(headers, ["مساعد", "المساعد"]),
        assistantCode: colIndex(headers, ["رمز المساعد"]),
        talqeen: colIndex(headers, ["تلقين"]),
      }
    : null;

  return dataRows.map((r) => {
    if (idx) {
      const instituteLevel = cell(r, idx.instituteLevel);
      const phaseNumber = numCell(r, idx.phase, numCell(r, colIndex(headers, ["level", "مستوى رقم"]), 1));
      return {
        name: cell(r, idx.name).replace(/\s+/g, " "),
        nationalId: cell(r, idx.nationalId),
        studentPhone: cell(r, idx.studentPhone),
        parentPhone: cell(r, idx.parentPhone),
        halaqaName: cell(r, idx.halaqa).replace(/\s+/g, " "),
        levelType: parseTrack(cell(r, idx.track)),
        instituteLevel,
        phaseNumber,
        startHifzSegment: Math.max(1, numCell(r, idx.startSeg, 1)),
        dailyMurajaFaces: numCell(r, idx.murajaFaces, 2),
        dailyRabtFaces: numCell(r, idx.rabtFaces, 2),
        planStartDate: cell(r, idx.planDate),
        teacherName: cell(r, idx.teacher).replace(/\s+/g, " "),
        teacherCode: cell(r, idx.teacherCode),
        assistantName: cell(r, idx.assistant).replace(/\s+/g, " "),
        assistantCode: cell(r, idx.assistantCode),
        isTalqeen: /تلقين|نعم|true|1/i.test(cell(r, idx.talqeen)),
      } satisfies SheetRow;
    }

    // Legacy order: name, halaqa, nid, parentPhone, level, track, teacher...
    const lt = (r[5] || "").trim();
    const legacyPhase = parseInt((r[4] || "").trim(), 10);
    return {
      name: (r[0] || "").trim().replace(/\s+/g, " "),
      nationalId: (r[2] || "").trim(),
      studentPhone: "",
      parentPhone: (r[3] || "").trim(),
      halaqaName: (r[1] || "").trim().replace(/\s+/g, " "),
      levelType: lt.includes("فض") ? "silver" : "gold",
      instituteLevel: "",
      phaseNumber: Number.isFinite(legacyPhase) && legacyPhase > 0 ? legacyPhase : 1,
      startHifzSegment: 1,
      dailyMurajaFaces: 2,
      dailyRabtFaces: 2,
      planStartDate: "",
      teacherName: (r[6] || "").trim().replace(/\s+/g, " "),
      teacherCode: (r[7] || "").trim(),
      assistantName: (r[8] || "").trim().replace(/\s+/g, " "),
      assistantCode: (r[9] || "").trim(),
      isTalqeen: /تلقين|نعم|true|1/i.test((r[10] || "").trim()),
    } satisfies SheetRow;
  }).filter((row) => row.name && row.nationalId);
}

/** Column guide for the import sheet. */
export const STUDENT_IMPORT_COLUMNS = [
  "الاسم",
  "رقم الهوية",
  "جوال الطالب (اختياري)",
  "جوال ولي الأمر",
  "الحلقة",
  "المسار (ذهبي/فضي)",
  "المستوى (التأهيل/النجباء/…)",
  "رقم المرحلة",
  "بداية مقطع الحفظ",
  "أوجه المراجعة/يوم",
  "أوجه الربط/يوم",
  "تاريخ بداية الخطة (اختياري)",
  "المعلم",
  "رمز المعلم",
  "المساعد",
  "رمز المساعد",
  "تلقين (نعم/لا)",
] as const;
