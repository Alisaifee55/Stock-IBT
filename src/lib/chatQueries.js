// =============================================================
// chatQueries.js — v1.0 — 14-09-2026
// New in v2.6. Data layer for shop messaging. Everything goes
// through SECURITY DEFINER RPCs (migration 25) that derive the
// caller's shop from auth.uid(), so the client never passes its own
// identity and cannot read a conversation it isn't part of.
//
// Every call has a timeout guard and surfaces a real error — no
// silent failures, no unhandled promises.
//
// Realtime gives instant delivery; the 30s poll is the safety net
// for a dropped socket, matching the pattern already used by the
// notification bell.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { withTimeout } from './summaryRefresh';

const POLL_MS = 30000;

/** Head Office is a participant without a shop row, so it needs a
 *  stable pseudo-key everywhere a shop id would go. */
export const HO_KEY = 'HO';

export function memberKeyFor(account) {
  if (!account) return null;
  return account.isAdmin ? HO_KEY : account.shopId || null;
}

/** Label for a thread from the viewer's point of view. */
export function threadLabel(thread, myKey) {
  if (!thread) return '';
  if (thread.kind === 'broadcast') return 'Announcements — all shops';
  const parts = Array.isArray(thread.participants) ? thread.participants : [];
  if (thread.is_member) {
    const other = parts.find((p) => p.key !== myKey);
    return other?.code || 'Conversation';
  }
  // Head Office observing two shops' own conversation.
  return parts.map((p) => p.code).filter(Boolean).join('  \u2194  ');
}

export function otherParticipant(thread, myKey) {
  const parts = Array.isArray(thread?.participants) ? thread.participants : [];
  return parts.find((p) => p.key !== myKey) || null;
}

/** The inbox list. One payload for the whole Messages tab. */
export function useInbox(refreshToken) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const mounted = useRef(true);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const load = async (showSpinner) => {
      if (showSpinner) setLoading(true);
      try {
        const { data, error: err } = await withTimeout(
          supabase.rpc('get_my_inbox'),
          20000,
          'Loading your messages'
        );
        if (cancelled || !mounted.current) return;
        if (err) setError(err.message);
        else {
          setError('');
          setThreads(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled && mounted.current) setError(e.message);
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    };

    load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(false);
    }, POLL_MS);

    return () => {
      cancelled = true;
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refreshToken, reloadToken]);

  return { threads, loading, error, reload };
}

/** One conversation: participants, messages, and each message's own
 *  read list (which shop, at what time). */
export function useThread(threadId, refreshToken) {
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    // Only show the spinner on a first load; a poll refresh must not
    // blank out a conversation you're reading.
    setLoading((prev) => (thread?.id === threadId ? prev : true));

    withTimeout(
      supabase.rpc('get_thread', { p_thread_id: threadId, p_limit: 200 }),
      20000,
      'Loading the conversation'
    )
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else {
          setError('');
          setThread(data || null);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, refreshToken]);

  return { thread, loading, error };
}

/** Header badge count — threads the viewer is actually in. */
export function useChatUnread(refreshToken, enabled = true) {
  const [unread, setUnread] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return undefined;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error: err } = await withTimeout(
          supabase.rpc('get_chat_unread_count'),
          15000,
          'Checking for new messages'
        );
        if (cancelled || err) return;
        setUnread(Number(data) || 0);
      } catch {
        // Badge only. A failure here must not surface to the user.
      }
    };

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshToken, reloadToken, enabled]);

  return { unread, reload };
}

/** Fires cb() whenever any chat message is inserted that this
 *  account is allowed to see. RLS applies to the realtime stream, so
 *  a shop is never woken by someone else's conversation. */
export function useChatRealtime(enabled, cb) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!enabled) return undefined;
    const channel = supabase
      .channel('sara-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => cbRef.current?.(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}

/** Opens (or finds) the conversation with one other party.
 *  otherMemberKey is a shops.id as text, or 'HO'. */
export async function openThread(otherMemberKey) {
  const { data, error } = await withTimeout(
    supabase.rpc('open_thread', { p_other_member_key: String(otherMemberKey) }),
    20000,
    'Opening the conversation'
  );
  if (error) throw new Error(error.message);
  return data;
}

export async function sendMessage(threadId, body) {
  const { data, error } = await withTimeout(
    supabase.rpc('send_shop_message', { p_thread_id: threadId, p_body: body }),
    20000,
    'Sending your message'
  );
  if (error) throw new Error(error.message);
  return data;
}

export async function markThreadRead(threadId) {
  const { data, error } = await withTimeout(
    supabase.rpc('mark_thread_read', { p_thread_id: threadId }),
    15000,
    'Marking as read'
  );
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

/**
 * Asks the Edge Function to send the push for a message that is
 * ALREADY SAVED. Deliberately never throws: the message exists in the
 * inbox either way, so a push problem must not be reported to the
 * sender as a failed send. Problems land in the function's own logs.
 */
export async function notifyMessage(messageId) {
  if (!messageId) return { ok: false };
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('send-chat-push', {
        body: { message_id: messageId },
      }),
      15000,
      'Sending the notification'
    );
    if (error) {
      console.warn('Push not sent:', error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: true };
  } catch (err) {
    console.warn('Push not sent:', err?.message);
    return { ok: false, error: err?.message };
  }
}
