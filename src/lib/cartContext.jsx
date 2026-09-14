// =============================================================
// cartContext.jsx — v2.5 — 13-09-2026
// New in v2.5. The transfer cart used to live inside ModelDetailModal,
// scoped to one model and one supplying shop at a time. It's now
// app-level and persists as you browse different models and shops:
//
//  - Multiple shops AND multiple models can sit in the cart at once.
//  - Two directions, both going through the same cart:
//      "request" — you're pulling stock FROM another shop TO your own.
//      "send"    — you're pushing your OWN shop's stock TO another shop.
//    Which one a click becomes is decided by which shop's Stock number
//    you clicked (see StockGridAllShops.jsx): clicking your own shop's
//    number starts a "send" (you pick the destination); clicking any
//    other shop's number is a straight "request" (from your own shop).
//  - Head Office (admin) accounts have no shop of their own, so every
//    click is "pick the other shop" — the clicked shop supplies, the
//    picked shop requests. That's the same shape as everyone else's
//    "send" flow, just without an implicit home shop.
//
// On submit, lines are grouped by (requesting shop, supplying shop) —
// exactly the two ends of one IBT transfer — and one transfer is
// created per group, even if that group spans several models. This
// needs the new create_ibt_transfer_v2 RPC (migration 24, PROPOSED —
// not yet verified against the live schema, see the handoff doc)
// because the original create_ibt_transfer always assumed the caller
// was the requesting shop, which "send" and Head Office transfers
// break.
// =============================================================

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createTransferV2 } from './ibtQueries';

const CartContext = createContext(null);

function lineKey(l) {
  return `${l.requestingShopId}|${l.supplyingShopId}|${l.modelNo}|${l.color || ''}|${l.size || ''}`;
}
function groupKey(requestingShopId, supplyingShopId) {
  return `${requestingShopId}|${supplyingShopId}`;
}

export function CartProvider({ myShopId, isAdmin, onCreated, children }) {
  const [lines, setLines] = useState(new Map()); // key -> line
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null); // last submit's per-group outcome, or null

  const addLine = useCallback((line) => {
    setResults(null);
    setLines((prev) => {
      const next = new Map(prev);
      const key = lineKey(line);
      const existing = next.get(key);
      const qty = Math.min(line.available, (existing?.qty || 0) + 1);
      next.set(key, { ...line, qty });
      return next;
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setLines((prev) => {
      const line = prev.get(key);
      if (!line) return prev;
      let n = qty === '' ? 0 : Math.floor(Number(qty));
      if (!Number.isFinite(n) || n < 0) n = 0;
      if (n > line.available) n = line.available;
      const next = new Map(prev);
      if (n <= 0) next.delete(key);
      else next.set(key, { ...line, qty: n });
      return next;
    });
  }, []);

  const removeLine = useCallback((key) => {
    setLines((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setLines(new Map());
    setResults(null);
  }, []);

  const isQueued = useCallback(
    (modelNo, color, size, supplyingShopId) => {
      const target = `${supplyingShopId}|${modelNo}|${color || ''}|${size || ''}`;
      for (const l of lines.values()) {
        if (`${l.supplyingShopId}|${l.modelNo}|${l.color || ''}|${l.size || ''}` === target) return true;
      }
      return false;
    },
    [lines]
  );

  // Grouped by shop-pair for display AND for submission — one IBT
  // transfer per group, whatever models/colours/sizes it contains.
  const groups = useMemo(() => {
    const byGroup = new Map();
    lines.forEach((line) => {
      const gKey = groupKey(line.requestingShopId, line.supplyingShopId);
      if (!byGroup.has(gKey)) {
        byGroup.set(gKey, {
          key: gKey,
          requestingShopId: line.requestingShopId,
          requestingShopCode: line.requestingShopCode,
          supplyingShopId: line.supplyingShopId,
          supplyingShopCode: line.supplyingShopCode,
          direction:
            line.requestingShopId === myShopId ? 'request' : line.supplyingShopId === myShopId ? 'send' : 'hq',
          lines: [],
        });
      }
      byGroup.get(gKey).lines.push({ ...line, key: lineKey(line) });
    });
    return [...byGroup.values()];
  }, [lines, myShopId]);

  const totalLines = lines.size;
  const totalQty = useMemo(() => {
    let t = 0;
    lines.forEach((l) => (t += Number(l.qty) || 0));
    return t;
  }, [lines]);

  const submit = useCallback(async () => {
    if (groups.length === 0 || submitting) return;
    setSubmitting(true);
    const outcomes = [];
    for (const g of groups) {
      try {
        const payload = g.lines.map((l) => ({
          model_no: l.modelNo,
          color: l.color || null,
          size: l.size || null,
          qty_requested: Number(l.qty),
        }));
        const transfer = await createTransferV2(g.requestingShopId, g.supplyingShopId, payload);
        outcomes.push({ ok: true, group: g, transfer });
      } catch (err) {
        outcomes.push({ ok: false, group: g, error: err.message || 'Could not create this transfer.' });
      }
    }
    // Remove only the groups that succeeded — a failed group stays
    // queued so nothing typed is lost.
    setLines((prev) => {
      const next = new Map(prev);
      outcomes.filter((o) => o.ok).forEach((o) => o.group.lines.forEach((l) => next.delete(l.key)));
      return next;
    });
    setResults(outcomes);
    setSubmitting(false);
    if (outcomes.some((o) => o.ok)) onCreated?.();
    return outcomes;
  }, [groups, submitting, onCreated]);

  const value = useMemo(
    () => ({
      lines,
      groups,
      totalLines,
      totalQty,
      submitting,
      results,
      addLine,
      setQty,
      removeLine,
      clear,
      isQueued,
      submit,
      dismissResults: () => setResults(null),
      myShopId,
      isAdmin,
    }),
    [lines, groups, totalLines, totalQty, submitting, results, addLine, setQty, removeLine, clear, isQueued, submit, myShopId, isAdmin]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart() must be used inside a CartProvider');
  return ctx;
}
