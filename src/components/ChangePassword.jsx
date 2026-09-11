import { useState } from 'react';
import { changeMyPassword } from '../lib/adminActions';

export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    const { error: err } = await changeMyPassword(newPassword);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setNewPassword('');
  };

  if (!open) {
    return (
      <button className="btn btn-reset" onClick={() => setOpen(true)}>
        Change password
      </button>
    );
  }

  return (
    <form className="change-password-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New password (8+ chars)"
      />
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn btn-reset" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span className="inline-error">{error}</span>}
      {done && <span className="inline-success">Password updated.</span>}
    </form>
  );
}
