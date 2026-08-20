import QuestionRenderer from '../QuestionRenderer';
import { useTranslation } from '@/lib/useTranslation';

// Step A — the per-service question set, rendered dynamically from JSON.
export default function StepA({ service, answers, setAnswer }) {
  const { t } = useTranslation();
  const questions = service.questions || [];
  if (!questions.length) {
    return <p className="text-ink-secondary">{t('This service has no extra options — continue to schedule.')}</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {questions.map((q) => (
        <QuestionRenderer
          key={q.id}
          question={q}
          value={answers[q.id]}
          onChange={(v) => setAnswer(q.id, v)}
        />
      ))}
    </div>
  );
}
