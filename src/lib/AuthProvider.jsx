import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

// Shop staff log in with just their shop code (e.g. "TO"), not an email — this
// maps that to the real internal email the account was created with.
export function codeToEmail(code) {
  const c = code.trim().toLowerCase();
  return `${c}@saraplaza.internal`;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [account, setAccount] = useState(null); // { shop_id, is_admin, shop: {code, name} }
  const [accountError, setAccountError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    setAccountError('');
    supabase
      .from('shop_accounts')
      .select('shop_id, is_admin, shops(code, name)')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAccountError('Could not load your account details. Please contact the admin.');
          return;
        }
        setAccount({ shopId: data.shop_id, isAdmin: data.is_admin, shop: data.shops });
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = async (shopCode, password) => {
    const email = shopCode.trim().toLowerCase() === 'admin' ? 'admin@saraplaza.internal' : codeToEmail(shopCode);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ session, account, accountError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
