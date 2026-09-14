// =============================================================
// onesignal.js — v1.1 — 14-09-2026
// Changes from v1.0 (this is a BUG FIX, not a feature):
//  - init() is now passed ONLY { appId }. v1.0 also passed
//    promptOptions: { slidedown: { prompts: [] } } plus
//    serviceWorkerPath / serviceWorkerParam / autoResubscribe. An
//    empty prompts array is malformed config; if init() throws on it
//    the SDK never registers a subscription and never runs login(),
//    which produces exactly: permission true, optedIn true, but
//    PushSubscription.id / token / onesignalId / externalId all
//    undefined — and nothing in the OneSignal dashboard. The
//    serviceWorker* values were the SDK's own defaults anyway
//    (OneSignalSDKWorker.js at root scope), so dropping them costs
//    nothing.
//  - init errors are now REMEMBERED and reported, instead of being
//    logged to a console nobody is watching. readPushState() returns
//    them so the UI can show the real reason.
//  - identifyShop() now waits for init to finish before calling
//    login(). v1.0 queued both and relied on ordering.
//
// IDENTITY: the push identity is the SHOP, never a person — logins
// are shared per shop. The external id is the same "member_key" the
// database uses: shops.id as text, or 'HO' for Head Office. One send
// reaches every device that shop is signed in on.
//
// iOS: Safari only delivers web push once the site is added to the
// Home Screen (iOS 16.4+). isPushBlockedByIos() detects "in Safari,
// not installed" so the UI can say so instead of showing a button
// that silently does nothing.
// =============================================================

export const ONESIGNAL_APP_ID = '7da3c941-0a7f-4ca2-bb25-5cf40d77bda4';

const state = {
  ready: false,
  initError: '',
  loginError: '',
};

let initPromise = null;

function withOneSignal(fn) {
  if (typeof window === 'undefined') return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

function errText(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.message || err.name || String(err);
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

/** Resolves once init has either succeeded or failed. Safe to call
 *  repeatedly — the same promise comes back. */
export function initOneSignal() {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    // If the SDK script never loads (blocked, offline, ad-blocker),
    // don't leave callers waiting forever.
    const timer = setTimeout(() => {
      if (!state.ready && !state.initError) {
        state.initError = 'The OneSignal script did not load.';
      }
      resolve(state);
    }, 10000);

    withOneSignal(async (OneSignal) => {
      try {
        // Nothing but appId. See the header comment.
        await OneSignal.init({ appId: ONESIGNAL_APP_ID });
        state.ready = true;
        state.initError = '';
      } catch (err) {
        state.initError = errText(err);
        console.error('OneSignal init failed:', err);
      } finally {
        clearTimeout(timer);
        resolve(state);
      }
    });
  });

  return initPromise;
}

/** Ties this browser to a shop. Waits for init first — calling
 *  login() before init has finished is what silently left externalId
 *  undefined in v1.0. */
export function identifyShop(memberKey) {
  if (!memberKey) return;
  initOneSignal().then((s) => {
    if (!s.ready) return; // init failed; readPushState() reports why
    withOneSignal(async (OneSignal) => {
      try {
        await OneSignal.login(String(memberKey));
        state.loginError = '';
      } catch (err) {
        state.loginError = errText(err);
        console.error('OneSignal login failed:', err);
      }
    });
  });
}

/** Called on sign-out so the next shop on a shared device doesn't
 *  inherit the previous shop's notifications. */
export function releaseShop() {
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.logout();
    } catch (err) {
      console.warn('OneSignal logout failed:', err);
    }
  });
}

/**
 * Everything the UI needs to explain the current push situation.
 * subscriptionId is the one that actually matters: without it there
 * is nothing on OneSignal's side to send to, whatever the browser
 * permission says.
 */
export async function readPushState() {
  const s = await initOneSignal();

  const base = {
    supported: false,
    permission: false,
    optedIn: false,
    subscriptionId: null,
    onesignalId: null,
    externalId: null,
    initError: s.initError,
    loginError: s.loginError,
    iosBlocked: isPushBlockedByIos(),
  };

  if (!s.ready) return base;

  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const timer = setTimeout(() => done(base), 6000);

    withOneSignal(async (OneSignal) => {
      try {
        done({
          ...base,
          supported: OneSignal.Notifications.isPushSupported() === true,
          permission: OneSignal.Notifications.permission === true,
          optedIn: OneSignal.User?.PushSubscription?.optedIn === true,
          subscriptionId: OneSignal.User?.PushSubscription?.id || null,
          onesignalId: OneSignal.User?.onesignalId || null,
          externalId: OneSignal.User?.externalId || null,
        });
      } catch (err) {
        done({ ...base, initError: base.initError || errText(err) });
      } finally {
        clearTimeout(timer);
      }
    });
  });
}

/**
 * Must be called from a real click — browsers reject a permission
 * request that isn't tied to a user gesture.
 * Re-asserts the shop identity afterwards: a subscription created
 * just now needs the external id attached to it, and on a device
 * where the original login() failed this is the second chance.
 */
export async function askPushPermission(memberKey) {
  const s = await initOneSignal();
  if (!s.ready) {
    return { ok: false, error: s.initError || 'Notifications are unavailable.' };
  }

  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        if (OneSignal.Notifications.permission !== true) {
          await OneSignal.Notifications.requestPermission();
        }
        // Permission granted is not the same as subscribed: a shop
        // that previously opted out stays opted out until we opt it
        // back in explicitly.
        if (OneSignal.User?.PushSubscription?.optIn) {
          try {
            await OneSignal.User.PushSubscription.optIn();
          } catch { /* already opted in */ }
        }
        if (memberKey) {
          try {
            await OneSignal.login(String(memberKey));
          } catch (err) {
            state.loginError = errText(err);
          }
        }
        resolve({ ok: true });
      } catch (err) {
        resolve({ ok: false, error: errText(err) });
      }
    });
  });
}
