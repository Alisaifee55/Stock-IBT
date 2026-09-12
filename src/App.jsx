// =============================================================
// App.jsx — v2.0 — 12-09-2026
// Changes from v1.0:
//  - Header "Report updated DD-MM-YYYY HH:MM" pill, visible to everyone,
//    with a refresh button for admins only. Queues the async refresh job
//    and polls it; no modal, so the page stays usable while it runs.
//  - Persistent non-blocking banner when a refresh fails.
//  - Report and country cards reload automatically once a refresh lands.
//  - Escape no longer wipes filters while you're typing in a form field
//    (previously Escape in the Manage Shops password box cleared filters).
//  - Admin-only Storage usage panel: per-country size plus an on-demand
//    "Delete old data" button, replacing the upload checkbox.
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
import AdminUpload from './components/AdminUpload';
import ManageShops from './components/ManageShops';
import ChangePassword from './components/ChangePassword';
import CountryStatusCards from './components/CountryStatusCards';
import StorageOverview from './components/StorageOverview';
import ModelSearchLive, { MODEL_SEARCH_INPUT_ID } from './components/ModelSearchLive';
import { ResetIcon } from './components/icons';

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

export default function App() {
  const { session, account, accountError, signOut } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshToken, setRefreshToken] = useState(0);
  const { shopsList, refresh: refreshShops } = useShops();
  const [modelJump, setModelJump] = useState(null);

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

  return (
    <div className="wrap">
      <header className="app-header">
        <div className="logo-badge">
          <img src={logo} alt="Sara" />
        </div>
        <div>
          <h1>
            Sara Stock &amp; IBT <span className="version-badge">v2.0</span>
          </h1>
          <div className="sub">
            {account.isAdmin ? 'Admin' : `Shop: ${account.shop?.name} (${account.shop?.code})`}
          </div>
        </div>
        <div className="header-actions">
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

      <CountryStatusCards refreshToken={refreshToken} />

      {account.isAdmin && (
        <>
          <AdminUpload
            onUploaded={() => {
              bumpData();
              refreshShops();
              reloadRefreshStamp();
            }}
          />
          <StorageOverview refreshToken={refreshToken} onChanged={bumpData} />
          <ManageShops shopsList={shopsList} onChanged={refreshShops} />
        </>
      )}

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

      <ReportLive key={refreshToken} filters={filters} modelJump={modelJump} />

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
          <span>v2.0</span>
          <span className="dot">&middot;</span>
          <span>&copy; 2026 AliAsgar...</span>
        </div>
      </footer>
    </div>
  );
}
