import { useState } from 'react';
import { COUNTRIES } from '../lib/stockQueries';
import { adminCreateShop, adminSetShopPassword } from '../lib/adminActions';

export default function ManageShops({ shopsList, onChanged }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('UAE');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdInfo, setCreatedInfo] = useState('');

  const [resetShop, setResetShop] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreatedInfo('');
    if (password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    const { error } = await adminCreateShop(code.trim().toUpperCase(), name.trim(), country, password);
    setCreating(false);
    if (error) {
      setCreateError(error.message);
      return;
    }
    setCreatedInfo(`Shop "${code.trim().toUpperCase()}" created — login code: ${code.trim().toUpperCase()}`);
    setCode('');
    setName('');
    setPassword('');
    onChanged?.();
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetDone('');
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    setResetting(true);
    const { error } = await adminSetShopPassword(resetShop, resetPassword);
    setResetting(false);
    if (error) {
      setResetError(error.message);
      return;
    }
    setResetDone(`Password updated for ${resetShop}.`);
    setResetPassword('');
  };

  return (
    <div className="panel manage-shops-panel">
      <h3>Manage shops (admin only)</h3>
      <div className="manage-shops-grid">
        <form onSubmit={handleCreate} className="manage-shops-form">
          <div className="form-title">Create a new shop</div>
          <label>
            Shop code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. KW1" required />
          </label>
          <label>
            Shop name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kuwait Main Branch" required />
          </label>
          <label>
            Country
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Initial password
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </label>
          {createError && <div className="error-box small">{createError}</div>}
          {createdInfo && <div className="success-box">{createdInfo}</div>}
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create shop'}
          </button>
        </form>

        <form onSubmit={handleReset} className="manage-shops-form">
          <div className="form-title">Reset a shop's password</div>
          <label>
            Shop code
            <select value={resetShop} onChange={(e) => setResetShop(e.target.value)} required>
              <option value="" disabled>
                Select a shop…
              </option>
              {shopsList.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.code} — {s.name} ({s.country})
                </option>
              ))}
            </select>
          </label>
          <label>
            New password
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </label>
          {resetError && <div className="error-box small">{resetError}</div>}
          {resetDone && <div className="success-box">{resetDone}</div>}
          <button className="btn btn-primary" type="submit" disabled={resetting}>
            {resetting ? 'Updating…' : 'Reset password'}
          </button>
        </form>
      </div>

      <div className="shops-list">
        <div className="form-title">Existing shops</div>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody>
            {shopsList.map((s) => (
              <tr key={s.id}>
                <td>{s.code}</td>
                <td>{s.name}</td>
                <td>{s.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
