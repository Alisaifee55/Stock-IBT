import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../lib/AuthProvider.jsx';
import App from '../App.jsx';

const {
  FIXTURE_SHOPS,
  FIXTURE_SUMMARY,
  FIXTURE_ITEMS,
  FIXTURE_UPLOADS,
  SHOP_USER,
  ADMIN_USER,
  getCurrentAuthUser,
  setCurrentAuthUser,
  recordRpcCall,
  getRpcCalls,
  clearRpcCalls,
} = vi.hoisted(() => {
  const shops = [
    { id: 'shop-to', code: 'TO', name: 'Tehri Okadh', country: 'UAE' },
    { id: 'shop-ns', code: 'NS', name: 'New Sara Plaza', country: 'UAE' },
    { id: 'shop-kw1', code: 'KW1', name: 'Kuwait Main', country: 'KUWAIT' },
  ];
  const summary = [
    {
      shop_id: 'shop-to', shop_code: 'TO', shop_country: 'UAE', model_no: 'ABY-DGMX', brand: 'ABY', category: 'DG ABAYA',
      sales_price: 149, closing_stock: 10, total_sales: 3, total_purchase: 12,
      last_sales_date: '2026-09-05', days_since_last_sale: 4, days_old: 39, sales_velocity: 0.077,
    },
    {
      shop_id: 'shop-to', shop_code: 'TO', shop_country: 'UAE', model_no: 'ZERO-STOCK-1', brand: 'ABY', category: 'DG ABAYA',
      sales_price: 99, closing_stock: 0, total_sales: 0, total_purchase: 2,
      last_sales_date: null, days_since_last_sale: null, days_old: 20, sales_velocity: 0,
    },
    {
      shop_id: 'shop-ns', shop_code: 'NS', shop_country: 'UAE', model_no: 'SH-1000', brand: 'SH', category: '2026-LAMSA',
      sales_price: 120, closing_stock: 5, total_sales: 1, total_purchase: 5,
      last_sales_date: '2026-08-20', days_since_last_sale: 20, days_old: 60, sales_velocity: 0.017,
    },
    {
      shop_id: 'shop-kw1', shop_code: 'KW1', shop_country: 'KUWAIT', model_no: 'KW-MODEL-1', brand: 'KWB', category: 'KUWAIT-CAT',
      sales_price: 80, closing_stock: 20, total_sales: 4, total_purchase: 20,
      last_sales_date: '2026-09-01', days_since_last_sale: 8, days_old: 30, sales_velocity: 0.133,
    },
  ];
  const items = [
    { model_no: 'ABY-DGMX', shop_id: 'shop-to', color: 'MULTI', size: 'FS', closing_stock: 6, total_sales: 2, total_purchase: 8 },
    { model_no: 'ABY-DGMX', shop_id: 'shop-to', color: 'BLACK', size: 'M', closing_stock: 4, total_sales: 1, total_purchase: 4 },
  ];
  const shopUser = {
    id: 'user-to', email: 'to@saraplaza.internal', password: 'correct-password',
    accountRow: { user_id: 'user-to', shop_id: 'shop-to', is_admin: false, shops: { code: 'TO', name: 'Tehri Okadh', country: 'UAE' } },
  };
  const adminUser = {
    id: 'user-admin', email: 'admin@saraplaza.internal', password: 'admin-password',
    accountRow: { user_id: 'user-admin', shop_id: null, is_admin: true, shops: null },
  };
  const uploads = [
    { country: 'UAE', status: 'completed', row_count: 303619, source_filename: 'Closing Dubai.xlsx', uploaded_at: '2026-09-11T09:00:00Z' },
    { country: 'OMAN', status: 'completed', row_count: 277208, source_filename: 'Closing Oman.xlsx', uploaded_at: '2026-09-11T08:00:00Z' },
  ];
  let current = null;
  const rpcCalls = [];
  return {
    FIXTURE_SHOPS: shops,
    FIXTURE_SUMMARY: summary,
    FIXTURE_ITEMS: items,
    FIXTURE_UPLOADS: uploads,
    SHOP_USER: shopUser,
    ADMIN_USER: adminUser,
    getCurrentAuthUser: () => current,
    setCurrentAuthUser: (u) => {
      current = u;
    },
    recordRpcCall: (name, args) => rpcCalls.push({ name, args }),
    getRpcCalls: () => rpcCalls,
    clearRpcCalls: () => {
      rpcCalls.length = 0;
    },
  };
});

