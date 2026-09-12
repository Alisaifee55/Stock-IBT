// =============================================================
// stockQueries.js — v2.0 — 12-09-2026
// Changes from v1.0:
//  - useFilterOptions now calls one get_filter_options() RPC that does
//    SELECT DISTINCT server-side. The old version pulled .limit(5000)
//    unordered rows per dimension and deduped client-side, so options
//    beyond the cut silently vanished and the lists reshuffled between
//    loads.
//  - useStockSummary: page resets during render instead of in a second
//    effect, so a filter change can no longer fire a query with the
//    previous page's range. loadMore is guarded by a ref, so fast
//    scrolling can't double-increment and skip a page.
//  - Exact row count is requested only for page 0, not every page.
//  - Model search text is sanitised before going into an ilike filter.
//  - useCountryStatus returns models tracked AND models in stock; the
//    card previously labelled the former as the latter.
//  - Adds useModelAcrossShops() for the model detail modal.
//  - Adds fetchAllSummaryRows() so CSV export covers every row matching
//    the current filters, not just the pages scrolled into view.
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const PAGE_SIZE = 100;

/**
 * Model numbers are alphanumeric with dashes/dots/slashes. Anything else
 * is dropped rather than escaped: a raw comma or bracket breaks
 * PostgREST's filter grammar, and '%' / '_' silently change the match.
 */
export function sanitizeSearch(s) {
  return String(s || '')
    .replace(/[^A-Za-z0-9 ._/-]/g, '')
    .trim();
}

/** ISO date (YYYY-MM-DD) to DD-MM-YYYY. Plain string work, no timezone. */
export function formatIsoDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso);
}

/** All shops, fetched once — small reference table. */
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

/** Per-country status: last upload, rows stored, models tracked, models in stock. */
export function useCountryStatus(refreshToken) {
  const [status, setStatus] = useState({});
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const results = await Promise.all(
        COUNTRIES.map(async (country) => {
          const { data: upload } = await supabase
            .from('stock_uploads')
            .select('uploaded_at, row_count, source_filename')
            .eq('country', country)
            .eq('status', 'completed')
            .order('uploaded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const [{ count: modelCount }, { count: inStockCount }] = await Promise.all([
            supabase.from('stock_summary').select('*', { count: 'exact', head: true }).eq('shop_country', country),
            supabase
              .from('stock_summary')
              .select('*', { count: 'exact', head: true })
              .eq('shop_country', country)
              .gt('closing_stock', 0),
          ]);
          return [country, { upload, modelCount: modelCount ?? 0, inStockCount: inStockCount ?? 0 }];
        })
      );
      if (!cancelled) setStatus(Object.fromEntries(results));
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);
  return status;
}

export const EMPTY_FILTERS = {
  shopIds: new Set(),
  categories: new Set(),
  brands: new Set(),
  countries: new Set(['UAE', 'OMAN']), // Kuwait opt-in
  showZeroStock: false,
  includeNeverSold: false,
  daysSinceLastSaleMin: '',
  daysSinceLastSaleMax: '',
  modelSearch: '',
};

function applyCommonFilters(query, filters) {
  if (!filters.showZeroStock) query = query.gt('closing_stock', 0);
  if (filters.shopIds.size) query = query.in('shop_id', Array.from(filters.shopIds));
  if (filters.categories.size) query = query.in('category', Array.from(filters.categories));
  if (filters.brands.size) query = query.in('brand', Array.from(filters.brands));
  if (filters.countries.size) query = query.in('shop_country', Array.from(filters.countries));

  const search = sanitizeSearch(filters.modelSearch);
  if (search) query = query.ilike('model_no', `%${search}%`);

  const hasDaysFilter = filters.daysSinceLastSaleMin !== '' || filters.daysSinceLastSaleMax !== '';
  if (hasDaysFilter) {
    if (filters.includeNeverSold) {
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

function buildFiltersKey(filters, extra) {
  return JSON.stringify({
    shopIds: Array.from(filters.shopIds).sort(),
    categories: Array.from(filters.categories).sort(),
    brands: Array.from(filters.brands).sort(),
    countries: Array.from(filters.countries).sort(),
    showZeroStock: filters.showZeroStock,
    includeNeverSold: filters.includeNeverSold,
    daysSinceLastSaleMin: filters.daysSinceLastSaleMin,
    daysSinceLastSaleMax: filters.daysSinceLastSaleMax,
    modelSearch: filters.modelSearch,
    ...extra,
  });
}

/** Paginated (infinite-scroll style) live report rows. */
export function useStockSummary(filters, sort, modelJump) {
  const filtersKey = useMemo(() => buildFiltersKey(filters, { modelJump, sort }), [filters, sort, modelJump]);

  // Derived state: reset the page during render when the filter key
  // changes, so no effect can ever fire with the previous page's range.
  const [paging, setPaging] = useState({ key: filtersKey, page: 0 });
  if (paging.key !== filtersKey) setPaging({ key: filtersKey, page: 0 });

  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const page = paging.page;

  useEffect(() => {
    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);
    setError('');

    // Exact count is a full scan of the filtered set — only worth paying
    // on the first page; later pages reuse the figure we already have.
    const countMode = page === 0 ? 'exact' : undefined;
    let query = supabase.from('stock_summary').select('*', countMode ? { count: countMode } : undefined);

    if (modelJump) {
      // Bypasses every other filter — shows exactly this model's row(s).
      query = query.eq('model_no', modelJump);
    } else {
      query = applyCommonFilters(query, filters);
    }
    query = query.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false });
    // Tie-break so rows can't shuffle between pages and duplicate/vanish.
    query = query.order('model_no', { ascending: true });
    query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    query.then(({ data, count, error: err }) => {
      if (cancelled) return;
      loadingRef.current = false;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setRows((prev) => (page === 0 ? data || [] : [...prev, ...(data || [])]));
      if (page === 0) setTotalCount(count ?? 0);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      loadingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page]);

  const hasMore = rows.length < totalCount;

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true; // claimed synchronously, before any re-render
    setPaging((p) => ({ ...p, page: p.page + 1 }));
  }, []);

  return { rows, totalCount, loading, error, loadMore, hasMore };
}

