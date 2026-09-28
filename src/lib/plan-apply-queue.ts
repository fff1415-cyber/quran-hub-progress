/**
 * Serialize plan apply-input calls per student so hifz lands before rabt/muraja.
 * UI stays optimistic; this only orders background plan requests.
 * Time O(n) for n queued ops per student; space O(1) per student chain.
 */

const chains = new Map<string, Promise<unknown>>();

export function enqueuePlanApply<T>(studentId: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(studentId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  chains.set(
    studentId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function isRetryablePlanError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return msg.includes("لا توجد مقاطع");
}

/** Retry briefly when rabt/muraja raced ahead of an in-flight hifz completion. */
export async function applyPlanInputWithRetry<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      last = e;
      if (!isRetryablePlanError(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }
  throw last;
}
