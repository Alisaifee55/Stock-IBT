// =============================================================
// MessagesView.jsx — v1.0 — 14-09-2026
// New in v2.6. The Messages tab: who's online, the inbox, and the
// conversation itself.
//
// Three things it answers at a glance:
//  - which shops are online right now, and when the others were last
//    seen (the presence strip, which covers every shop, not only the
//    ones you've already talked to)
//  - what the last message in each conversation was, and how many are
//    unread
//  - opening any conversation shows who read each message and when
//
// Head Office also sees every shop-to-shop conversation, marked
// "Viewing only" — it can read them but not post into them, and
// reading them leaves no read receipt on the two shops' own messages.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import ShopPickerPopover from './ShopPickerPopover';
import ThreadView from './ThreadView';
import {
  openThread,
  threadLabel,
  useChatRealtime,
  useInbox,
  HO_KEY,
} from '../lib/chatQueries';
import { dateDDMMYYYY, presenceLabel, timeHHMM, parseTs, usePresenceRoster } from '../lib/presence';
import { askPushPermission, isPushBlockedByIos, readPushState } from '../lib/onesignal';

function isToday(value) {
  const d = parseTs(value);
  if (!d) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/** Inbox timestamps: HH:MM today, DD-MM-YYYY before that. */
function stampFor(value) {
  if (!value) return '';
  return isToday(value) ? timeHHMM(value) : dateDDMMYYYY(value);
}

export default function MessagesView({
  account,
  myKey,
  shopsList = [],
  deepThreadId,
  onDeepHandled,
  onChanged,
}) {
  const [activeId, setActiveId] = useState(null);
  const [chatToken, setChatToken] = useState(0);
  const [picking, setPicking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [push, setPush] = useState(null);
  const [asking, setAsking] = useState(false);
  const [pushDismissed, setPushDismissed] = useState(false);

  const bump = useCallback(() => setChatToken((t) => t + 1), []);
  const { threads, loading, error, reload } = useInbox(chatToken);
  const { byKey: presenceByKey, roster } = usePresenceRoster(true);

  // A new message anywhere refreshes the list and, if it belongs to
  // the open conversation, the conversation too.
  useChatRealtime(true, () => {
    reload();
    bump();
    onChanged?.();
  });

  // Safety net for the open conversation if the realtime socket is
  // down: the inbox list has its own 30s poll, but a thread you are
  // reading refreshes only when chatToken changes.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') bump();
    }, 30000);
    return () => clearInterval(timer);
  }, [bump]);

  // Arrived from a push notification click.
  useEffect(() => {
    if (deepThreadId) {
      setActiveId(deepThreadId);
      onDeepHandled?.();
    }
  }, [deepThreadId, onDeepHandled]);

  useEffect(() => {
    let alive = true;
    readPushState().then((s) => {
      if (alive) setPush(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const iosBlocked = isPushBlockedByIos();

  const enablePush = async () => {
    setAsking(true);
    const result = await askPushPermission();
    setPush((prev) => ({ ...(prev || {}), ...result }));
    setAsking(false);
  };

  // Everyone this account can start a conversation with. Head Office
  // is a real participant without a shop row, so it joins the list as
  // a pseudo-shop keyed 'HO' — ShopPickerPopover only needs
  // id/code/country and works unchanged.
  const pickerShops = useMemo(() => {
    const real = [...shopsList]
      .filter((s) => s?.id)
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    if (account?.isAdmin) return real;
    return [{ id: HO_KEY, code: 'Head Office', country: null }, ...real];
  }, [shopsList, account?.isAdmin]);

  const start = async (memberKey) => {
    if (opening) return;
    setOpening(true);
    setOpenError('');
    try {
      const id = await openThread(memberKey);
      setPicking(false);
      setActiveId(id);
      reload();
    } catch (e) {
      setOpenError(e.message);
    } finally {
      setOpening(false);
    }
  };

  // Announcements first, then most recent conversation.
  const ordered = useMemo(() => {
    const list = [...threads];
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'broadcast' ? -1 : 1;
      const at = parseTs(a.last_message_at)?.getTime() || 0;
      const bt = parseTs(b.last_message_at)?.getTime() || 0;
      return bt - at;
    });
    return list;
  }, [threads]);

  const others = useMemo(
    () => roster.filter((r) => r.member_key !== myKey),
    [roster, myKey]
  );
  const onlineCount = others.filter((r) => r.online).length;

  const showPushBanner =
    !pushDismissed && (iosBlocked || (push && push.supported && !push.permission));

  return (
    <div className="chat-wrap">
      {showPushBanner && (
        <div className="chat-push-banner" role="status">
          <div>
            {iosBlocked ? (
              <>
                <strong>Add this app to your Home Screen for notifications.</strong> On iPhone,
                notifications only work from the installed app: tap Share, then “Add to Home
                Screen”, and open it from there.
              </>
            ) : (
              <>
                <strong>Turn on notifications</strong> to be told about new messages when this
                app isn’t open.
              </>
            )}
          </div>
          <div className="chat-push-actions">
            {!iosBlocked && (
              <button type="button" className="btn btn-primary" onClick={enablePush} disabled={asking}>
                {asking ? 'Waiting…' : 'Allow notifications'}
              </button>
            )}
            <button
              type="button"
              className="chat-banner-close"
              onClick={() => setPushDismissed(true)}
              aria-label="Dismiss this message"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="chat-presence">
        <div className="chat-presence-head">
          <span className="chat-presence-title">Shops</span>
          <span className="zero-stock-hint">
            {onlineCount} of {others.length} online
          </span>
        </div>
        <div className="chat-presence-strip">
          {others.map((r) => (
            <button
              type="button"
              key={r.member_key}
              className={`chat-chip${r.online ? ' is-online' : ''}`}
              onClick={() => start(r.member_key)}
              disabled={opening}
              title={`${r.name || r.code} — ${presenceLabel(r)}`}
            >
              <span className={`chat-chip-dot${r.online ? ' is-online' : ''}`} aria-hidden="true" />
              <span className="chat-chip-code">{r.code}</span>
              <span className="chat-chip-seen">{presenceLabel(r)}</span>
            </button>
          ))}
          {others.length === 0 && <span className="zero-stock-hint">No other shops yet.</span>}
        </div>
      </div>

      {openError && (
        <div className="error-box">
          {openError}
          <button type="button" className="btn btn-reset chat-retry" onClick={() => setOpenError('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className={`chat-layout${activeId ? ' has-active' : ''}`}>
        <div className="chat-list-col">
          <div className="chat-list-head">
            <h3>Messages</h3>
            <button type="button" className="btn btn-primary chat-new" onClick={() => setPicking(true)}>
              New message
            </button>
          </div>

          {loading && threads.length === 0 && (
            <div className="chat-loading">
              <span className="refresh-spinner" aria-hidden="true" />
              Loading your messages…
            </div>
          )}

          {error && (
            <div className="error-box">
              {error}
              <button type="button" className="btn btn-reset chat-retry" onClick={reload}>
                Try again
              </button>
            </div>
          )}

          {!loading && !error && ordered.length === 0 && (
            <div className="chat-empty">
              <strong>No conversations yet</strong>
              <span>Pick a shop above, or use New message.</span>
            </div>
          )}

          <div className="chat-list">
            {ordered.map((t) => {
              const label = threadLabel(t, myKey);
              const other = Array.isArray(t.participants)
                ? t.participants.find((p) => p.key !== myKey)
                : null;
              const live = other ? presenceByKey[other.key] : null;
              const online = (live?.online ?? other?.online) === true;
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`chat-row${activeId === t.id ? ' is-active' : ''}${
                    t.unread_count > 0 ? ' has-unread' : ''
                  }`}
                  onClick={() => setActiveId(t.id)}
                >
                  <span
                    className={`chat-row-avatar${t.kind === 'broadcast' ? ' is-broadcast' : ''}`}
                    aria-hidden="true"
                  >
                    {t.kind === 'broadcast' ? 'ALL' : String(label).slice(0, 3).toUpperCase()}
                  </span>
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <span className="chat-row-name">
                        {label}
                        {t.is_member === false && (
                          <span className="chat-observe-pill">Viewing only</span>
                        )}
                      </span>
                      <span className="chat-row-time">{stampFor(t.last_message_at)}</span>
                    </span>
                    <span className="chat-row-bottom">
                      <span className="chat-row-preview">
                        {t.last_message_preview || 'No messages yet'}
                      </span>
                      {t.unread_count > 0 && (
                        <span className="chat-unread-pill">{t.unread_count}</span>
                      )}
                    </span>
                    {t.kind !== 'broadcast' && other && (
                      <span className={`chat-row-presence${online ? ' is-online' : ''}`}>
                        {presenceLabel(live || other)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="chat-thread-col">
          {activeId ? (
            <ThreadView
              threadId={activeId}
              myKey={myKey}
              refreshToken={chatToken}
              onBack={() => setActiveId(null)}
              onChanged={() => {
                reload();
                onChanged?.();
              }}
              onOpenThread={(id) => {
                setActiveId(id);
                reload();
              }}
            />
          ) : (
            <div className="chat-thread-placeholder">
              <strong>Pick a conversation</strong>
              <span>Messages you open are marked read, and the sender is told when.</span>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <ShopPickerPopover
          title="Send a message to…"
          shops={pickerShops}
          excludeShopId={account?.shopId || null}
          onPick={(s) => start(String(s.id))}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
