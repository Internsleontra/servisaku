import { useState, useEffect, useRef } from 'react';
import { servisaku } from '@/api/servisakuClient';

export function useChat(bookingId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimers = useRef({});

  useEffect(() => {
    if (!bookingId) return;
    servisaku.entities.ChatMessage.filter({ booking_id: bookingId }, 'created_date', 100)
      .then(msgs => { setMessages(msgs); setLoading(false); });

    const unsub = servisaku.entities.ChatMessage.subscribe(event => {
      if (event.data?.booking_id !== bookingId) return;
      if (event.type === 'create') {
        setMessages(prev => {
          if (prev.find(m => m.id === event.id)) return prev;
          return [...prev, event.data];
        });
        // Mark as read if not own message
        if (!event.data.is_read) {
          servisaku.entities.ChatMessage.update(event.id, {
            is_read: true, read_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    });
    return unsub;
  }, [bookingId]);

  const sendMessage = async (senderEmail, senderName, senderRole, text, fileUrl = null) => {
    if (!text.trim() && !fileUrl) return;
    setSending(true);
    const optimistic = {
      id: `temp-${Date.now()}`, booking_id: bookingId,
      sender_email: senderEmail, sender_name: senderName,
      sender_role: senderRole, message: text,
      message_type: fileUrl ? 'image' : 'text',
      file_url: fileUrl, is_read: false,
      created_date: new Date().toISOString(), _optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);

    const saved = await servisaku.entities.ChatMessage.create({
      booking_id: bookingId, sender_email: senderEmail,
      sender_name: senderName, sender_role: senderRole,
      message: text, message_type: fileUrl ? 'image' : 'text',
      file_url: fileUrl, is_read: false,
    });
    setMessages(prev => prev.map(m => m.id === optimistic.id ? saved : m));
    setSending(false);
    return saved;
  };

  const sendPhoto = async (senderEmail, senderName, senderRole, file) => {
    setSending(true);
    const { file_url } = await servisaku.integrations.Core.UploadFile({ file });
    await sendMessage(senderEmail, senderName, senderRole, 'Photo', file_url);
    setSending(false);
  };

  const unreadCount = messages.filter(m => !m.is_read).length;

  return { messages, loading, sending, sendMessage, sendPhoto, unreadCount, typingUsers };
}