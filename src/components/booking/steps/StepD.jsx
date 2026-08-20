import { Field, TextField } from '../fields';
import { useTranslation } from '@/lib/useTranslation';
import { MapPin } from 'lucide-react';

// Step D — Address & Contact. Saved-address shortcut + manual entry. A real
// map picker (react-leaflet) can replace the pin button later.
export default function StepD({ address, setAddress, savedCity }) {
  const { t } = useTranslation();
  const set = (k) => (v) => setAddress((a) => ({ ...a, [k]: v }));

  return (
    <div className="flex flex-col gap-6">
      {savedCity && !address.addressLine && (
        <button
          type="button"
          onClick={() => set('city')(savedCity)}
          className="self-start rounded-xl border border-hairline bg-raised px-4 py-2 text-sm text-ink hover:bg-surface"
        >
          <MapPin className="inline size-4 mr-1" /> Use my saved city ({savedCity})
        </button>
      )}

      <Field label={t('Address line')} required>
        <TextField value={address.addressLine} onChange={set('addressLine')} placeholder={t('Street, building, area')} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('Unit number')}>
          <TextField value={address.unitNumber} onChange={set('unitNumber')} placeholder={t('e.g. A-12-3')} />
        </Field>
        <Field label={t('City')}>
          <TextField value={address.city} onChange={set('city')} placeholder={t('City')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('Contact person')} required>
          <TextField value={address.contactPerson} onChange={set('contactPerson')} placeholder={t('Name')} />
        </Field>
        <Field label={t('Contact phone')} required>
          <TextField value={address.contactPhone} onChange={set('contactPhone')} type="tel" placeholder="01x-xxxxxxx" />
        </Field>
      </div>
    </div>
  );
}
