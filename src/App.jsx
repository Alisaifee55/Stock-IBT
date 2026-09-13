// =============================================================
// App.jsx — v2.1 — 12-09-2026
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
import logo from './assets/sara-logo.png';
import { useAuth } from './lib/AuthProvider';
import { EMPTY_FILTERS, useShops } from './lib/stockQueries';
import { useSummaryRefresh, formatStamp } from './lib/summaryRefresh';
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
import { useIbtCounts } from './lib/ibtQueries';
import { ResetIcon } from './components/icons';

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

export default function App() {
  const { session, account, accountError, signOut } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshToken, setRefreshToken] = useState(0);
  const { shopsList, refresh: refreshShops } = useShops();
  const [modelJump, setModelJump] = useState(null);
  const [view, setView] = useState('report'); // report | transfers | shops
  const [ibtToken, setIbtToken] = useState(0);
  const [jumpTransferId, setJumpTransferId] = useState(null);

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
    <div className="wrap">
      <header className="app-header">
        <div className="logo-badge">
          <img src={logo} alt="Sara" />
        </div>
        <div>
          <h1>
            Sara Stock &amp; IBT <span className="version-badge">v2.1</span>
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
          <button className="btn btn-reset signout-btn" onClick={signOut}>
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

      {view === 'transfers' ? (
        <IbtTransfers
          incomingPending={ibtCounts.incoming_pending}
          onChanged={bumpIbt}
          openTransferId={jumpTransferId}
          onOpenHandled={() => setJumpTransferId(null)}
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

          <ModelSearchLive onSelect={handleModelSelect} />

          {modelJump && (
            <div className="model-jump-banner">
              Showing results for Model No <strong>{modelJump}</strong> &mdash; other filters are paused
              <button type="button" onClick={() => setModelJump(null)}>
                &times; Clear
              </button>
            </div>
          )}

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

          <ReportLive
            key={refreshToken}
            filters={filters}
            modelJump={modelJump}
            canRequest={!account.isAdmin && !!account.shopId}
            onTransferCreated={bumpIbt}
            myShopId={account.shopId || null}
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
          <span>v2.1</span>
          <span className="dot">&middot;</span>
          <span>&copy; 2026 AliAsgar...</span>
        </div>
      </footer>
    </div>
  );
}
