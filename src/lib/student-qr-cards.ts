import QRCode from "qrcode";

export type StudentQrCard = {
  id: string;
  name: string;
  halaqaName?: string;
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

function printDocumentHtml(title: string, body: string): boolean {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!win) {
    return false;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
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
    @media print {
      body { padding: 0; }
      .card { border-color: #94a3b8; }
    }
  </style>
</head>
<body>${body}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 350);
  return true;
}

export async function printStudentQrCards(
  students: StudentQrCard[],
  options: { brandName: string; logoUrl?: string | null; subtitle?: string },
): Promise<boolean> {
  if (students.length === 0) {
    return false;
  }

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

  const body = `<div class="header">${logoBlock}<h1>${escapeHtml(options.brandName)}</h1>${subtitle}</div><div class="grid">${grid}</div>`;
  return printDocumentHtml(`بطاقات QR — ${options.brandName}`, body);
}

export async function printSingleStudentQrCard(
  student: StudentQrCard,
  options: { brandName: string; logoUrl?: string | null },
): Promise<boolean> {
  return printStudentQrCards([student], options);
}
