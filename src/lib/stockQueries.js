import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

const PAGE_SIZE = 100;

/** All shops, fetched once — small reference table (~9 rows). */
export function useShops() {
  const [shopsById, setShopsById] = useState(new Map());
  const [shopsList, setShopsList] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('shops')
      .select('id, code, name, country')
      .then(({ data }) => {
        if (cancelled || !data) return;
        setShopsById(new Map(data.map((s) => [s.id, s])));
        setShopsList(data);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);
  return { shopsById, shopsList, refresh };
}

export const COUNTRIES = ['UAE', 'KUWAIT', 'OMAN'];

export const EMPTY_FILTERS = {
  shopIds: new Set(),
  categories: new Set(),
  brands: new Set(),
  countries: new Set(['UAE', 'OMAN']), // Kuwait opt-in, per your confirmation
  showZeroStock: false,
  includeNeverSold: false, // matches the standalone app's established default
  daysSinceLastSaleMin: '',
  daysSinceLastSaleMax: '',
  modelSearch: '',
};

function applyCommonFilters(query, filters, { skipShop, skipCategory, skipBrand, skipCountry } = {}) {
  if (!filters.showZeroStock) query = query.gt('closing_stock', 0);
  if (!skipShop && filters.shopIds.size) query = query.in('shop_id', Array.from(filters.shopIds));
  if (!skipCategory && filters.categories.size) query = query.in('category', Array.from(filters.categories));
  if (!skipBrand && filters.brands.size) query = query.in('brand', Array.from(filters.brands));
  if (!skipCountry && filters.countries.size) query = query.in('shop_country', Array.from(filters.countries));
  if (filters.modelSearch.trim()) query = query.ilike('model_no', `%${filters.modelSearch.trim()}%`);

  const hasDaysFilter = filters.daysSinceLastSaleMin !== '' || filters.daysSinceLastSaleMax !== '';
  if (hasDaysFilter) {
    if (filters.includeNeverSold) {
      // (within range) OR (never sold) — PostgREST "or" syntax.
      const clauses = [];
      if (filters.daysSinceLastSaleMin !== '') clauses.push(`days_since_last_sale.gte.${filters.daysSinceLastSaleMin}`);
      if (filters.daysSinceLastSaleMax !== '') clauses.push(`days_since_last_sale.lte.${filters.daysSinceLastSaleMax}`);
      query = query.or(`and(${clauses.join(',')}),days_since_last_sale.is.null`);
    } else {
      if (filters.daysSinceLastSaleMin !== '') query = query.gte('days_since_last_sale', filters.daysSinceLastSaleMin);
      if (filters.daysSinceLastSaleMax !== '') query = query.lte('days_since_last_sale', filters.daysSinceLastSaleMax);
    }
  }
  return query;
}

/** Paginated (infinite-scroll style) live report rows. */
export function useStockSummary(filters, sort) {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        shopIds: Array.from(filters.shopIds).sort(),
        categories: Array.from(filters.categories).sort(),
        brands: Array.from(filters.brands).sort(),
        countries: Array.from(filters.countries).sort(),
        showZeroStock: filters.showZeroStock,
        includeNeverSold: filters.includeNeverSold,
        daysSinceLastSaleMin: filters.daysSinceLastSaleMin,
        daysSinceLastSaleMax: filters.daysSinceLastSaleMax,
        modelSearch: filters.modelSearch,
        sort,
      }),
    [filters, sort]
  );

  // Reset to page 0 whenever filters/sort change.
  useEffect(() => {
    setPage(0);
    setRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    let query = supabase.from('stock_summary').select('*', { count: 'exact' });
    query = applyCommonFilters(query, filters);
    query = query.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false });
    query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    query.then(({ data, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setRows((prev) => (page === 0 ? data : [...prev, ...data]));
      setTotalCount(count ?? 0);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page]);

  const loadMore = useCallback(() => setPage((p) => p + 1), []);
  const hasMore = rows.length < totalCount;

  return { rows, totalCount, loading, error, loadMore, hasMore };
}

/** Cascading filter option lists — each dimension computed against every OTHER active filter. */
export function useFilterOptions(filters) {
  const [options, setOptions] = useState({ shops: [], categories: [], brands: [] });

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        shopIds: Array.from(filters.shopIds).sort(),
        categories: Array.from(filters.categories).sort(),
        brands: Array.from(filters.brands).sort(),
        countries: Array.from(filters.countries).sort(),
        showZeroStock: filters.showZeroStock,
        includeNeverSold: filters.includeNeverSold,
        daysSinceLastSaleMin: filters.daysSinceLastSaleMin,
        daysSinceLastSaleMax: filters.daysSinceLastSaleMax,
      }),
    [filters]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // stock_summary now carries shop_code directly (via a real SQL join in
      // the view itself), so no separate shops-table lookup is needed here.
      const [shopQ, catQ, brandQ] = await Promise.all([
        applyCommonFilters(supabase.from('stock_summary').select('shop_id, shop_code'), filters, {
          skipShop: true,
        }).limit(5000),
        applyCommonFilters(supabase.from('stock_summary').select('category'), filters, { skipCategory: true }).limit(
          5000
        ),
        applyCommonFilters(supabase.from('stock_summary').select('brand'), filters, { skipBrand: true }).limit(5000),
      ]);
      if (cancelled) return;

      const shopMap = new Map();
      (shopQ.data || []).forEach((r) => {
        if (r.shop_id) shopMap.set(r.shop_id, r.shop_code);
      });
      const shops = Array.from(shopMap.entries())
        .map(([id, code]) => ({ id, code }))
        .sort((a, b) => a.code.localeCompare(b.code));

      const categories = Array.from(new Set((catQ.data || []).map((r) => r.category).filter(Boolean))).sort();
      const brands = Array.from(new Set((brandQ.data || []).map((r) => r.brand).filter(Boolean))).sort();

      setOptions({ shops, categories, brands });
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [filtersKey]);

  return options;
}

/** Color/Size detail breakdown for one Model+Shop, fetched on row expand. */
export function useStockDetail(modelNo, shopId, enabled) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('current_stock_items')
      .select('color, size, closing_stock, total_sales, total_purchase')
      .eq('model_no', modelNo)
      .eq('shop_id', shopId)
      .order('color')
      .order('size')
      .then(({ data, error }) => {
        if (cancelled) return;
        setDetail(error ? [] : data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelNo, shopId, enabled]);

  return { detail, loading };
}
