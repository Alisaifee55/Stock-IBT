// =============================================================
// ibtQueries.js — v2.0 — 12-09-2026
// Data layer for Inter-Branch Transfers. Everything goes through
// SECURITY DEFINER RPCs that derive your shop from auth.uid(), so the
// client never passes its own shop id and can't ask for another
// shop's transfers.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { withTimeout } from './summaryRefresh';

export const TRANSFER_STATUS_LABELS = {
  pending: 'Awaiting response',
  partially_accepted: 'Partly accepted',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export const TRANSFER_STATUS_TONE = {
  pending: 'warning',
  partially_accepted: 'warning',
  accepted: 'success',
  rejected: 'error',
};

/** 'incoming' = we're the supplying shop. 'outgoing' = we requested it. */
export function useMyTransfers(direction, refreshToken) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    withTimeout(supabase.rpc('get_my_transfers', { p_direction: direction }), 20000, 'Loading transfers')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setTransfers(data || []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [direction, refreshToken]);

  return { transfers, loading, error };
}

export function useTransferDetail(transferId, refreshToken) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!transferId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    withTimeout(
      supabase.rpc('get_transfer_detail', { p_transfer_id: transferId }),
      20000,
      'Loading transfer detail'
    )
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setDetail(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transferId, refreshToken]);

  return { detail, loading, error };
}

/** Badge counts for the Transfers tab. Polls, so it survives a missed event. */
export function useIbtCounts(refreshToken, intervalMs = 60000) {
  const [counts, setCounts] = useState({ incoming_pending: 0, unread_notifications: 0 });
  const timerRef = useRef(null);

  const load = useCallback(() => {
    supabase
      .rpc('get_ibt_counts')
      .then(({ data, error }) => {
        if (!error && data) setCounts(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [load, intervalMs, refreshToken]);

  return { counts, reload: load };
}

/** Colour/size rows of one model at one shop, as transfer candidates. */
export function useTransferCandidates(modelNo, shopId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!modelNo || !shopId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('current_stock_items')
      .select('color, size, closing_stock')
      .eq('model_no', modelNo)
      .eq('shop_id', shopId)
      .gt('closing_stock', 0)
      .order('color')
      .order('size')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        setRows(err ? [] : data || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelNo, shopId]);

  return { rows, loading, error };
}

export async function createTransfer(supplyingShopId, lineItems) {
  const { data, error } = await withTimeout(
    supabase.rpc('create_ibt_transfer', {
      p_supplying_shop_id: supplyingShopId,
      p_line_items: lineItems,
    }),
    20000,
    'Creating the transfer'
  );
  if (error) throw new Error(error.message);
  return data;
}

export async function decideLineItem(lineItemId, decision) {
  const { data, error } = await withTimeout(
    supabase.rpc('decide_ibt_line_item', {
      p_line_item_id: lineItemId,
      p_decision: decision,
    }),
    20000,
    'Saving your decision'
  );
  if (error) throw new Error(error.message);
  return data;
}