/**
 * Cascading filter option lists. One RPC, DISTINCT computed in Postgres —
 * each dimension against every OTHER active filter.
 */
export function useFilterOptions(filters) {
  const [options, setOptions] = useState({ shops: [], categories: [], brands: [] });
  const [error, setError] = useState('');
  const filtersKey = useMemo(() => buildFiltersKey(filters, {}), [filters]);

  useEffect(() => {
    let cancelled = false;

    supabase
      .rpc('get_filter_options', {
        p_shop_ids: filters.shopIds.size ? Array.from(filters.shopIds) : null,
        p_categories: filters.categories.size ? Array.from(filters.categories) : null,
        p_brands: filters.brands.size ? Array.from(filters.brands) : null,
        p_countries: filters.countries.size ? Array.from(filters.countries) : null,
        p_show_zero_stock: filters.showZeroStock,
        p_include_never_sold: filters.includeNeverSold,
        p_days_min: filters.daysSinceLastSaleMin === '' ? null : Number(filters.daysSinceLastSaleMin),
        p_days_max: filters.daysSinceLastSaleMax === '' ? null : Number(filters.daysSinceLastSaleMax),
        p_model_search: sanitizeSearch(filters.modelSearch) || null,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          return;
        }
        setError('');
        setOptions({
          shops: data?.shops || [],
          categories: data?.categories || [],
          brands: data?.brands || [],
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  return { ...options, error };
}

/** Color/Size detail breakdown for one Model+Shop, fetched on row expand. */
export function useStockDetail(modelNo, shopId, enabled) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('current_stock_items')
      .select('color, size, closing_stock, total_sales, total_purchase')
      .eq('model_no', modelNo)
      .eq('shop_id', shopId)
      .order('color')
      .order('size')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        // A failed query used to render as "no breakdown found", which
        // reads as valid data. Surface it instead.
        if (err) setError(err.message);
        setDetail(err ? [] : data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelNo, shopId, enabled]);

  return { detail, loading, error };
}


/**
 * Every OTHER shop currently holding this model, most stock first.
 * Powers the "Also in stock at" row in the model detail modal, and is
 * the natural starting point for an inter-branch transfer request.
 */
export function useModelAcrossShops(modelNo, excludeShopId) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!modelNo) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('stock_summary')
      .select('shop_id, shop_code, shop_country, closing_stock')
      .eq('model_no', modelNo)
      .gt('closing_stock', 0)
      .order('closing_stock', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        setShops(error ? [] : (data || []).filter((r) => r.shop_id !== excludeShopId));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelNo, excludeShopId]);

  return { shops, loading };
}


export const EXPORT_PAGE_SIZE = 1000;
export const EXPORT_MAX_ROWS = 50000; // guard: beyond this, the browser struggles

/**
 * Pages through every row matching the current filters, for CSV export.
 * The report itself only holds the pages you've scrolled, so exporting
 * `rows` would silently give you the first 100.
 * Returns { rows, truncated }.
 */
export async function fetchAllSummaryRows(filters, sort, modelJump, { onProgress, isCancelled } = {}) {
  const out = [];
  let page = 0;
  let truncated = false;

  for (;;) {
    if (isCancelled?.()) return { rows: out, truncated, cancelled: true };

    let query = supabase.from('stock_summary').select('*');
    if (modelJump) query = query.eq('model_no', modelJump);
    else query = applyCommonFilters(query, filters);
    query = query.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false });
    query = query.order('model_no', { ascending: true });
    query = query.range(page * EXPORT_PAGE_SIZE, page * EXPORT_PAGE_SIZE + EXPORT_PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    out.push(...(data || []));
    onProgress?.(out.length);

    if (!data || data.length < EXPORT_PAGE_SIZE) break;
    if (out.length >= EXPORT_MAX_ROWS) {
      truncated = true;
      break;
    }
    page += 1;
  }

  return { rows: out.slice(0, EXPORT_MAX_ROWS), truncated };
}
