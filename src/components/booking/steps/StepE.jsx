import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Field } from '../fields';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/useTranslation';

const MAX_PHOTOS = 5;

// Step E — Notes & Photos (optional). Up to 5 images uploaded to object storage.
export default function StepE({ extras, setExtras }) {
  const { t } = useTranslation();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const photos = extras.photos || [];

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { toast.error(`${t('Maximum')} ${MAX_PHOTOS} ${t('photos')}`); return; }
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files.slice(0, room)) {
        const { file_url } = await servisaku.integrations.Core.UploadFile({ file });
        uploaded.push(file_url);
      }
      setExtras((x) => ({ ...x, photos: [...(x.photos || []), ...uploaded] }));
    } catch {
      toast.error(t('Upload failed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = (url) => setExtras((x) => ({ ...x, photos: (x.photos || []).filter((p) => p !== url) }));

  return (
    <div className="flex flex-col gap-6">
      <Field label={t('Notes for the technician')} hint={t('Describe the issue, gate code, pets, etc.')}>
        <textarea
          rows={4}
          value={extras.notes ?? ''}
          onChange={(e) => setExtras((x) => ({ ...x, notes: e.target.value }))}
          maxLength={2000}
          className="rounded-xl border border-hairline bg-surface px-4 py-3 text-ink outline-none focus:ring-1 focus:ring-brand"
        />
      </Field>

      <Field label={`Photos (${photos.length}/${MAX_PHOTOS})`}>
        <div className="flex flex-wrap gap-3">
          {photos.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl border border-hairline">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                className="absolute right-1 top-1 rounded-full bg-ink/70 p-0.5 text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline text-ink-secondary hover:bg-raised disabled:opacity-50"
            >
              <Camera size={18} />
              <span className="text-xs">{uploading ? '…' : 'Add'}</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
      </Field>
    </div>
  );
}
