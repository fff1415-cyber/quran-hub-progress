/** tier slot × 1000 + phase — see plan-excel-import planLevelNumber */
export function phaseFromLevelNumber(levelNumber: number): number {
  return levelNumber % 1000;
}

export function tierSlotFromLevelNumber(levelNumber: number): number {
  return Math.floor(levelNumber / 1000);
}

export function isFirstPhasePlan(levelNumber: number): boolean {
  return phaseFromLevelNumber(levelNumber) === 1;
}

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function arabicDayName(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return AR_DAYS[d.getDay()] ?? "";
}
