function base64UrlToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

export function getBrowserPushSupport() {
  return Boolean("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
}

export function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function registerCasaSyncServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador nao suporta notificacoes em segundo plano.");
  }
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeToBrowserPush(publicKey) {
  if (!getBrowserPushSupport()) {
    throw new Error("Este navegador nao suporta notificacoes push.");
  }
  if (!publicKey) {
    throw new Error("Chave publica de notificacao nao configurada.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissao de notificacao nao concedida.");
  }

  const registration = await registerCasaSyncServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing.toJSON();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey)
  });
  return subscription.toJSON();
}

export async function unsubscribeFromBrowserPush() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const payload = subscription.toJSON();
  await subscription.unsubscribe();
  return payload;
}
