// =============================================================
// ThreadView.jsx — v1.0 — 14-09-2026
// New in v2.6. One conversation: messages oldest-to-newest, a read
// receipt under each of your own messages, and the composer.
//
// READ RECEIPTS are shop-level, because logins are shared per shop —
// "Read by SA · 14:32" means somebody at SA opened it, which is
// exactly the question being asked. Each receipt is a real row
// written when that message was on screen, so an older message shows
// when it was actually read, not when the shop last visited.
//
// The announcements channel is Head-Office-post-only. A shop sees no
// composer there, just a button to reply to Head Office privately,
// so one announcement doesn't turn into fifteen public replies.
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  markThreadRead,
  notifyMessage,
  openThread,
  otherParticipant,
  sendMessage,
  threadLabel,
  useThread,
  HO_KEY,
} from '../lib/chatQueries';
import { dateDDMMYYYY, presenceLabel, timeHHMM } from '../lib/presence';

const MAX_BODY = 4000;
const SLOW_MS = 2500;

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** "Sent" until somebody opens it, then who and when. */
function ReadReceipt({ message, thread, myKey }) {
  const [open, setOpen] = useState(false);
  const reads = Array.isArray(message.reads) ? message.reads : [];

  if (thread.kind === 'broadcast') {
    const audience = Math.max(
      (Array.isArray(thread.participants) ? thread.participants.length : 1) - 1,
      0
    );
    if (reads.length === 0) {
      return <span className="chat-receipt">Sent to {audience} shops</span>;
    }
    return (
      <span className="chat-receipt">
        <button type="button" className="chat-receipt-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Read by {reads.length} of {audience} shops
        </button>
        {open && (
          <span className="chat-receipt-list">
            {reads.map((r) => (
              <span key={r.key} className="chat-receipt-row">
                {r.code} &middot; {timeHHMM(r.read_at)}
              </span>
            ))}
          </span>
        )}
      </span>
    );
  }

  if (reads.length === 0) return <span className="chat-receipt">Sent</span>;
  const r = reads[0];
  return (
    <span className="chat-receipt is-read">
      Read by {r.code} &middot; {timeHHMM(r.read_at)}
    </span>
  );
}

