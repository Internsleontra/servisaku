import { Camera } from 'lucide-react';
import moment from 'moment';

// Reusable before/after photo grid. Parent owns the upload (UploadFile + persist);
// this just renders the thumbnails (with capture time) and the add tile.
export function PhotoCapture({ photos = [], onFiles, uploading = false, editable = true }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {photos.map((p, i) => (
        <a
          key={i}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative w-20 h-20 rounded-xl overflow-hidden border border-hairline/20"
        >
          <img src={p.url} className="w-full h-full object-cover" alt={`Photo ${i + 1}`} />
          {p.at && (
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[8px] font-medium text-white">
              {moment(p.at).format('h:mm A')}
            </span>
          )}
        </a>
      ))}
      {editable && (
        <label className="flex w-20 h-20 cursor-pointer flex-col items-center justify-center rounded-xl shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-dashed border-hairline/40 bg-raised/30 transition-colors hover:border-brand">
          {uploading
            ? <div className="h-4 w-4 animate-spin rounded-full shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-raised border-t-brand" />
            : <Camera className="h-5 w-5 text-ink-secondary" />}
          <span className="mt-1 text-[9px] text-ink-secondary">Add</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
          />
        </label>
      )}
    </div>
  );
}
