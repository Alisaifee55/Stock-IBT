// =============================================================
// App.jsx — v2.7 — 15-09-2026
// Changes from v2.6.1:
//  - imports cart.css, which makes the transfer cart a compact card
//    when collapsed (see TransferCartPanel.jsx v2.7).
//  - no other change in this file. The Excel upload fix lives in
//    useAutoCollapse.js / CountryUploadZone.jsx / CountryStatusCards.jsx,
//    and multi-shop messaging in ShopMultiPicker.jsx / MessagesView.jsx /
//    chatQueries.js — none of which changed this file's props or imports.
// Changes from v2.6: version badge only. The v2.6.1 fix itself is in
// onesignal.js (init was passed malformed options, so the SDK never
// registered a subscription) and MessagesView.jsx (the notification
// banner used to hide itself when push was unavailable, removing the
// only button that could fix it). Nothing in this file changed
// behaviourally — the imports it uses are unchanged.
// Changes from v2.5:
//  - New "Messages" tab (MessagesView) with an unread badge: shop-to-
//    shop conversations, shop-level read receipts, and online / last
//    seen for every shop.
//  - Presence heartbeat mounted app-wide (useHeartbeat): while this
//    tab is visible the shop reads as online; 90s after it stops, it
//    decays to "last seen".
//  - OneSignal wired in: init once, then login(memberKey) so pushes
//    target the SHOP (shops.id, or 'HO' for Head Office) and reach
//    every device it's signed in on. Sign-out releases that identity
//    so the next shop on a shared device doesn't inherit it.
//  - Push notification clicks land on ?view=messages&thread=<id>,
//    read once on load and opened directly.
//  - chat.css imported as its own stylesheet — App.css is untouched
//    by this version, so none of the existing report/IBT styling is
//    at risk from the messaging work.
// Changes from v2.4:
//  - Mounts CartProvider (cartContext.jsx) around the whole app and
//    renders the app-level TransferCartPanel once, right under the
//    header — the IBT cart is no longer scoped to one model console,
//    it persists across every model and shop you visit.
//  - ReportLive now also gets isAdmin, so Head Office accounts can
//    build transfers between two shops that aren't their own.
// Changes from v2.2:
//  - Search moved below Filters (was above): top row -> filters ->
//    search -> table.
//  - The 4 top cards (3 countries + Storage) now auto-collapse to a
//    one-line summary 5s after being open, and expand again on click
//    — see useAutoCollapse.js.
// Changes from v2.0:
//  - Top row is now clean and single-purpose: country cards (each
//    with its own inline upload zone for admins) plus a compact
//    Storage-usage card at the end of the same row. The old
//    standalone "Central stock upload" panel and full-width Storage
//    panel are gone from here — AdminUpload.jsx is no longer used
//    anywhere and should be deleted from the repo.
//  - New "Shops" tab (admin only) holds shop creation + the shop
//    list (ManageShops), out of the Report view entirely, so Report
//    is just: top row -> search -> filters -> table.
// Carried over from v2.0:
//  - Header "Report updated DD-MM-YYYY HH:MM" pill, admin-only refresh.
//  - Report / Transfers / Shops view switch with a Transfers badge.
//  - Notification bell (realtime + 60s poll fallback).
//  - Escape doesn't wipe filters while typing in a form field.
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import './App.css';
import './chat.css';
import './cart.css';
import logo from './assets/sara-logo.png';
import { useAuth } from './lib/AuthProvider';
import { EMPTY_FILTERS, useShops } from './lib/stockQueries';
import { useSummaryRefresh, formatStamp } from './lib/summaryRefresh';
import { CartProvider } from './lib/cartContext';
import Login from './components/Login';
import FilterPanelLive from './components/FilterPanelLive';
import ReportLive from './components/ReportLive';
import ManageShops from './components/ManageShops';
import ChangePassword from './components/ChangePassword';
import CountryStatusCards from './components/CountryStatusCards';
import StorageSummaryCard from './components/StorageSummaryCard';
import ModelSearchLive, { MODEL_SEARCH_INPUT_ID } from './components/ModelSearchLive';
import IbtTransfers from './components/IbtTransfers';
import NotificationBell from './components/NotificationBell';
import TransferCartPanel from './components/TransferCartPanel';
import MessagesView from './components/MessagesView';
import { useIbtCounts } from './lib/ibtQueries';
import { memberKeyFor, useChatUnread } from './lib/chatQueries';
import { useHeartbeat } from './lib/presence';
import { identifyShop, initOneSignal, releaseShop } from './lib/onesignal';
import { ResetIcon } from './components/icons';

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** A push notification click arrives as ?view=messages&thread=<id>.
 *  Read once, at module scope, before React renders. */
function readDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      view: params.get('view') || null,
      thread: params.get('thread') || null,
    };
  } catch {
    return { view: null, thread: null };
  }
}

const DEEP_LINK = readDeepLink();

export default function App() {
  const { session, account, accountError, signOut } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshToken, setRefreshToken] = useState(0);
  const { shopsList, refresh: refreshShops } = useShops();
  const [modelJump, setModelJump] = useState(null);
  const [view, setView] = useState(DEEP_LINK.view === 'messages' ? 'messages' : 'report'); // report | transfers | shops | messages
  const [ibtToken, setIbtToken] = useState(0);
  const [jumpTransferId, setJumpTransferId] = useState(null);
  const [deepThreadId, setDeepThreadId] = useState(DEEP_LINK.thread);

  const bumpData = useCallback(() => setRefreshToken((t) => t + 1), []);
  const {
    lastRefreshAt,
    state: refreshState,
    elapsed: refreshElapsed,
    error: refreshError,
    start: startRefresh,
    reload: reloadRefreshStamp,
    dismissError: dismissRefreshError,
  } = useSummaryRefresh({ onComplete: bumpData });

  const { counts: ibtCounts, reload: reloadIbtCounts } = useIbtCounts(ibtToken);
  const bumpIbt = useCallback(() => {
    setIbtToken((t) => t + 1);
    reloadIbtCounts();
  }, [reloadIbtCounts]);

  // Messaging: identity, heartbeat, unread badge.
  const memberKey = memberKeyFor(account);
  const signedIn = !!account && !!memberKey;
  useHeartbeat(signedIn);
  const { unread: chatUnread, reload: reloadChatUnread } = useChatUnread(0, signedIn);

  useEffect(() => {
    if (!signedIn) return;
    initOneSignal();
    identifyShop(memberKey);
  }, [signedIn, memberKey]);

  const handleSignOut = useCallback(() => {
    // Release the push identity first: on a shared shop device the
    // next person signing in must not keep receiving this shop's
    // notifications.
    releaseShop();
    signOut();
  }, [signOut]);

  const focusModelSearch = useCallback(() => {
    const el = document.getElementById(MODEL_SEARCH_INPUT_ID);
    if (el) {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        focusModelSearch();
        return;
      }
      if (e.key === 'Escape') {
        const el = document.activeElement;
        // Escape inside any form field belongs to that field, not to the
        // global "clear all filters" shortcut.
        if (el && (FORM_TAGS.has(el.tagName) || el.isContentEditable)) return;
        setModelJump(null);
        // Reuses the "Clear all filters" button's own click handler so the
        // per-filter search-box text resets too, in one consistent path.
        document.querySelector('.clear-filters-btn')?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focusModelSearch]);

  if (session === undefined) {
    return <div className="loading-screen">Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }
  if (accountError) {
    return <div className="loading-screen error-box">{accountError}</div>;
  }
  if (!account) {
    return <div className="loading-screen">Loading your account…</div>;
  }

  const handleModelSelect = (modelNo) => {
    setFilters(EMPTY_FILTERS);
    setModelJump(modelNo);
  };

  const refreshing = refreshState === 'working';

  // Admins only get a "Shops" tab; shop accounts never need it.
  const showShopsTab = account.isAdmin;

  return (
    <CartProvider myShopId={account.shopId || null} isAdmin={account.isAdmin} onCreated={bumpIbt}>
    <div className="wrap">
      <header className="app-header">
        <div className="logo-badge">
          <img src={logo} alt="Sara" />
        </div>
        <div>
          <h1>
            Sara IBT <span className="version-badge">v2.7</span>
          </h1>
          <div className="sub">
            {account.isAdmin ? 'Admin' : `Shop: ${account.shop?.name} (${account.shop?.code})`}
          </div>
        </div>
        <nav className="view-tabs" aria-label="Main sections">
          <button
            type="button"
            className={`view-tab${view === 'report' ? ' is-active' : ''}`}
            onClick={() => setView('report')}
          >
            Report
          </button>
          <button
            type="button"
            className={`view-tab${view === 'transfers' ? ' is-active' : ''}`}
            onClick={() => setView('transfers')}
          >
            Transfers
            {ibtCounts.incoming_pending > 0 && (
              <span className="view-tab-badge">{ibtCounts.incoming_pending}</span>
            )}
          </button>
          <button
            type="button"
            className={`view-tab${view === 'messages' ? ' is-active' : ''}`}
            onClick={() => setView('messages')}
          >
            Messages
            {chatUnread > 0 && <span className="view-tab-badge">{chatUnread}</span>}
          </button>
          {showShopsTab && (
            <button
              type="button"
              className={`view-tab${view === 'shops' ? ' is-active' : ''}`}
              onClick={() => setView('shops')}
            >
              Shops
            </button>
          )}
        </nav>
        <div className="header-actions">
          <NotificationBell
            userId={session?.user?.id}
            onOpenTransfer={(id) => {
              setView('transfers');
              setJumpTransferId(id);
            }}
          />
          <div className={`refresh-pill${refreshing ? ' is-working' : ''}`}>
            {refreshing ? (
              <>
                <span className="refresh-spinner" aria-hidden="true" />
                <span className="refresh-pill-text">
                  Refreshing report… {Math.round(refreshElapsed / 1000)}s
                </span>
              </>
            ) : (
              <span className="refresh-pill-text">
                {lastRefreshAt ? `Report updated ${formatStamp(lastRefreshAt)}` : 'Report not refreshed yet'}
              </span>
            )}
            {account.isAdmin && (
              <button
                type="button"
                className="refresh-pill-btn"
                onClick={startRefresh}
                disabled={refreshing}
                title={refreshing ? 'Refresh in progress' : 'Refresh the report now'}
                aria-label={refreshing ? 'Refresh in progress' : 'Refresh the report now'}
              >
                <ResetIcon />
              </button>
            )}
          </div>
          <ChangePassword />
          <button className="btn btn-reset signout-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {refreshError && (
        <div className="refresh-banner" role="alert">
          <span>Report refresh failed: {refreshError}</span>
          <div className="refresh-banner-actions">
            {account.isAdmin && (
              <button type="button" className="btn btn-reset" onClick={startRefresh}>
                Try again
              </button>
            )}
            <button
              type="button"
              className="refresh-banner-close"
              onClick={dismissRefreshError}
              aria-label="Dismiss this message"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <TransferCartPanel />

      {view === 'transfers' ? (
        <IbtTransfers
          incomingPending={ibtCounts.incoming_pending}
          onChanged={bumpIbt}
          openTransferId={jumpTransferId}
          onOpenHandled={() => setJumpTransferId(null)}
        />
      ) : view === 'messages' ? (
        <MessagesView
          account={account}
          myKey={memberKey}
          shopsList={shopsList}
          deepThreadId={deepThreadId}
          onDeepHandled={() => setDeepThreadId(null)}
          onChanged={reloadChatUnread}
        />
      ) : view === 'shops' ? (
        <ManageShops shopsList={shopsList} onChanged={refreshShops} />
      ) : (
        <>
          <CountryStatusCards
            refreshToken={refreshToken}
            isAdmin={account.isAdmin}
            onUploaded={() => {
              bumpData();
              refreshShops();
              reloadRefreshStamp();
            }}
            trailingCard={
              account.isAdmin && (
                <StorageSummaryCard refreshToken={refreshToken} onChanged={bumpData} />
              )
            }
          />

          <FilterPanelLive
            filters={filters}
            setFilters={(updater) => {
              setModelJump(null);
              setFilters(updater);
            }}
            onClear={() => {
              setFilters(EMPTY_FILTERS);
              setModelJump(null);
            }}
          />

          <ModelSearchLive onSelect={handleModelSelect} />

          {modelJump && (
            <div className="model-jump-banner">
              Showing results for Model No <strong>{modelJump}</strong> &mdash; other filters are paused
              <button type="button" onClick={() => setModelJump(null)}>
                &times; Clear
              </button>
            </div>
          )}

          <ReportLive
            key={refreshToken}
            filters={filters}
            modelJump={modelJump}
            canRequest={!account.isAdmin && !!account.shopId}
            isAdmin={account.isAdmin}
            myShopId={account.shopId || null}
            myCountry={account.shop?.country || null}
          />
        </>
      )}

      <button
        type="button"
        className="floating-search-btn"
        onClick={focusModelSearch}
        title="Search Model Number (F2)"
        aria-label="Search Model Number (F2)"
      >
        <img src={logo} alt="" />
      </button>

      <footer className="app-footer">
        <div>Live data from Supabase — every shop sees the same current stock.</div>
        <div className="footer-meta">
          <span>v2.7</span>
          <span className="dot">&middot;</span>
          <span>&copy; 2026 AliAsgar...</span>
        </div>
      </footer>
    </div>
    </CartProvider>
  );
}