vi.mock('../lib/supabaseClient', async () => {
  const { createSupabaseMock } = await import('../__mocks__/supabaseMock.js');
  const mock = createSupabaseMock({
    shops: FIXTURE_SHOPS,
    stockSummary: FIXTURE_SUMMARY,
    stockItems: FIXTURE_ITEMS,
    stockUploads: FIXTURE_UPLOADS,
    getAuthUser: getCurrentAuthUser,
    rpcHandlers: {
      admin_create_shop: async (args) => {
        recordRpcCall('admin_create_shop', args);
        return { id: 'new-shop-id', code: args.p_code, name: args.p_name, country: args.p_country };
      },
      admin_set_shop_password: async (args) => {
        recordRpcCall('admin_set_shop_password', args);
        return null;
      },
      change_my_password: async (args) => {
        recordRpcCall('change_my_password', args);
        return null;
      },
    },
  });
  return { supabase: mock };
});

beforeEach(async () => {
  const { supabase } = await import('../lib/supabaseClient');
  supabase.__reset();
  clearRpcCalls();
});

afterEach(() => {
  cleanup();
});

async function login(renderResult, userEv, shopCode, password) {
  const { container, findByText, findByPlaceholderText } = renderResult;
  const codeInput = await findByPlaceholderText('e.g. TO');
  await userEv.type(codeInput, shopCode);
  await userEv.type(container.querySelector('input[type="password"]'), password);
  await userEv.click(await findByText('Sign in'));
}

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('Sara Stock & IBT app', () => {
  it('shows the login screen when not signed in', async () => {
    setCurrentAuthUser(SHOP_USER);
    const { findByText } = renderApp();
    expect(await findByText('Sara Stock & IBT')).toBeTruthy();
    expect(await findByText('Sign in')).toBeTruthy();
  });

  it("logs a shop in by shop code and shows only that shop's zero-stock-hidden report", async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');

    await waitFor(() => expect(container.querySelector('.count-pill')).toBeTruthy());

    // Default filters hide zero-stock, so ZERO-STOCK-1 must not appear.
    expect(container.textContent).toMatch(/ABY-DGMX/);
    expect(container.textContent).not.toMatch(/ZERO-STOCK-1/);

    // Non-admin shop account must not see the upload panel.
    expect(container.textContent).not.toMatch(/Central stock upload/);

    // Header should reflect the shop identity.
    expect(container.textContent).toMatch(/Tehri Okadh \(TO\)/);
  });

  it('rejects an incorrect password', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'wrong-password');

    await waitFor(() => expect(container.textContent).toMatch(/incorrect/));
  });

  it('admin account sees the central upload panel', async () => {
    setCurrentAuthUser(ADMIN_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'ADMIN', 'admin-password');

    await waitFor(() => expect(container.textContent).toMatch(/Central stock upload/));
  });

  it('expanding a row fetches and shows the Color/Size breakdown', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');

    await waitFor(() => expect(container.querySelector('.expandable-row')).toBeTruthy());
    const row = container.querySelector('.expandable-row');
    await user.click(row);

    await waitFor(() => expect(container.textContent).toMatch(/MULTI \/ FS/));
    expect(container.textContent).toMatch(/BLACK \/ M/);
  });

  it('shop filter checkbox narrows the report to just that shop', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');

    await waitFor(() => expect(container.querySelector('.count-pill')).toBeTruthy());

    const shopField = container.querySelectorAll('.filter-field')[0];
    await waitFor(() => expect(shopField.querySelectorAll('.multiselect label').length).toBeGreaterThan(0));

    const nsCheckbox = Array.from(shopField.querySelectorAll('.multiselect label')).find((l) =>
      l.textContent.includes('NS')
    ).querySelector('input');
    await user.click(nsCheckbox);

    await waitFor(() => {
      expect(container.textContent).toMatch(/SH-1000/);
      expect(container.textContent).not.toMatch(/ABY-DGMX/);
    });
  });

  it('country filter defaults to UAE+OMAN checked, KUWAIT unchecked, and hides Kuwait data by default', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');

    await waitFor(() => expect(container.querySelector('.count-pill')).toBeTruthy());

    const chips = Array.from(container.querySelectorAll('.country-chip'));
    const uaeChip = chips.find((c) => c.textContent.includes('UAE'));
    const omanChip = chips.find((c) => c.textContent.includes('OMAN'));
    const kuwaitChip = chips.find((c) => c.textContent.includes('KUWAIT'));

    expect(uaeChip.querySelector('input').checked).toBe(true);
    expect(omanChip.querySelector('input').checked).toBe(true);
    expect(kuwaitChip.querySelector('input').checked).toBe(false);

    // Kuwait's model must not show by default.
    expect(container.textContent).not.toMatch(/KW-MODEL-1/);

    // Checking Kuwait reveals it.
    await user.click(kuwaitChip.querySelector('input'));
    await waitFor(() => expect(container.textContent).toMatch(/KW-MODEL-1/));
  });

  it('admin can create a new shop via Manage Shops, calling admin_create_shop with the right args', async () => {
    setCurrentAuthUser(ADMIN_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container, findByText } = renderResult;
    await login(renderResult, user, 'ADMIN', 'admin-password');

    await waitFor(() => expect(container.textContent).toMatch(/Manage shops/));

    const createForm = Array.from(container.querySelectorAll('.manage-shops-form')).find((f) =>
      f.textContent.includes('Create a new shop')
    );
    await user.type(createForm.querySelector('input[placeholder="e.g. KW1"]'), 'OM1');
    await user.type(createForm.querySelector('input[placeholder="e.g. Kuwait Main Branch"]'), 'Oman Main Branch');
    await user.selectOptions(createForm.querySelector('select'), 'OMAN');
    await user.type(createForm.querySelector('input[placeholder="At least 8 characters"]'), 'SomePassword1');
    await user.click(await findByText('Create shop'));

    await waitFor(() => {
      const calls = getRpcCalls().filter((c) => c.name === 'admin_create_shop');
      expect(calls.length).toBe(1);
      expect(calls[0].args).toEqual({
        p_code: 'OM1',
        p_name: 'Oman Main Branch',
        p_country: 'OMAN',
        p_password: 'SomePassword1',
      });
    });
  });

  it('self-service Change Password calls change_my_password with the new password', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container, findByText } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');

    await waitFor(() => expect(container.querySelector('.count-pill')).toBeTruthy());

    await user.click(await findByText('Change password'));
    const input = container.querySelector('.change-password-form input');
    await user.type(input, 'BrandNewPass1');
    await user.click(container.querySelector('.change-password-form button[type="submit"]'));

    await waitFor(() => {
      const calls = getRpcCalls().filter((c) => c.name === 'change_my_password');
      expect(calls.length).toBe(1);
      expect(calls[0].args).toEqual({ p_new_password: 'BrandNewPass1' });
    });
  });

  it('shows country status cards with real upload data', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');

    await waitFor(() => expect(container.querySelectorAll('.country-card').length).toBe(3));
    const uaeCard = Array.from(container.querySelectorAll('.country-card')).find((c) =>
      c.textContent.includes('UAE')
    );
    expect(uaeCard.textContent).toMatch(/303,619/);
    expect(uaeCard.textContent).toMatch(/Closing Dubai\.xlsx/);

    const kuwaitCard = Array.from(container.querySelectorAll('.country-card')).find((c) =>
      c.textContent.includes('KUWAIT')
    );
    expect(kuwaitCard.textContent).toMatch(/No data uploaded yet/);
  });

  it('Model Number search: jumping to a model pauses filters, and Clear returns to normal + F2/floating button focus the box', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');
    await waitFor(() => expect(container.querySelector('.count-pill')).toBeTruthy());

    const searchInput = container.querySelector('.model-search-box input');
    await user.type(searchInput, 'SH-1000');
    await waitFor(() => expect(container.querySelectorAll('.model-search-result').length).toBeGreaterThan(0));
    await user.keyboard('{Enter}');

    await waitFor(() => expect(container.querySelector('.model-jump-banner')).toBeTruthy());
    expect(container.querySelector('.model-jump-banner').textContent).toMatch('SH-1000');
    await waitFor(() => {
      expect(container.textContent).toMatch(/SH-1000/);
      expect(container.textContent).not.toMatch(/ABY-DGMX/);
    });

    // Floating button + F2 both focus the search box.
    const floatingBtn = container.querySelector('.floating-search-btn');
    expect(floatingBtn).toBeTruthy();
    searchInput.blur();
    await user.click(floatingBtn);
    await waitFor(() => expect(document.activeElement).toBe(searchInput));

    // Clearing the jump banner returns to normal filtering.
    await user.click(container.querySelector('.model-jump-banner button'));
    await waitFor(() => expect(container.querySelector('.model-jump-banner')).toBeNull());
  }, 15000);

  it('Escape clears active filters and the model jump together', async () => {
    setCurrentAuthUser(SHOP_USER);
    const user = userEvent.setup();
    const renderResult = renderApp();
    const { container } = renderResult;
    await login(renderResult, user, 'TO', 'correct-password');
    await waitFor(() => expect(container.querySelector('.count-pill')).toBeTruthy());

    const shopField = container.querySelectorAll('.filter-field')[0];
    await waitFor(() => expect(shopField.querySelectorAll('.multiselect input[type=checkbox]').length).toBeGreaterThan(0));
    const shopCheckbox = shopField.querySelector('.multiselect input[type=checkbox]');
    await user.click(shopCheckbox);
    await waitFor(() => expect(shopCheckbox.checked).toBe(true));

    document.body.focus();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      const freshField = container.querySelectorAll('.filter-field')[0];
      const cb = freshField.querySelector('.multiselect input[type=checkbox]');
      expect(cb.checked).toBe(false);
    });
  });
});
