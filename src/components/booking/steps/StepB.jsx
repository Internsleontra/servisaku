import { Field, Segmented } from '../fields';
import { useTranslation } from '@/lib/useTranslation';

// Step B — Property & Access. Universal across all services.
export default function StepB({ property, setProperty }) {
  const { t } = useTranslation();
  const set = (k) => (v) => setProperty((p) => ({ ...p, [k]: v }));
  return (
    <div className="flex flex-col gap-6">
      <Field label={t('Property type')} required>
        <Segmented
          options={[{ value: 'residential', label: t('Residential') }, { value: 'commercial', label: t('Commercial') }]}
          value={property.propertyType}
          onChange={set('propertyType')}
        />
      </Field>
      <Field label={t('Building type')} required>
        <Segmented
          options={[
            { value: 'apartment', label: t('Apartment') },
            { value: 'condo', label: t('Condo') },
            { value: 'landed', label: t('Landed House') },
          ]}
          value={property.buildingType}
          onChange={set('buildingType')}
        />
      </Field>
      <Field label={t('Floor number')} hint={t('Ground floor = 0')}>
        <input
          type="number"
          min={0}
          value={property.floor ?? ''}
          onChange={(e) => set('floor')(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-32 rounded-xl border border-hairline bg-surface px-4 py-3 text-ink outline-none focus:ring-1 focus:ring-brand"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('Lift available?')}>
          <Segmented options={[{ value: 'yes', label: t('Yes') }, { value: 'no', label: t('No') }]} value={property.lift} onChange={set('lift')} />
        </Field>
        <Field label={t('Parking available?')}>
          <Segmented options={[{ value: 'yes', label: t('Yes') }, { value: 'no', label: t('No') }]} value={property.parking} onChange={set('parking')} />
        </Field>
      </div>
    </div>
  );
}
