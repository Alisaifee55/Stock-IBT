// =============================================================
// onesignal.js — v1.0 — 14-09-2026
// New in v2.6. All OneSignal contact happens here so no component
// ever touches the global SDK directly.
//
// IDENTITY: the push identity is the SHOP, never a person — logins
// are shared per shop. The external id is the same "member_key" the
// database uses: shops.id as text, or the literal 'HO' for Head
// Office. One send therefore reaches every device that shop is
// signed in on, and the Edge Function can resolve recipients without
// knowing anything about devices.
//
// iOS: Safari only delivers web push when the site has been added to
// the Home Screen (iOS 16.4+). isPushBlockedByIos() detects the "in
// Safari, not installed" case so the UI can say "Add to Home Screen"
// instead of showing a permission button that silently does nothing.
//
// The SDK script itself is loaded by index.html. Every call below
// goes through window.OneSignalDeferred, which is the SDK's own
// queue, so ordering between the script and this module never
// matters.
// =============================================================

export const ONESIGNAL_APP_ID = '7da3c941-0a7f-4ca2-bb25-5cf40d77bda4';

let initStarted = false;

function withOneSignal(fn) {
  if (typeof window === 'undefined') return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

/** True on an iPhone/iPad browsing in Safari rather than the
 *  installed Home Screen app — where web push cannot work at all. */
export function isPushBlockedByIos() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac, but has touch points.
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const installed =
    window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  return !installed;
}

export function initOneSignal() {
  if (initStarted) return;
  initStarted = true;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        serviceWorkerPath: 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        // Our own button does the asking, at a moment the user
        // understands. An automatic prompt on first paint gets
        // dismissed once and then can never be shown again.
        autoResubscribe: true,
        notifyButton: { enable: false },
        promptOptions: { slidedown: { prompts: [] } },
      });
    } catch (err) {
      // Push is a convenience. A failed init must never stop the app
      // from loading — the in-app inbox works regardless.
      console.warn('OneSignal init failed:', err);
    }
  });
}

/** Tie this browser to a shop. Safe to call on every load. */
export function identifyShop(memberKey) {
  if (!memberKey) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.login(String(memberKey));
    } catch (err) {
      console.warn('OneSignal login failed:', err);
    }
  });
}

/** Called on sign-out so the next shop on this device doesn't inherit
 *  the previous shop's notifications. */
export function releaseShop() {
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.logout();
    } catch (err) {
      console.warn('OneSignal logout failed:', err);
    }
  });
}

/** Resolves to { supported, permission, optedIn }. */
export function readPushState() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    // If the SDK never loads (blocked script, offline), don't hang the
    // banner forever.
    const timer = setTimeout(
      () => done({ supported: false, permission: false, optedIn: false }),
      6000
    );
    withOneSignal(async (OneSignal) => {
      try {
        const supported = OneSignal.Notifications.isPushSupported();
        done({
          supported,
          permission: OneSignal.Notifications.permission === true,
          optedIn: OneSignal.User?.PushSubscription?.optedIn === true,
        });
      } catch {
        done({ supported: false, permission: false, optedIn: false });
      } finally {
        clearTimeout(timer);
      }
    });
  });
}

/** Must be called from a real click — browsers reject a permission
 *  request that isn't tied to a user gesture. */
export async function askPushPermission() {
  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        await OneSignal.Notifications.requestPermission();
        // Permission granted is not the same as subscribed: a shop
        // that previously opted out stays opted out until we opt it
        // back in explicitly.
        if (OneSignal.User?.PushSubscription?.optIn) {
          try {
            await OneSignal.User.PushSubscription.optIn();
          } catch { /* already opted in */ }
        }
        resolve({
          permission: OneSignal.Notifications.permission === true,
          optedIn: OneSignal.User?.PushSubscription?.optedIn === true,
        });
      } catch (err) {
        console.warn('Push permission request failed:', err);
        resolve({ permission: false, optedIn: false, error: err?.message });
      }
    });
  });
}
