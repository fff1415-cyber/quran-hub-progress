import { DEFAULT_EVALUATION_SETTINGS, type EvaluationRulesSnapshot, type EvaluationSettings } from "@/lib/evaluation-types";

export function validEvaluationRules(value: unknown): value is EvaluationRulesSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as EvaluationRulesSnapshot;
  return typeof candidate.reference === "string" && !!candidate.reference
    && typeof candidate.adoptedAt === "string" && Number.isFinite(Date.parse(candidate.adoptedAt))
    && !!candidate.settings && Object.keys(DEFAULT_EVALUATION_SETTINGS).every(key => {
      const number = candidate.settings[key as keyof EvaluationSettings];
      return typeof number === "number" && Number.isFinite(number) && number >= 0;
    });
}

export function snapshotEvaluationRules(settings: EvaluationSettings): EvaluationRulesSnapshot {
  return { reference: crypto.randomUUID(), adoptedAt: new Date().toISOString(), settings: structuredClone(settings) };
}
