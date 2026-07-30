import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import moment from 'moment';
import { toast } from 'sonner';

export default function PartnerCalendar() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(moment().startOf('month'));
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await servisaku.auth.me();
        // Fetch all jobs for this partner (not cancelled/rejected)
        const allJobs = await servisaku.entities.Booking.filter({ partner_email: me.email }, '-date', 200);
        setJobs(allJobs.filter(j => j.status !== 'cancelled' && j.status !== 'rejected'));
      } catch (err) {
        // Without this the spinner span forever on any failure, with nothing on
        // screen to say why — the page just looked permanently broken.
        console.error('[PartnerCalendar] failed to load jobs:', err);
        toast.error(err?.message || 'Could not load your calendar');
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const daysInMonth = currentMonth.daysInMonth();
  const firstDayOfWeek = currentMonth.day(); // 0 is Sunday
  
  const calendarDays = [];
  // Add empty slots for the days before the 1st
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  // Add actual days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(moment(currentMonth).date(i).format('YYYY-MM-DD'));
  }

  const prevMonth = () => setCurrentMonth(moment(currentMonth).subtract(1, 'month'));
  const nextMonth = () => setCurrentMonth(moment(currentMonth).add(1, 'month'));

  const jobsOnSelectedDate = jobs.filter(j => j.date === selectedDate);
  
  const handleBlockDate = () => {
    toast.success(`Date ${moment(selectedDate).format('D MMM')} is now blocked`);
    // In a real implementation, we would create a blocked record here.
  };

  return (
    <div className="min-h-screen bg-bg font-inter pb-8">
      <div className="bg-surface border-b border-hairline/10 px-5 pt-14 pb-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-raised flex items-center justify-center shrink-0">
          <ArrowLeft className="h-5 w-5 text-ink" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-ink">My Calendar</h1>
          <p className="text-ink-secondary text-xs">Manage your availability</p>
        </div>
      </div>

      <div className="px-5 mt-6 max-w-xl mx-auto space-y-6">
        
        {/* Calendar Card */}
        <div className="bg-surface border border-hairline/10 rounded-3xl p-5 shadow-e1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">{currentMonth.format('MMMM YYYY')}</h2>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-raised flex items-center justify-center hover:bg-brand-tint transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full bg-raised flex items-center justify-center hover:bg-brand-tint transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-ink-secondary uppercase">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} />;
              
              const isSelected = date === selectedDate;
              const isToday = date === moment().format('YYYY-MM-DD');
              const dayJobs = jobs.filter(j => j.date === date);
              
              return (
                <button 
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`
                    h-10 rounded-full flex flex-col items-center justify-center relative transition-all
                    ${isSelected ? 'bg-brand text-white shadow-e2' : 'hover:bg-brand-tint hover:text-brand'}
                    ${isToday && !isSelected ? 'text-brand font-bold bg-brand-tint/50' : ''}
                  `}
                >
                  <span className="text-sm font-medium">{moment(date).date()}</span>
                  {dayJobs.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {dayJobs.slice(0, 3).map((_, i) => (
                        <div key={i} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-surface' : 'bg-brand'}`} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Details */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-ink">
              {moment(selectedDate).format('dddd, D MMMM')}
            </h3>
            <button 
              onClick={handleBlockDate}
              className="px-3 py-1.5 rounded-lg bg-raised text-ink font-semibold text-xs hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              Block Date
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" />
            </div>
          ) : jobsOnSelectedDate.length === 0 ? (
            <div className="text-center py-12 bg-surface rounded-3xl border border-hairline/10 shadow-e1">
              <p className="text-sm text-ink-secondary">No jobs scheduled for this day</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobsOnSelectedDate.map(job => (
                <div key={job.id} onClick={() => navigate(`/partner/job/${job.id}`)} className="bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 cursor-pointer hover:shadow-e2 transition-all flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand-tint flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-6 w-6 text-brand" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-ink">{job.service_type}</p>
                    <p className="text-xs text-ink-secondary mt-0.5">{job.time_slot} • {job.city}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${job.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-brand-tint text-brand'}`}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
