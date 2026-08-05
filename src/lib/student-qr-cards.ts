import QRCode from "qrcode";

export type StudentQrCard = {
  id: string;
  name: string;
  halaqaName?: string;
};

export type PrintQrCardsOptions = {
  brandName: string;
  logoUrl?: string | null;
  subtitle?: string;
};

export async function generateStudentQrDataUrl(studentId: string): Promise<string> {
  return QRCode.toDataURL(studentId, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#1e293b", light: "#ffffff" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printStyles(): string {
  return `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #0f172a;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e2e8f0;
    }
    .header img {
      max-height: 72px;
      max-width: 220px;
      object-fit: contain;
      margin-bottom: 8px;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      color: #1e3a5f;
    }
    .header p {
      margin: 6px 0 0;
      color: #64748b;
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .card {
      border: 1.5px dashed #cbd5e1;
      border-radius: 14px;
      padding: 14px;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .card h2 {
      margin: 0 0 8px;
      font-size: 17px;
    }
    .card .meta {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 10px;
    }
    .card img.qr {
      width: 180px;
      height: 180px;
      object-fit: contain;
      margin: 0 auto;
      display: block;
    }
    .card .id {
      margin-top: 8px;
      font-size: 10px;
      color: #94a3b8;
      word-break: break-all;
    }
    .loading {
      min-height: 40vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: #64748b;
    }
    @media print {
      body { padding: 0; }
      .card { border-color: #94a3b8; }
      .loading { display: none; }
    }
  `;
}

function buildPrintHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${printStyles()}</style>
</head>
<body>${body}</body>
</html>`;
}

function loadingBody(brandName: string): string {
  return `<div class="loading">جاري تجهيز بطاقات ${escapeHtml(brandName)}…</div>`;
}

/** Opens print target synchronously — must run inside a click handler before any await. */
function openPrintTarget(title: string, brandName: string): Window | null {
  const win = window.open("about:blank", "_blank");
  if (!win) {
    return null;
  }
  win.document.open();
  win.document.write(buildPrintHtml(title, loadingBody(brandName)));
  win.document.close();
  return win;
}

function triggerPrint(target: Window): void {
  target.focus();
  const runPrint = () => {
    try {
      target.print();
    } catch {
      /* ignore — user can print manually from the opened tab */
    }
  };
  if (target.document.readyState === "complete") {
    setTimeout(runPrint, 300);
  } else {
    target.addEventListener("load", () => setTimeout(runPrint, 300), { once: true });
  }
}

function printViaHiddenIframe(html: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const frameWin = iframe.contentWindow;
  const doc = iframe.contentDocument ?? frameWin?.document;
  if (!doc || !frameWin) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1500);
  };

  setTimeout(() => {
    frameWin.focus();
    try {
      frameWin.print();
    } finally {
      cleanup();
    }
  }, 400);

  return true;
}

function writeToWindow(win: Window, title: string, body: string): void {
  win.document.open();
  win.document.write(buildPrintHtml(title, body));
  win.document.close();
}

async function buildCardsBody(
  students: StudentQrCard[],
  options: PrintQrCardsOptions,
): Promise<string> {
  const cards = await Promise.all(
    students.map(async (student) => ({
      ...student,
      qr: await generateStudentQrDataUrl(student.id),
    })),
  );

  const logoBlock = options.logoUrl
    ? `<img src="${escapeHtml(options.logoUrl)}" alt="" />`
    : "";
  const subtitle = options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : "";

  const grid = cards
    .map(
      (card) => `<div class="card">
        <h2>${escapeHtml(card.name)}</h2>
        <div class="meta">${escapeHtml(card.halaqaName ?? "")}</div>
        <img class="qr" src="${card.qr}" alt="QR ${escapeHtml(card.name)}" />
        <div class="id">${escapeHtml(card.id)}</div>
      </div>`,
    )
    .join("");

  return `<div class="header">${logoBlock}<h1>${escapeHtml(options.brandName)}</h1>${subtitle}</div><div class="grid">${grid}</div>`;
}

export async function printStudentQrCards(
  students: StudentQrCard[],
  options: PrintQrCardsOptions,
): Promise<boolean> {
  if (students.length === 0) {
    return false;
  }

  const title = `بطاقات QR — ${options.brandName}`;

  // Must open before any await so the browser treats it as user-initiated.
  const win = openPrintTarget(title, options.brandName);

  try {
    const body = await buildCardsBody(students, options);
    const html = buildPrintHtml(title, body);

    if (win) {
      writeToWindow(win, title, body);
      triggerPrint(win);
      return true;
    }

    return printViaHiddenIframe(html);
  } catch (e) {
    if (win && !win.closed) {
      win.close();
    }
    throw e;
  }
}

export async function printSingleStudentQrCard(
  student: StudentQrCard,
  options: { brandName: string; logoUrl?: string | null },
): Promise<boolean> {
  return printStudentQrCards([student], options);
}
