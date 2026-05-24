const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس",
  "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر",
];

export function weekLabel(n: number): string {
  const o = ORDINALS[n - 1] || String(n);
  return `الأسبوع ${o}`;
}

export function ordinal(n: number): string {
  return ORDINALS[n - 1] || String(n);
}
