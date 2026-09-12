// A minimal in-memory fake of the subset of supabase-js's query builder our
// app actually uses, so we can test real component/query wiring without
// needing network access to the live Supabase project.

export function createSupabaseMock({ shops, stockSummary, stockItems, stockUploads = [], getAuthUser, rpcHandlers = {} }) {
  const state = { session: null };
  const authListeners = [];

  function buildQuery(table) {
    const q = {
      table,
      filters: [],
      selectCols: '*',
      _order: null,
      _range: null,
      _single: false,
      _maybeSingle: false,
      _count: null,
    };

    const api = {
      select(cols, opts) {
        q.selectCols = cols;
        if (opts?.count) q._count = opts.count;
        return api;
      },
      eq(col, val) {
        q.filters.push({ type: 'eq', col, val });
        return api;
      },
      gt(col, val) {
        q.filters.push({ type: 'gt', col, val });
        return api;
      },
      gte(col, val) {
        q.filters.push({ type: 'gte', col, val });
        return api;
      },
      lte(col, val) {
        q.filters.push({ type: 'lte', col, val });
        return api;
      },
      in(col, vals) {
        q.filters.push({ type: 'in', col, vals });
        return api;
      },
      ilike(col, pattern) {
        q.filters.push({ type: 'ilike', col, pattern });
        return api;
      },
      or(expr) {
        q.filters.push({ type: 'or', expr });
        return api;
      },
      order(col, opts) {
        q._order = { col, ascending: opts?.ascending !== false };
        return api;
      },
      limit(n) {
        q._limit = n;
        return api;
      },
      range(from, to) {
        q._range = [from, to];
        return api;
      },
      single() {
        q._single = true;
        return api;
      },
      maybeSingle() {
        q._maybeSingle = true;
        return api;
      },
      insert(rows) {
        q._insertRows = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      update(patch) {
        q._updatePatch = patch;
        return api;
      },
      then(resolve, reject) {
        try {
          resolve(execute());
        } catch (e) {
          reject ? reject(e) : Promise.reject(e);
        }
      },
    };

    function rowMatches(row) {
      return q.filters.every((f) => {
        if (f.type === 'eq') return row[f.col] === f.val;
        if (f.type === 'gt') return (row[f.col] ?? 0) > f.val;
        if (f.type === 'gte') return (row[f.col] ?? 0) >= Number(f.val);
        if (f.type === 'lte') return (row[f.col] ?? 0) <= Number(f.val);
        if (f.type === 'in') return f.vals.includes(row[f.col]);
        if (f.type === 'ilike') {
          const needle = f.pattern.replace(/%/g, '').toLowerCase();
          return String(row[f.col] || '').toLowerCase().includes(needle);
        }
        if (f.type === 'or') return true; // simplified: not evaluated in mock
        return true;
      });
    }

    function applyOrderRangeLimit(data) {
      let out = data;
      if (q._order) {
        out = [...out].sort((a, b) => {
          const av = a[q._order.col] ?? -Infinity;
          const bv = b[q._order.col] ?? -Infinity;
          return q._order.ascending ? av - bv : bv - av;
        });
      }
      if (q._range) out = out.slice(q._range[0], q._range[1] + 1);
      if (q._limit) out = out.slice(0, q._limit);
      return out;
    }

    function execute() {
      if (table === 'shops' || table === 'shop_accounts') {
        let data = table === 'shops' ? shops : [];
        if (table === 'shop_accounts') {
          // used by AuthProvider to look up the logged-in user's account
          const authUser = getAuthUser();
          data = authUser?.accountRow ? [authUser.accountRow] : [];
        }
        data = data.filter(rowMatches);
        if (q._single) return { data: data[0] || null, error: data[0] ? null : { message: 'not found' } };
        if (q._maybeSingle) return { data: data[0] || null, error: null };
        return { data, error: null };
      }
      if (table === 'stock_summary') {
        let data = applyOrderRangeLimit(stockSummary.filter(rowMatches));
        const count = stockSummary.filter(rowMatches).length;
        if (q._single) return { data: data[0] || null, error: data[0] ? null : { message: 'not found' } };
        if (q._maybeSingle) return { data: data[0] || null, error: null };
        return { data, count, error: null };
      }
      if (table === 'current_stock_items') {
        const data = stockItems.filter(rowMatches);
        return { data, error: null };
      }
      if (table === 'stock_uploads') {
        if (q._insertRows) return { data: { id: 'mock-upload-id' }, error: null };
        const data = applyOrderRangeLimit(stockUploads.filter(rowMatches));
        if (q._single) return { data: data[0] || null, error: data[0] ? null : { message: 'not found' } };
        if (q._maybeSingle) return { data: data[0] || null, error: null };
        return { data, error: null };
      }
      if (table === 'stock_items') {
        return { data: q._insertRows ? { id: 'mock-item-id' } : null, error: null };
      }
      return { data: [], error: null };
    }

    return api;
  }

  return {
    from: (table) => buildQuery(table),
    rpc: async (fnName, args) => {
      const handler = rpcHandlers[fnName];
      if (!handler) return { data: null, error: { message: `No mock handler for rpc ${fnName}` } };
      try {
        const data = await handler(args);
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb) => {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async ({ email, password }) => {
        const authUser = getAuthUser();
        if (authUser && email === authUser.email && password === authUser.password) {
          state.session = { user: authUser };
          authListeners.forEach((cb) => cb('SIGNED_IN', state.session));
          return { error: null };
        }
        return { error: { message: 'Invalid credentials' } };
      },
      signOut: async () => {
        state.session = null;
        authListeners.forEach((cb) => cb('SIGNED_OUT', null));
      },
      getUser: async () => ({ data: { user: state.session?.user || null } }),
    },
    __reset() {
      state.session = null;
      authListeners.length = 0;
    },
  };
}
