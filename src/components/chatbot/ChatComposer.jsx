import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Mic, Send, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';

/**
 * The composer: text, a photo, and a voice note.
 *
 * Voice transcribes INTO this box as editable text — it never sends. Speech
 * recognition is wrong often enough, and Malaysian code-switching makes it
 * wronger, that auto-sending would put words in someone's mouth in a
 * conversation about money.
 */
export function ChatComposer({
  draft, onDraftChange, onSend, onAttach, onClearAttachment, onTranscribe,
  disabled, busy, attachment, placeholder,
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Grow with the content, up to a point — a composer that swallows the
  // transcript is worse than one that scrolls.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = () => {
    if (!draft.trim() || disabled || busy) return;
    onSend(draft);
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter breaks the line. Reversing this is a reliable way
    // to make people send half a sentence.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const result = await onTranscribe(blob);
        if (!result?.available) setVoiceError(result?.message || 'Voice input is unavailable — please type instead');
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setVoiceError(t('Microphone access was refused — please type instead'));
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const canRecord = typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && navigator.mediaDevices?.getUserMedia;

  return (
    <div className="border-t border-hairline bg-surface p-2">
      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-hairline bg-raised/60 p-2">
          {attachment.previewUrl && (
            <img src={attachment.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
          )}
          {/* dual-field-exempt: the uploaded file's own name */}
          <span className="flex-1 truncate text-xs text-ink-secondary">{attachment.name}</span>
          {attachment.uploading
            ? <Loader2 className="h-4 w-4 animate-spin text-ink-secondary" aria-label={t('Uploading')} />
            : (
              <button type="button" onClick={onClearAttachment} className="text-ink-secondary hover:text-ink" aria-label={t('Remove attachment')}>
                <X className="h-4 w-4" />
              </button>
            )}
        </div>
      )}

      {voiceError && <p className="mb-2 px-1 text-xs text-danger">{voiceError}</p>}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAttach(file);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          aria-label={t('Attach a photo')}
        >
          <ImagePlus className="h-4 w-4" />
        </Button>

        {canRecord && (
          <Button
            type="button"
            size="icon"
            variant={recording ? 'destructive' : 'ghost'}
            className="h-9 w-9 shrink-0"
            disabled={disabled}
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? t('Stop recording') : t('Record a voice note')}
          >
            {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}

        <textarea
          ref={textRef}
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={disabled ? t('This conversation has moved to a support ticket') : (placeholder || t('Ask me anything…'))}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t('Message')}
          className={cn(
            'flex-1 resize-none rounded-2xl border border-hairline bg-surface px-3.5 py-2 text-sm',
            'placeholder:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />

        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          disabled={disabled || busy || !draft.trim()}
          onClick={submit}
          aria-label={t('Send')}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default ChatComposer;
