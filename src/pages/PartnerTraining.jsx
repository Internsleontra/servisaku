import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, BookOpen, Award, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { SectionHeader } from '@/components/partner/SectionHeader';
import moment from 'moment';

function Card({ children, className = '', onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return <Comp onClick={onClick} className={`block w-full text-left bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${onClick ? 'hover:shadow-e2 transition-all' : ''} ${className}`}>{children}</Comp>;
}

export default function PartnerTraining() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => { servisaku.training.list().then(setData); }, []);

  if (!data) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const categories = [...new Set(data.courses.map((c) => c.category))];

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div>
            <p className="text-white/60 text-xs">Training Center</p>
            <h1 className="text-xl font-semibold text-white">Learn & get certified</h1>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/70 text-xs font-medium">{data.completed} of {data.total} courses completed</p>
            <span className="text-white font-semibold text-sm">{data.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-surface transition-all" style={{ width: `${data.progress}%` }} />
          </div>
          <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${data.certified ? 'bg-success/20 text-white' : 'bg-white/10 text-white/80'}`}>
            <Award className="h-4 w-4" />
            {data.certified
              ? 'Certified — all mandatory training complete'
              : `Complete ${data.mandatory_total - data.mandatory_completed} mandatory course(s) to get certified`}
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto pt-5 space-y-5">
        {categories.map((cat) => (
          <div key={cat} className="space-y-3">
            <SectionHeader title={cat} />
            {data.courses.filter((c) => c.category === cat).map((c) => {
              const done = c.status === 'completed';
              const Icon = c.type === 'video' ? PlayCircle : BookOpen;
              return (
                <Card key={c.id} onClick={() => navigate(`/partner/training/${c.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-success-tint text-success' : 'bg-brand-tint text-brand'}`}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-ink truncate">{c.title}</p>
                        {c.mandatory && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-brand">Required</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-secondary line-clamp-1">{c.summary}</p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-tertiary">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.duration_min} min</span>
                        {done && c.score != null && <span className="font-semibold text-success">Scored {c.score}%</span>}
                        {done && c.completed_at && <span>{moment(c.completed_at).format('D MMM')}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
