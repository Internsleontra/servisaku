import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, BookOpen, Award, CheckCircle2, XCircle } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

export default function PartnerTrainingCourse() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { passed, score }

  useEffect(() => {
    servisaku.training.list().then((d) => setCourse(d.courses.find((c) => c.id === courseId) || null));
  }, [courseId]);

  if (course === null) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const done = course.status === 'completed';
  const allAnswered = !course.has_quiz || course.quiz.every((_, i) => answers[i] != null);

  const submit = async () => {
    setSubmitting(true);
    try {
      const ordered = (course.quiz || []).map((_, i) => answers[i] ?? -1);
      const res = await servisaku.training.complete(courseId, course.has_quiz ? ordered : undefined);
      setResult({ passed: res.passed, score: res.score });
      const updated = res.courses?.find((c) => c.id === courseId);
      if (updated) setCourse(updated);
      if (res.passed) toast.success('Course completed 🎉');
      else toast.error(`Score ${res.score}% — you need 70% to pass`);
    } catch (e) {
      toast.error(e.message || 'Could not submit');
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = course.type === 'video' ? PlayCircle : BookOpen;

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <button onClick={() => navigate('/partner/training')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-4">
          <ArrowLeft className="h-4 w-4 text-white" />
        </button>
        <p className="text-white/60 text-xs">{course.category} · {course.duration_min} min</p>
        <h1 className="text-xl font-semibold text-white mt-0.5">{course.title}</h1>
        {done && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/25 px-3 py-1 text-xs font-semibold text-white">
            <Award className="h-3.5 w-3.5" /> Completed{course.score != null ? ` · ${course.score}%` : ''}
          </span>
        )}
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto pt-5 space-y-4">
        {/* Content */}
        {course.type === 'video' && (
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-ink/90 dark:bg-raised text-white">
            <Icon className="h-12 w-12 opacity-80" />
          </div>
        )}
        <Card>
          <p className="text-sm leading-relaxed text-ink">{course.content}</p>
        </Card>

        {/* Quiz */}
        {course.has_quiz && (
          <Card className="space-y-4">
            <p className="text-sm font-semibold text-ink">Assessment <span className="font-normal text-ink-secondary">· pass mark 70%</span></p>
            {course.quiz.map((q, qi) => (
              <div key={qi}>
                <p className="mb-2 text-sm font-medium text-ink">{qi + 1}. {q.q}</p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const selected = answers[qi] === oi;
                    return (
                      <button key={oi} type="button" onClick={() => !done && setAnswers((a) => ({ ...a, [qi]: oi }))}
                        disabled={done}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${selected ? 'border-brand bg-brand-tint text-brand-ink' : 'border-hairline/20 bg-surface text-ink hover:border-brand/30'} ${done ? 'opacity-70' : ''}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand bg-brand' : 'border-hairline/40'}`}>
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Result */}
        {result && !result.passed && (
          <div className="flex items-center gap-2 rounded-xl bg-danger-tint border border-danger/30 px-4 py-3 text-sm text-danger">
            <XCircle className="h-4 w-4 shrink-0" /> Scored {result.score}%. Review the material and try again.
          </div>
        )}

        {done ? (
          <div className="flex items-center gap-2 rounded-xl bg-success-tint border border-success/30 px-4 py-3 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> You’ve completed this course.
          </div>
        ) : (
          <Button onClick={submit} disabled={submitting || !allAnswered}
            className="w-full h-12 rounded-2xl bg-brand text-white font-semibold hover:bg-brand/90">
            {submitting ? 'Submitting…' : course.has_quiz ? 'Submit assessment' : 'Mark as complete'}
          </Button>
        )}
      </div>
    </div>
  );
}
