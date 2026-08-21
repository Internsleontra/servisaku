// QuestionRenderer — the heart of the dynamic Step A. Switches UI purely on
// question.type, so a new service is JSON only: no new frontend code.
import TierSelect from './widgets/TierSelect';
import SingleSelect from './widgets/SingleSelect';
import MultiSelect from './widgets/MultiSelect';
import QuantitySelector from './widgets/QuantitySelector';
import TierQuantitySelector from './widgets/TierQuantitySelector';
import AreaInput from './widgets/AreaInput';
import HoursInput from './widgets/HoursInput';
import { useTranslation } from '@/lib/useTranslation';

const WIDGETS = {
  TIER_SELECT: TierSelect,
  SINGLE_SELECT: SingleSelect,
  MULTI_SELECT: MultiSelect,
  QUANTITY: QuantitySelector,
  TIER_QUANTITY: TierQuantitySelector,
  AREA_INPUT: AreaInput,
  HOURS_INPUT: HoursInput,
};

export default function QuestionRenderer({ question, value, onChange }) {
  // tField, not t: the label is API data with a `label_my` sibling, not a
  // dictionary key. The server already validates against the Malay label, so
  // rendering the English one made the form and its own error disagree.
  const { t, tField } = useTranslation();
  // INFO — non-priced context for the technician (reference photo notes, last
  // service date, injury area…). Captured into answers but ignored by pricing.
  if (question.type === 'INFO') {
    return (
      <div className="flex flex-col gap-2">
        {/* htmlFor/id pair — this label was unassociated, so assistive tech
            announced the textarea unnamed. */}
        <label htmlFor={`q-${question.id}`} className="text-caption font-medium text-ink-secondary">
          {tField(question, 'label')}
        </label>
        <textarea
          id={`q-${question.id}`}
          rows={2}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('Optional — helps the technician prepare')}
          className="rounded-field bg-surface px-4 py-3 text-ink outline-none shadow-[inset_0_0_0_1px_rgb(var(--hairline))] focus:shadow-[inset_0_0_0_1.5px_rgb(var(--brand))]"
        />
      </div>
    );
  }

  const Widget = WIDGETS[question.type];
  if (!Widget) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Widgets are groups of controls (radios, steppers, multi-selects) with
          no single input to target, so the label names a role="group". */}
      <label id={`q-${question.id}-label`} className="font-semibold text-ink">
        {tField(question, 'label')}
        {question.required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
        {question.required && <span className="sr-only"> {t('(required)')}</span>}
      </label>
      <div role="group" aria-labelledby={`q-${question.id}-label`}>
        <Widget question={question} value={value} onChange={onChange} />
      </div>
    </div>
  );
}
