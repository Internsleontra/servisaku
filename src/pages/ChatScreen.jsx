import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Camera, Phone, MessageSquare, ShieldCheck, MapPin,
  CalendarCheck, LoaderCircle,
} from 'lucide-react';
import moment from 'moment';
import { servisaku } from '@/api/servisakuClient';
import { useChat } from '@/hooks/useChat';
import { useRealtimeBooking } from '@/hooks/useRealtimeBooking';
import { ChatBubble, RING } from '@/components/ds';
import { useTranslation } from '@/lib/useTranslation';

/**
 * Chat.
 *
 * The design system's web kit has no chat page, so this adapts the mobile app
 * pattern (ChatBubble thread) onto the web chrome the rest of the site uses:
 * gradient page header, 1240px container, and a booking-context aside on
 * desktop. Replaces a `lg:max-w-3xl` centre column with vertical borders.
 */
/* Day separator between message groups. moment's calendar() hardcoded
   "[Today]"/"[Yesterday]" in English; this asks the dictionary instead and
   falls back to a locale-formatted date for anything older. */
function daySeparator(value, t, locale) {
  const d = new Date(value);
  const today = new Date();
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(today) - midnight(d)) / 86400000);
  if (days === 0) return t('Today');
  if (days === 1) return t('Yesterday');
  if (days < 7) return d.toLocaleDateString(locale, { weekday: 'long' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ChatScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [text, setText] = useState('');
  const { booking } = useRealtimeBooking(bookingId);
  const { t, locale } = useTranslation();
  const { messages, loading, sending, sendMessage, sendPhoto } = useChat(bookingId);
  const bottomRef = useRef();
  const fileRef = useRef();

  useEffect(() => { servisaku.auth.me().then(setUser); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    const body = text;
    setText('');
    await sendMessage(user.email, user.full_name, user.role || 'consumer', body);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handlePhoto = async (e) => {
    if (!user || !e.target.files[0]) return;
    await sendPhoto(user.email, user.full_name, user.role || 'consumer', e.target.files[0]);
  };

  const otherName = user?.role === 'partner' ? booking?.consumer_name : booking?.partner_name;
  const initial = otherName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Header */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-6 md:px-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Back')}
          </button>

          <div className="flex items-center gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15 font-semibold ring-1 ring-inset ring-white/20">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-h2 font-semibold text-white">
                {otherName || 'Chat'}
              </h1>
              <p className="truncate text-caption font-normal text-white/70">
                {booking?.service_type || t('Booking conversation')}
              </p>
            </div>
            <a
              href={booking?.partner_phone ? `tel:${booking.partner_phone}` : undefined}
              aria-label={t('Call')}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
            >
              <Phone className="size-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Thread + booking context */}
      <div className="mx-auto grid w-full max-w-[1240px] flex-1 items-start gap-6 px-5 py-6 md:px-8 lg:grid-cols-[1.5fr_0.9fr]">
        <div className={`flex min-h-[60vh] flex-col rounded-card bg-surface ${RING}`}>
          {/* Messages */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 md:p-5">
            {loading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-ink-secondary" role="status">
                <LoaderCircle className="size-4 animate-spin" />
                <span className="text-caption">{t('Loading messages…')}</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <span className="grid size-16 place-items-center rounded-full bg-grad-brand-soft text-brand-ink">
                  <MessageSquare className="size-7" />
                </span>
                <p className="mt-3 font-display text-h4 font-semibold text-ink">{t('No messages yet')}</p>
                <p className="mt-1 text-caption font-normal text-ink-secondary">
                  {t('Send a message to get started.')}
                </p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const prev = messages[i - 1];
                const showDate = i === 0
                  || moment(msg.created_date).date() !== moment(prev.created_date).date();
                const isMe = msg.sender_email === user?.email;
                const isSystem = msg.message_type === 'system';

                return (
                  <div key={msg.id} className="contents">
                    {showDate && (
                      <ChatBubble from="system">
                        {daySeparator(msg.created_date, t, locale)}
                      </ChatBubble>
                    )}

                    {isSystem ? (
                      <ChatBubble from="system">{msg.message}</ChatBubble>
                    ) : msg.file_url && msg.message_type === 'image' ? (
                      <div className={isMe ? 'self-end' : 'self-start'}>
                        <img
                          src={msg.file_url}
                          alt={`Photo from ${msg.sender_name || 'partner'}`}
                          className={`max-h-56 max-w-full rounded-[14px] object-cover ${RING}`}
                        />
                      </div>
                    ) : (
                      <ChatBubble
                        from={isMe ? 'me' : 'them'}
                        time={new Date(msg.created_date).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
                        status={isMe ? (msg.is_read ? 'read' : 'sent') : undefined}
                        pending={msg._optimistic}
                      >
                        {!isMe && (
                          <span className="sa-caps mb-0.5 block text-ink-tertiary">
                            {msg.sender_name}
                          </span>
                        )}
                        {msg.message}
                      </ChatBubble>
                    )}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="flex items-end gap-2 p-4 shadow-[inset_0_1px_0_rgb(var(--hairline))] md:p-5">
            <button
              onClick={() => fileRef.current?.click()}
              aria-label={t('Attach a photo')}
              className={`grid size-11 shrink-0 place-items-center rounded-field bg-raised text-ink-secondary transition hover:bg-brand-tint hover:text-brand ${RING}`}
            >
              <Camera className="size-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" aria-label="Attach a photo" className="sr-only" onChange={handlePhoto} />

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Type a message…')}
              aria-label={t('Message')}
              rows={1}
              className={`max-h-24 min-h-11 flex-1 resize-none rounded-field bg-raised px-4 py-3 text-caption text-ink outline-none placeholder:text-ink-tertiary focus:shadow-[inset_0_0_0_1.5px_rgb(var(--brand))] ${RING}`}
            />

            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              aria-label={t('Send message')}
              className="grid size-11 shrink-0 place-items-center rounded-field bg-brand text-white shadow-brand transition hover:brightness-[0.94] active:scale-[0.97] disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>

        {/* Booking context — desktop aside */}
        {booking && (
          <aside className={`hidden flex-col gap-3 rounded-card bg-surface p-5 lg:sticky lg:top-[100px] lg:flex ${RING}`}>
            <h2 className="font-display text-h4 font-semibold text-ink">{t('Booking')}</h2>
            <div className="flex flex-col gap-2 text-caption font-normal text-ink-secondary">
              <span className="inline-flex items-center gap-2">
                <CalendarCheck className="size-4 shrink-0 text-brand" />
                <span className="sa-num">
                  {booking.date
                    ? new Date(booking.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
                    : '—'}
                </span>
                {booking.time_slot && <span className="sa-num">· {booking.time_slot}</span>}
              </span>
              {booking.city && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4 shrink-0 text-brand" /> {booking.city}
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand" /> {t('Escrow protected')}
              </span>
            </div>
            <button
              onClick={() => navigate(`/booking/${bookingId}`)}
              className={`mt-1 h-11 rounded-field bg-surface text-caption font-semibold text-brand transition hover:bg-brand-tint ${RING}`}
            >
              {t('View booking details')}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
