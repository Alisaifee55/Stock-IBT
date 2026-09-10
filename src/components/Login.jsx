import { useState } from 'react';
import logo from '../assets/sara-logo.png';
import { useAuth } from '../lib/AuthProvider';

export default function Login() {
  const { signIn } = useAuth();
  const [shopCode, setShopCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await signIn(shopCode, password);
    setLoading(false);
    if (err) {
      setError('Shop code or password is incorrect.');
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Sara" className="login-logo" />
        <h1>Sara Stock &amp; IBT</h1>
        <p className="login-sub">Sign in with your shop code</p>

        <label>
          Shop code
          <input
            type="text"
            value={shopCode}
            onChange={(e) => setShopCode(e.target.value)}
            placeholder="e.g. TO"
            autoCapitalize="characters"
            autoFocus
          />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={loading || !shopCode || !password}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
