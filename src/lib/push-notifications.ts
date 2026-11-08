import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/auth-session";
import { isPushEventEnabled, loadPushNotificationSettings } from "@/lib/push-notification-settings";

export type PushEventType = "student_absent" | "student_late" | "staff_checkin" | "teacher_transfer";

export interface PushDispatchPayload {
  event: PushEventType;
  title: string;
  body: string;
  url?: string;
  targets: {
    roles?: string[];
    studentIds?: string[];
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function pushApi<T>(path: string, init: RequestInit & { auth?: string } = {}): Promise<T> {
  const { auth, headers, ...rest } = init;
  const res = await fetch(buildRphpUrl(path), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...headers,
    },
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await pushApi<{ publicKey: string | null; enabled: boolean }>("/push/vapid-public-key", {
      method: "GET",
    });
    return res.enabled && res.publicKey ? res.publicKey : null;
  } catch {
    return null;
  }
}

export async function registerPushSubscription(subscription: PushSubscription): Promise<void> {
  const token = getToken();
  if (!token) return;
  const json = subscription.toJSON();
  await pushApi("/push/subscribe", {
    method: "POST",
    auth: token,
    body: JSON.stringify({ subscription: json }),
  });
}

export async function unregisterPushSubscription(endpoint?: string): Promise<void> {
  const token = getToken();
  if (!token || !endpoint) return;
  await pushApi("/push/unsubscribe", {
    method: "POST",
    auth: token,
    body: JSON.stringify({ endpoint }),
  });
}

export async function dispatchPushEvent(payload: PushDispatchPayload): Promise<void> {
  const token = getToken();
  if (!token) return;
  if (!isPushEventEnabled(payload.event)) return;
  try {
    await pushApi("/push/dispatch", {
      method: "POST",
      auth: token,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("Push dispatch failed:", e);
  }
}

/** Prompt for notification permission and register push subscription after login. */
export async function initPushAfterLogin(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  if (!loadPushNotificationSettings().enabled) return;

  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    await registerPushSubscription(sub);
  } catch (e) {
    console.warn("Push registration skipped:", e);
  }
}

export async function teardownPushOnLogout(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await unregisterPushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
}
