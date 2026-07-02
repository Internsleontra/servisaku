// QuestionRenderer — the heart of the dynamic Step A. Switches UI purely on
// question.type, so a new service is JSON only. RN port of the web renderer.
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Question, QuestionOption } from '@/api/client';
import { rm, optionModifierLabel, tierPriceLabel, unitPriceLabel } from '@/lib/option-price';
import { colors, font, radius, spacing } from '@/theme/tokens';

type AnswerValue = unknown;
interface WidgetProps { question: Question; value: AnswerValue; onChange: (v: AnswerValue) => void }

/* ------------------------------------------------------------- Stepper ---- */

function Stepper({
  value, onChange, min = 0, max = 99, step = 1, suffix,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const v = Number(value) || 0;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const btn = (label: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, color: disabled ? colors.inkTertiary : colors.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, backgroundColor: colors.surface, padding: 2 }}>
      {btn('–', () => onChange(clamp(v - step)), v <= min)}
      <Text style={{ minWidth: 44, textAlign: 'center', fontWeight: '700', color: colors.ink }}>
        {fmt(v)}{suffix ? <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary }}> {suffix}</Text> : null}
      </Text>
      {btn('+', () => onChange(clamp(v + step)), v >= max)}
    </View>
  );
}

/* --------------------------------------------------------------- rows ------ */

