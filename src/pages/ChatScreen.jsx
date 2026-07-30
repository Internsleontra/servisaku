import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Camera, Info, Phone } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { useChat } from '@/hooks/useChat';
import { useRealtimeBooking } from '@/hooks/useRealtimeBooking';
import moment from 'moment';

function MessageBubble({ msg, myEmail }) {
  const isMe = msg.sender_email === myEmail;
  const isSystem = msg.message_type === 'system';

  if (isSystem) return (
    <div className="flex justify-center my-2">
      <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">{msg.message}</span>
    </div>
  );

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isMe && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 shrink-0 self-end mb-0.5">
          <span className="text-[10px] font-bold text-primary">{msg.sender_name?.charAt(0) || '?'}</span>
        </div>
      )}
      <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isMe && (
          <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">{msg.sender_name}</span>
        )}
        {msg.file_url && msg.message_type === 'image' ? (
          <div className={`rounded-2xl overflow-hidden ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
            <img src={msg.file_url} alt="Photo" className="max-w-full max-h-48 object-cover" />
          </div>
        ) : (
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isMe
              ? 'bg-primary text-white rounded-br-sm'
              : 'bg-surface border border-border text-foreground rounded-bl-sm shadow-sm'
          } ${msg._optimistic ? 'opacity-70' : ''}`}>
            {msg.message}
          </div>
        )}
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <span className="text-[9px] text-muted-foreground">
            {moment(msg.created_date).format('h:mm A')}
          </span>
          {isMe && (
            <span className="text-[9px] text-muted-foreground">
              {msg.is_read ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [text, setText] = useState('');
  const { booking } = useRealtimeBooking(bookingId);
  const { messages, loading, sending, sendMessage, sendPhoto } = useChat(bookingId);
  const bottomRef = useRef();
  const fileRef = useRef();

  useEffect(() => {
    servisaku.auth.me().then(setUser);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    const t = text;
    setText('');
    await sendMessage(user.email, user.full_name, user.role || 'consumer', t);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handlePhoto = async (e) => {
    if (!user || !e.target.files[0]) return;
    await sendPhoto(user.email, user.full_name, user.role || 'consumer', e.target.files[0]);
  };

  const otherName = user?.role === 'partner' ? booking?.consumer_name : booking?.partner_name;

  return (
    <div className="flex flex-col h-screen bg-background font-inter lg:max-w-3xl lg:mx-auto lg:border-x lg:border-border">
      {/* Header */}
      <div className="bg-surface border-b border-border px-4 pt-12 lg:pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{otherName?.charAt(0) || '?'}</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">{otherName || 'Chat'}</p>
            <p className="text-[10px] text-muted-foreground">{booking?.service_type}</p>
          </div>
          <button className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <Phone className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => navigate(`/booking/${bookingId}`)}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <Info className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0">
        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center pt-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Send a message to get started</p>
          </div>
        ) : (
          <>
            {/* Date grouping */}
            {messages.map((msg, i) => {
              const showDate = i === 0 || moment(msg.created_date).date() !== moment(messages[i-1].created_date).date();
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex justify-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {moment(msg.created_date).calendar(null, {
                          sameDay: '[Today]', lastDay: '[Yesterday]',
                          lastWeek: 'dddd', sameElse: 'D MMM YYYY',
                        })}
                      </span>
                    </div>
                  )}
                  <MessageBubble msg={msg} myEmail={user?.email} />
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-surface border-t border-border px-4 py-3 pb-safe">
        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 hover:bg-primary/10 transition-colors mb-0.5">
            <Camera className="h-4 w-4 text-muted-foreground" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          <div className="flex-1 bg-muted rounded-2xl flex items-center min-h-[44px]">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 bg-transparent px-4 py-3 text-sm outline-none resize-none max-h-24"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 mb-0.5 disabled:opacity-50 transition-all hover:scale-105"
          >
            <Send className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}