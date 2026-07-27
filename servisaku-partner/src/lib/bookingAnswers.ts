import type { Question, PriceLine } from '@/api/client';

export interface AnswerRow { id: string; label: string; value: string }

const FEE_TYPES = new Set(['BASE', 'VISIT_FEE', 'SURCHARGE', 'PLATFORM_FEE', 'FEE', 'ADDON']);

// Turn a dynamic booking's stored answers into human-readable rows using the
// service's question config. Mirrors the web src/lib/bookingAnswers.js.
export function summarizeAnswers(questions: Question[] | undefined, answers: Record<string, unknown> | undefined): AnswerRow[] {
  if (!questions || !answers) return [];
  const rows: AnswerRow[] = [];

  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined || a === null || a === '') continue;
    const optLabel = (id: unknown) => q.options?.find((o) => o.id === id)?.label ?? String(id);
    let value: string;

    switch (q.type) {
      case 'TIER_SELECT':
      case 'SINGLE_SELECT':
        value = optLabel(a);
        break;
      case 'MULTI_SELECT':
        if (!Array.isArray(a) || a.length === 0) continue;
        value = a.map(optLabel).join(', ');
        break;
      case 'TIER_QUANTITY': {
        const obj = a as Record<string, unknown>;
        const parts = Object.entries(obj)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([id, qty]) => `${optLabel(id)} × ${qty}`);
        if (!parts.length) continue;
        value = parts.join(', ');
        break;
      }
      case 'QUANTITY': {
        const n = Number(a);
        if (!n) continue;
        value = `${n}${q.config?.unit ? ` ${q.config.unit}` : ''}`;
        break;
      }
      case 'AREA_INPUT': {
        const n = Number(a);
        if (!n) continue;
        value = `${n} ${q.config?.unit || 'sqft'}`;
        break;
      }
      case 'HOURS_INPUT': {
        const n = Number(a);
        if (!n) continue;
        value = `${n} hour${n === 1 ? '' : 's'}`;
        break;
      }
      case 'INFO':
        value = String(a);
        break;
      default:
        value = typeof a === 'object' ? JSON.stringify(a) : String(a);
    }
    rows.push({ id: q.id, label: q.label, value });
  }
  return rows;
}

// Fallback for legacy bookings without a question config: derive from priced lines.
export function answersFromBreakdown(breakdown: PriceLine[] | null | undefined): AnswerRow[] {
  if (!Array.isArray(breakdown)) return [];
  return breakdown
    .filter((l) => l.questionId && !FEE_TYPES.has(l.type ?? ''))
    .map((l) => ({
      id: l.questionId as string,
      label: l.label,
      value: l.optionLabel || (l.qty != null ? `× ${l.qty}` : '—'),
    }));
}
