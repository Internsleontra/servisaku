import { Field, TextField } from '../fields';
import { MapPin } from 'lucide-react';

// Step D — Address & Contact. Saved-address shortcut + manual entry. A real
// map picker (react-leaflet) can replace the pin button later.
export default function StepD({ address, setAddress, savedCity }) {
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

      <Field label="Address line" required>
        <TextField value={address.addressLine} onChange={set('addressLine')} placeholder="Street, building, area" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Unit number">
          <TextField value={address.unitNumber} onChange={set('unitNumber')} placeholder="e.g. A-12-3" />
        </Field>
        <Field label="City">
          <TextField value={address.city} onChange={set('city')} placeholder="City" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact person" required>
          <TextField value={address.contactPerson} onChange={set('contactPerson')} placeholder="Name" />
        </Field>
        <Field label="Contact phone" required>
          <TextField value={address.contactPhone} onChange={set('contactPhone')} type="tel" placeholder="01x-xxxxxxx" />
        </Field>
      </div>
    </div>
  );
}
