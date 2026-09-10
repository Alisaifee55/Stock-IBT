import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../lib/AuthProvider.jsx';
import App from '../App.jsx';

const {
  FIXTURE_SHOPS,
  FIXTURE_SUMMARY,
  FIXTURE_ITEMS,
  SHOP_USER,
  ADMIN_USER,
  getCurrentAuthUser,
  setCurrentAuthUser,
} = vi.hoisted(() => {
  const shops = [
    { id: 'shop-to', code: 'TO', name: 'Tehri Okadh' },
    { id: 'shop-ns', code: 'NS', name: 'New Sara Plaza' },
  ];
  const summary = [
    {
      shop_id: 'shop-to', model_no: 'ABY-DGMX', brand: 'ABY', category: 'DG ABAYA',
      sales_price: 149, closing_stock: 10, total_sales: 3, total_purchase: 12,
      last_sales_date: '2026-09-05', days_since_last_sale: 4, days_old: 39, sales_velocity: 0.077,
    },
    {
      shop_id: 'shop-to', model_no: 'ZERO-STOCK-1', brand: 'ABY', category: 'DG ABAYA',
      sales_price: 99, closing_stock: 0, total_sales: 0, total_purchase: 2,
      last_sales_date: null, days_since_last_sale: null, days_old: 20, sales_velocity: 0,
    },
    {
      shop_id: 'shop-ns', model_no: 'SH-1000', brand: 'SH', category: '2026-LAMSA',
      sales_price: 120, closing_stock: 5, total_sales: 1, total_purchase: 5,
      last_sales_date: '2026-08-20', days_since_last_sale: 20, days_old: 60, sales_velocity: 0.017,
    },
  ];
  const items = [
    { model_no: 'ABY-DGMX', shop_id: 'shop-to', color: 'MULTI', size: 'FS', closing_stock: 6, total_sales: 2, total_purchase: 8 },
    { model_no: 'ABY-DGMX', shop_id: 'shop-to', color: 'BLACK', size: 'M', closing_stock: 4, total_sales: 1, total_purchase: 4 },
  ];
  const shopUser = {
    id: 'user-to', email: 'to@saraplaza.internal', password: 'correct-password',
    accountRow: { user_id: 'user-to', shop_id: 'shop-to', is_admin: false, shops: { code: 'TO', name: 'Tehri Okadh' } },
  };
  const adminUser = {
    id: 'user-admin', email: 'admin@saraplaza.internal', password: 'admin-password',
    accountRow: { user_id: 'user-admin', shop_id: null, is_admin: true, shops: null },
  };
  let current = null;
  return {
    FIXTURE_SHOPS: shops,
    FIXTURE_SUMMARY: summary,
    FIXTURE_ITEMS: items,
    SHOP_USER: shopUser,
    ADMIN_USER: adminUser,
    getCurrentAuthUser: () => current,
    setCurrentAuthUser: (u) => {
      current = u;
    },
  };
});

vi.mock('../lib/supabaseClient', async () => {
  const { createSupabaseMock } = await import('../__mocks__/supabaseMock.js');
  const mock = createSupabaseMock({
    shops: FIXTURE_SHOPS,
    stockSummary: FIXTURE_SUMMARY,
    stockItems: FIXTURE_ITEMS,
    getAuthUser: getCurrentAuthUser,
  });
  return { supabase: mock };
});

beforeEach(async () => {
  const { supabase } = await import('../lib/supabaseClient');
  supabase.__reset();
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
});
