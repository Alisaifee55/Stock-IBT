import { useState } from 'react';
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

export default function App() {
  const { session, account, accountError, signOut } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshToken, setRefreshToken] = useState(0);
  const { shopsList, refresh: refreshShops } = useShops();

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

      <FilterPanelLive filters={filters} setFilters={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />

      <ReportLive key={refreshToken} filters={filters} />

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
