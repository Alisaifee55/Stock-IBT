import { useCallback, useEffect, useState } from 'react';
import './App.css';
import logo from './assets/sara-logo.png';
import { useAuth } from './lib/AuthProvider';
import { EMPTY_FILTERS, useShops } from './lib/stockQueries';
import Login from './components/Login';
import FilterPanelLive from './components/FilterPanelLive';
import ReportLive from './components/ReportLive';
import AdminUpload from './components/AdminUpload';
import ManageShops from './components/ManageShops';
import ChangePassword from './components/ChangePassword';
import CountryStatusCards from './components/CountryStatusCards';
import ModelSearchLive, { MODEL_SEARCH_INPUT_ID } from './components/ModelSearchLive';

export default function App() {
  const { session, account, accountError, signOut } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshToken, setRefreshToken] = useState(0);
  const { shopsList, refresh: refreshShops } = useShops();
  const [modelJump, setModelJump] = useState(null);

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
        if (document.activeElement?.id === MODEL_SEARCH_INPUT_ID) return;
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

  return (
    <div className="wrap">
      <header className="app-header">
        <div className="logo-badge">
          <img src={logo} alt="Sara" />
        </div>
        <div>
          <h1>
            Sara Stock &amp; IBT <span className="version-badge">v1.0</span>
          </h1>
          <div className="sub">
            {account.isAdmin ? 'Admin' : `Shop: ${account.shop?.name} (${account.shop?.code})`}
          </div>
        </div>
        <div className="header-actions">
          <ChangePassword />
          <button className="btn btn-reset signout-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <CountryStatusCards refreshToken={refreshToken} />

      {account.isAdmin && (
        <>
          <AdminUpload
            onUploaded={() => {
              setRefreshToken((t) => t + 1);
              refreshShops();
            }}
          />
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
      >
        <img src={logo} alt="" />
      </button>

      <footer className="app-footer">
        <div>Live data from Supabase — every shop sees the same current stock.</div>
        <div className="footer-meta">
          <span>v1.0</span>
          <span className="dot">&middot;</span>
          <span>&copy; 2026 AliAsgar...</span>
        </div>
      </footer>
    </div>
  );
}