export default function ThreadView({ threadId, myKey, refreshToken, onBack, onChanged, onOpenThread }) {
  const [localToken, setLocalToken] = useState(0);
  const bump = useCallback(() => setLocalToken((t) => t + 1), []);
  const { thread, loading, error } = useThread(threadId, `${refreshToken}-${localToken}`);

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState([]);
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [openingHo, setOpeningHo] = useState(false);
  const [hoError, setHoError] = useState('');

  const endRef = useRef(null);
  const lastMarkedRef = useRef(null);

  const messages = useMemo(
    () => (Array.isArray(thread?.messages) ? thread.messages : []),
    [thread]
  );
  const other = thread ? otherParticipant(thread, myKey) : null;
  const canPost = thread?.can_post === true;
  const observing = thread ? thread.is_member === false : false;

  // A draft switching threads under you would send to the wrong shop.
  useEffect(() => {
    setDraft('');
    setPending([]);
    lastMarkedRef.current = null;
  }, [threadId]);

  // Mark read whenever the newest message changes — opening the
  // thread, and anything that arrives while you're looking at it.
  useEffect(() => {
    if (!thread?.id || observing || messages.length === 0) return;
    const newest = messages[messages.length - 1];
    if (!newest || newest.sender_key === myKey) return;
    if (lastMarkedRef.current === newest.id) return;
    lastMarkedRef.current = newest.id;
    markThreadRead(thread.id)
      .then((n) => {
        if (n > 0) onChanged?.();
      })
      .catch(() => {
        // Retried on the next message; nothing to show the user.
        lastMarkedRef.current = null;
      });
  }, [thread?.id, messages, myKey, observing, onChanged]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending.length]);

  const doSend = useCallback(
    async (body, tempId) => {
      const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
      try {
        const msg = await sendMessage(threadId, body);
        setPending((p) => p.filter((x) => x.tempId !== tempId));
        bump();
        onChanged?.();
        // Push is fired after the message is safely stored, and its
        // outcome deliberately does not affect this send.
        notifyMessage(msg?.id);
      } catch (e) {
        setPending((p) =>
          p.map((x) =>
            x.tempId === tempId ? { ...x, state: 'failed', error: e.message } : x
          )
        );
      } finally {
        clearTimeout(slowTimer);
        setSlow(false);
        setSending(false);
      }
    },
    [threadId, bump, onChanged]
  );

  const handleSend = () => {
    const body = draft.trim();
    if (!body || sending || !canPost) return;
    if (body.length > MAX_BODY) return;
    const tempId = `tmp-${Date.now()}`;
    setSending(true);
    setPending((p) => [...p, { tempId, body, state: 'sending' }]);
    setDraft('');
    doSend(body, tempId);
  };

  const retry = (item) => {
    if (sending) return;
    setSending(true);
    setPending((p) =>
      p.map((x) => (x.tempId === item.tempId ? { ...x, state: 'sending', error: '' } : x))
    );
    doSend(item.body, item.tempId);
  };

  const handleBack = () => {
    if (draft.trim()) setConfirmLeave(true);
    else onBack?.();
  };

  const replyToHeadOffice = async () => {
    if (openingHo) return;
    setOpeningHo(true);
    setHoError('');
    try {
      const id = await openThread(HO_KEY);
      onOpenThread?.(id);
    } catch (e) {
      setHoError(e.message);
    } finally {
      setOpeningHo(false);
    }
  };

  useEffect(() => {
    if (!confirmLeave) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirmLeave(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmLeave]);

  if (loading && !thread) {
    return (
      <div className="chat-thread">
        <div className="chat-loading">
          <span className="refresh-spinner" aria-hidden="true" />
          Loading the conversation…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-thread">
        <div className="chat-thread-head">
          <button type="button" className="chat-back" onClick={onBack} aria-label="Back to messages">
            <BackIcon />
          </button>
          <span>Conversation</span>
        </div>
        <div className="error-box">
          {error}
          <button type="button" className="btn btn-reset chat-retry" onClick={bump}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!thread) return null;

  // Group by calendar day so each day gets one separator.
  const rows = [];
  let lastDay = '';
  messages.forEach((m) => {
    const day = dateDDMMYYYY(m.created_at);
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${day}-${m.id}`, day });
      lastDay = day;
    }
    rows.push({ type: 'msg', key: m.id, message: m });
  });

  return (
    <div className="chat-thread">
      <div className="chat-thread-head">
        <button type="button" className="chat-back" onClick={handleBack} aria-label="Back to messages">
          <BackIcon />
        </button>
        <div className="chat-thread-who">
          <div className="chat-thread-title">{threadLabel(thread, myKey)}</div>
          <div className="chat-thread-sub">
            {thread.kind === 'broadcast'
              ? `${Math.max((thread.participants?.length || 1) - 1, 0)} shops`
              : presenceLabel(other)}
            {observing && <span className="chat-observe-pill">Viewing only</span>}
          </div>
        </div>
        {other && !other.online && thread.kind !== 'broadcast' && (
          <span className="chat-offline-dot" title="Offline" aria-hidden="true" />
        )}
        {other?.online && <span className="chat-online-dot" title="Online" aria-hidden="true" />}
      </div>

      <div className="chat-scroll">
        {rows.length === 0 && (
          <div className="chat-empty">
            <strong>No messages yet</strong>
            <span>Send the first one below.</span>
          </div>
        )}

        {rows.map((row) =>
          row.type === 'day' ? (
            <div className="chat-day" key={row.key}>
              <span>{row.day}</span>
            </div>
          ) : (
            <div
              className={`chat-bubble-row${row.message.is_mine ? ' is-mine' : ''}`}
              key={row.key}
            >
              <div className="chat-bubble">
                {!row.message.is_mine && (
                  <div className="chat-bubble-sender">{row.message.sender_code}</div>
                )}
                <div className="chat-bubble-body">{row.message.body}</div>
                <div className="chat-bubble-meta">
                  <span>{timeHHMM(row.message.created_at)}</span>
                  {row.message.is_mine && (
                    <ReadReceipt message={row.message} thread={thread} myKey={myKey} />
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {pending.map((p) => (
          <div className="chat-bubble-row is-mine" key={p.tempId}>
            <div className={`chat-bubble is-pending${p.state === 'failed' ? ' is-failed' : ''}`}>
              <div className="chat-bubble-body">{p.body}</div>
              <div className="chat-bubble-meta">
                {p.state === 'failed' ? (
                  <>
                    <span className="chat-failed">Not sent — {p.error}</span>
                    <button type="button" className="chat-receipt-btn" onClick={() => retry(p)}>
                      Retry
                    </button>
                    <button
                      type="button"
                      className="chat-receipt-btn"
                      onClick={() => setPending((list) => list.filter((x) => x.tempId !== p.tempId))}
                    >
                      Discard
                    </button>
                  </>
                ) : (
                  <span className="chat-receipt">{slow ? 'Still sending…' : 'Sending…'}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {canPost ? (
        <div className="chat-composer">
          <textarea
            className="chat-input"
            value={draft}
            maxLength={MAX_BODY}
            placeholder={`Message ${threadLabel(thread, myKey)}…`}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            aria-label="Type your message"
          />
          <button
            type="button"
            className="btn btn-primary chat-send"
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            aria-label="Send message"
          >
            {sending ? <span className="refresh-spinner" aria-hidden="true" /> : <SendIcon />}
            <span className="chat-send-label">{sending ? (slow ? 'Still sending' : 'Sending') : 'Send'}</span>
          </button>
          {draft.length > MAX_BODY - 200 && (
            <span className="chat-counter">{MAX_BODY - draft.length} left</span>
          )}
        </div>
      ) : (
        <div className="chat-locked">
          {observing ? (
            <span>You are viewing this conversation as Head Office. Only the two shops can post.</span>
          ) : (
            <>
              <span>Only Head Office posts announcements.</span>
              <button
                type="button"
                className="btn btn-primary chat-locked-btn"
                onClick={replyToHeadOffice}
                disabled={openingHo}
              >
                {openingHo ? 'Opening…' : 'Reply to Head Office privately'}
              </button>
              {hoError && <span className="chat-failed">{hoError}</span>}
            </>
          )}
        </div>
      )}

      {confirmLeave && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmLeave(false)}
          role="presentation"
        >
          <div
            className="modal-card chat-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Discard unsent message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h4>Discard your message?</h4>
              <button
                type="button"
                className="modal-close"
                onClick={() => setConfirmLeave(false)}
                aria-label="Keep editing"
              >
                &times;
              </button>
            </div>
            <div className="chat-confirm-body">
              You have typed a message but not sent it. Going back will discard it.
            </div>
            <div className="chat-confirm-actions">
              <button type="button" className="btn btn-reset" onClick={() => setConfirmLeave(false)}>
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmLeave(false);
                  setDraft('');
                  onBack?.();
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
