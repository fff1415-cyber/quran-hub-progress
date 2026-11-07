/** A timeout cannot prove a write rolled back. Never retry an unknown write automatically. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const upstream = options.signal;
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(input, { ...options, signal: controller.signal });
    // Include a stalled response body, not just time to response headers.
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error) {
    if (timedOut) {
      const method = (options.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "GET" || method === "HEAD") throw new Error("انتهت مهلة قراءة البيانات؛ أعد محاولة التحديث");
      throw new Error("انتهت مهلة الطلب؛ لم يتأكد الحفظ. تحقّق من النتيجة قبل إعادة الإرسال");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", abort);
  }
}