function OptionRow({
  label, selected, onPress, right, radioType = 'radio',
}: { label: string; selected: boolean; onPress: () => void; right?: string; radioType?: 'radio' | 'check' }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
        selected ? { borderColor: colors.brand, backgroundColor: colors.brandTint } : { borderColor: colors.hairline, backgroundColor: colors.surface },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={[
          { width: 20, height: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
          { borderRadius: radioType === 'radio' ? 10 : 6 },
          selected ? { borderColor: colors.brand, backgroundColor: colors.brand } : { borderColor: colors.hairline },
        ]}>
          {selected && radioType === 'check' ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text> : null}
        </View>
        <Text style={{ color: colors.ink, fontSize: font.size.base, flex: 1 }}>{label}</Text>
      </View>
      {right ? <Text style={{ fontSize: font.size.sm, fontWeight: '700', color: colors.inkSecondary }}>{right}</Text> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------- widgets ----- */

function SingleSelect({ question, value, onChange }: WidgetProps) {
  return (
    <View>
      {(question.options ?? []).map((o) => (
        <OptionRow key={o.id} label={o.label} selected={value === o.id} onPress={() => onChange(o.id)} right={optionModifierLabel(question, o)} />
      ))}
    </View>
  );
}

function MultiSelect({ question, value, onChange }: WidgetProps) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <View>
      {(question.options ?? []).map((o) => (
        <OptionRow key={o.id} radioType="check" label={o.label} selected={selected.includes(o.id)} onPress={() => toggle(o.id)} right={optionModifierLabel(question, o)} />
      ))}
    </View>
  );
}

function TierSelect({ question, value, onChange }: WidgetProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {(question.options ?? []).map((o) => {
        const selected = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[
              { width: '47%', borderWidth: selected ? 2 : 1, borderRadius: radius.lg, padding: 14 },
              selected ? { borderColor: colors.brand, backgroundColor: colors.brandTint } : { borderColor: colors.hairline, backgroundColor: colors.surface },
            ]}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{o.label}</Text>
            <Text style={{ marginTop: 8, fontWeight: '800', color: colors.brand }}>{tierPriceLabel(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function QuantitySelector({ question, value, onChange }: WidgetProps) {
  const cfg = question.config || {};
  const qty = Number(value) || 0;
  const unit = Number(cfg.pricePerUnit) || 0;
  return (
    <View style={styleRow}>
      <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{unit > 0 ? `${rm(unit)} each` : 'Quantity'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {unit > 0 && qty > 0 ? <Text style={priceTxt}>{rm(unit * qty)}</Text> : null}
        <Stepper value={qty} onChange={(n) => onChange(n)} min={Number(cfg.min) || 0} max={Number(cfg.max) || 99} step={Number(cfg.step) || 1} />
      </View>
    </View>
  );
}

function TierQuantitySelector({ question, value, onChange }: WidgetProps) {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, number>;
  const setQty = (id: string, qty: number) => {
    const next = { ...obj };
    if (qty > 0) next[id] = qty; else delete next[id];
    onChange(next);
  };
  return (
    <View>
      {(question.options ?? []).map((o) => {
        const qty = Number(obj[o.id]) || 0;
        return (
          <View key={o.id} style={styleRow}>
            <View>
              <Text style={{ color: colors.ink }}>{o.label}</Text>
              <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{unitPriceLabel(o)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {qty > 0 ? <Text style={priceTxt}>{rm((o.unit_price || 0) * qty)}</Text> : null}
              <Stepper value={qty} onChange={(q) => setQty(o.id, q)} min={0} max={20} step={1} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AreaInput({ question, value, onChange }: WidgetProps) {
  const cfg = question.config || {};
  const rate = Number(cfg.ratePerSqft) || 0;
  const area = Number(value) || 0;
  const unit = (cfg.unit as string) || 'sqft';
  return (
    <View style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TextInput
          keyboardType="numeric"
          value={value === '' || value === undefined || value === null ? '' : String(value)}
          onChangeText={(t) => onChange(t === '' ? '' : Number(t))}
          placeholder={`Enter area in ${unit}`}
          placeholderTextColor={colors.inkTertiary}
          style={{ flex: 1, fontSize: font.size.lg, fontWeight: '700', color: colors.ink }}
        />
        <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{unit}</Text>
      </View>
      {rate > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 10, paddingTop: 8 }}>
          <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{rm(rate)}/{unit}</Text>
          {area > 0 ? <Text style={priceTxt}>{rm(rate * area)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function HoursInput({ question, value, onChange }: WidgetProps) {
  const cfg = question.config || {};
  const rate = Number(cfg.ratePerHour) || 0;
  const min = Number(cfg.min) || 1;
  const hours = Math.max(Number(value) || 0, 0);
  return (
    <View style={styleRow}>
      <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{rate > 0 ? `${rm(rate)}/hr · min ${min} hr` : 'Hours'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {rate > 0 && hours > 0 ? <Text style={priceTxt}>{rm(rate * Math.max(hours, min))}</Text> : null}
        <Stepper value={(value as number) ?? min} onChange={(n) => onChange(n)} min={min} max={Number(cfg.max) || 12} step={Number(cfg.step) || 0.5} suffix="hr" />
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- render ---- */

const WIDGETS: Record<string, (p: WidgetProps) => React.ReactElement> = {
  TIER_SELECT: TierSelect,
  SINGLE_SELECT: SingleSelect,
  MULTI_SELECT: MultiSelect,
  QUANTITY: QuantitySelector,
  TIER_QUANTITY: TierQuantitySelector,
  AREA_INPUT: AreaInput,
  HOURS_INPUT: HoursInput,
};

export default function QuestionRenderer({ question, value, onChange }: WidgetProps) {
  if (question.type === 'INFO') {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary }}>{question.label}</Text>
        <TextInput
          multiline
          numberOfLines={2}
          value={(value as string) ?? ''}
          onChangeText={onChange}
          placeholder="Optional — helps the technician prepare"
          placeholderTextColor={colors.inkTertiary}
          style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, minHeight: 60, textAlignVertical: 'top' }}
        />
      </View>
    );
  }

  const Widget = WIDGETS[question.type];
  if (!Widget) return null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontWeight: '700', color: colors.ink, fontSize: font.size.base }}>
        {question.label}
        {question.required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {question.help_text ? <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{question.help_text}</Text> : null}
      <Widget question={question} value={value} onChange={onChange} />
    </View>
  );
}

const styleRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  borderWidth: 1,
  borderColor: colors.hairline,
  borderRadius: radius.md,
  backgroundColor: colors.surface,
  paddingHorizontal: 14,
  paddingVertical: 13,
  marginBottom: 8,
};
const priceTxt = { fontWeight: '700' as const, color: colors.brand };
