import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Megaphone, Send, Users,
  Plus, CheckCircle2, RefreshCw,
  Zap, Bell, Mail, MessageSquare, Smartphone
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { sendBroadcast } from '@/lib/notificationEngine';
import { runAllWorkflows } from '@/lib/automationWorkflows';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const CHANNEL_ICONS = { in_app: Bell, email: Mail, sms: MessageSquare, push: Smartphone };
const STATUS_STYLE = {
  draft:      'bg-muted text-muted-foreground border-border',
  scheduled:  'bg-blue-50 text-blue-700 border-blue-100',
  sending:    'bg-amber-50 text-amber-700 border-amber-100',
  sent:       'bg-emerald-50 text-emerald-700 border-emerald-100',
  paused:     'bg-orange-50 text-orange-600 border-orange-100',
  cancelled:  'bg-red-50 text-red-600 border-red-100',
};

const AUDIENCE_LABELS = {
  all: 'All Users', consumers: 'Consumers Only', partners: 'Partners Only',
  inactive_partners: 'Inactive Partners', low_rated_partners: 'Low-Rated Partners', custom: 'Custom',
};

function CampaignForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', type: 'broadcast', target_audience: 'all',
    channels: ['in_app'], subject: '', body: '', body_bm: '',
    cta_url: '', cta_label: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleChannel = (ch) => setForm(f => ({
    ...f, channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch],
  }));

  return (
    <div className="bg-surface rounded-3xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 space-y-4">
      <h3 className="font-bold text-sm">New Campaign</h3>
      <div className="space-y-3">
        <input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="Campaign name" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.type} onChange={e => set('type', e.target.value)}
            className="bg-muted rounded-xl px-3 py-2.5 text-sm outline-none">
            {['broadcast','promotional','service_alert','reminder','reactivation'].map(t => (
              <option key={t} value={t}>{t.replace('_',' ')}</option>
            ))}
          </select>
          <select value={form.target_audience} onChange={e => set('target_audience', e.target.value)}
            className="bg-muted rounded-xl px-3 py-2.5 text-sm outline-none">
            {Object.entries(AUDIENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {/* Channel selector */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Channels</p>
          <div className="flex gap-2">
            {['in_app','email','sms','push'].map(ch => {
              const Icon = CHANNEL_ICONS[ch];
              return (
                <button key={ch} onClick={() => toggleChannel(ch)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    form.channels.includes(ch) ? 'bg-primary text-white border-primary' : 'bg-muted border-border text-muted-foreground'
                  }`}>
                  <Icon className="h-3 w-3" />{ch}
                </button>
              );
            })}
          </div>
        </div>
        <input value={form.subject} onChange={e => set('subject', e.target.value)}
          placeholder="Subject / Title" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none" />
        <textarea value={form.body} onChange={e => set('body', e.target.value)} rows={3}
          placeholder="Message body (English)" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
        <textarea value={form.body_bm} onChange={e => set('body_bm', e.target.value)} rows={2}
          placeholder="Message body (Bahasa Malaysia — optional)" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.cta_url} onChange={e => set('cta_url', e.target.value)}
            placeholder="CTA URL (optional)" className="bg-muted rounded-xl px-3 py-2.5 text-sm outline-none" />
          <input value={form.cta_label} onChange={e => set('cta_label', e.target.value)}
            placeholder="CTA Label" className="bg-muted rounded-xl px-3 py-2.5 text-sm outline-none" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave(form)} className="flex-1 rounded-xl h-10">Save Campaign</Button>
        <Button onClick={onCancel} variant="outline" className="flex-1 rounded-xl h-10">Cancel</Button>
      </div>
    </div>
  );
}

export default function AdminCommunications() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('campaigns');
  const [campaigns, setCampaigns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [workflowResult, setWorkflowResult] = useState(null);
  const [sending, setSending] = useState(null);

  useEffect(() => {
    Promise.all([
      servisaku.entities.Campaign.list('-created_date', 50),
      servisaku.entities.NotificationLog.list('-created_date', 100),
      servisaku.entities.User.list(),
    ]).then(([c, l, u]) => { setCampaigns(c); setLogs(l); setUsers(u); setLoading(false); });
  }, []);

  const handleSaveCampaign = async (form) => {
    if (!form.name || !form.subject || !form.body) { toast.error('Fill in name, subject and body'); return; }
    const created = await servisaku.entities.Campaign.create({ ...form, status: 'draft' });
    setCampaigns(prev => [created, ...prev]);
    setShowForm(false);
    toast.success('Campaign saved');
  };

  const getRecipients = (audience) => {
    if (audience === 'all') return users;
    if (audience === 'consumers') return users.filter(u => u.role === 'consumer' || u.role === 'user');
    if (audience === 'partners') return users.filter(u => u.role === 'partner');
    if (audience === 'inactive_partners') return users.filter(u => u.role === 'partner');
    if (audience === 'low_rated_partners') return users.filter(u => u.role === 'partner' && u.partner_rating < 3.5);
    return users;
  };

  const handleSend = async (campaign) => {
    const recipients = getRecipients(campaign.target_audience);
    if (recipients.length === 0) { toast.error('No recipients for this audience'); return; }
    setSending(campaign.id);
    await servisaku.entities.Campaign.update(campaign.id, { status: 'sending', total_recipients: recipients.length });
    const sent = await sendBroadcast(campaign, recipients);
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'sent', sent_count: sent } : c));
    setSending(null);
    toast.success(`Sent to ${sent} recipients`);
  };

  const handleRunWorkflows = async () => {
    setRunningWorkflow(true);
    const results = await runAllWorkflows();
    setWorkflowResult(results);
    setRunningWorkflow(false);
    toast.success('Automation workflows completed');
  };

  // Delivery analytics
  const _totalSent = logs.filter(l => l.status === 'sent').length;
  const _totalFailed = logs.filter(l => l.status === 'failed').length;
  const byChannel = ['in_app', 'email', 'sms', 'push'].map(ch => ({
    channel: ch,
    count: logs.filter(l => l.channel === ch).length,
    failed: logs.filter(l => l.channel === ch && l.status === 'failed').length,
  }));

  return (
    <div className="min-h-screen bg-background font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-primary px-5 pt-14 pb-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate('/admin')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div className="flex-1">
              <p className="text-white/60 text-xs">Admin</p>
              <h1 className="text-xl font-bold text-white">Communications</h1>
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-colors">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          {/* Delivery stats strip */}
          <div className="grid grid-cols-4 gap-2">
            {byChannel.map(ch => {
              const Icon = CHANNEL_ICONS[ch.channel];
              return (
                <div key={ch.channel} className="bg-white/10 rounded-xl p-2 text-center">
                  <Icon className="h-3.5 w-3.5 text-white/60 mx-auto mb-0.5" />
                  <p className="text-white font-bold text-base">{ch.count}</p>
                  <p className="text-white/40 text-[8px] uppercase">{ch.channel}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-5 max-w-4xl mx-auto pt-4 space-y-4">
        {showForm && <CampaignForm onSave={handleSaveCampaign} onCancel={() => setShowForm(false)} />}

        {/* Automation Engine */}
        <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">Automation Engine</p>
                <p className="text-xs text-muted-foreground">Reminders, escalations, reactivations</p>
              </div>
            </div>
            <Button onClick={handleRunWorkflows} disabled={runningWorkflow}
              className="rounded-xl h-9 text-xs px-4">
              {runningWorkflow
                ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1.5" />Running...</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Run Now</>
              }
            </Button>
          </div>
          {workflowResult && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-emerald-700 font-semibold">{workflowResult.reminders?.sent || 0}</span> <span className="text-muted-foreground">Reminders sent</span></div>
              <div><span className="text-emerald-700 font-semibold">{workflowResult.reviewReminders?.sent || 0}</span> <span className="text-muted-foreground">Review prompts</span></div>
              <div><span className="text-emerald-700 font-semibold">{workflowResult.lateEscalations?.escalated || 0}</span> <span className="text-muted-foreground">Late escalations</span></div>
              <div><span className="text-emerald-700 font-semibold">{workflowResult.inactivePartners?.sent || 0}</span> <span className="text-muted-foreground">Partner nudges</span></div>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {[
              { label: '24h booking reminder', desc: 'Sent to consumers day before booking' },
              { label: '2h booking reminder', desc: 'Sent 2h before scheduled time' },
              { label: 'Review reminder', desc: '1h after job completion' },
              { label: 'Late partner escalation', desc: 'If partner >30min overdue' },
              { label: 'Inactive partner nudge', desc: 'Partners with no jobs in 14 days' },
            ].map(w => (
              <div key={w.label} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{w.label}</p>
                  <p className="text-[10px] text-muted-foreground">{w.desc}</p>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5">
          {['campaigns', 'logs'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-primary text-white' : 'bg-surface border border-border text-muted-foreground'}`}>
              {t === 'campaigns' ? `Campaigns (${campaigns.length})` : `Delivery Logs (${logs.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>
        ) : tab === 'campaigns' ? (
          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-semibold mb-1">No campaigns yet</p>
                <button onClick={() => setShowForm(true)} className="text-xs text-primary font-semibold">+ Create one</button>
              </div>
            ) : campaigns.map(c => (
              <div key={c.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[c.status]}`}>
                        {c.status.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{c.type.replace('_', ' ')}</span>
                    </div>
                    <p className="font-bold text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.subject}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />{AUDIENCE_LABELS[c.target_audience]}
                    {c.target_audience !== 'custom' && ` (${getRecipients(c.target_audience).length})`}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    {c.channels?.map(ch => {
                      const Icon = CHANNEL_ICONS[ch];
                      return <Icon key={ch} className="h-3 w-3" />;
                    })}
                  </span>
                  {c.sent_count > 0 && <><span>•</span><span className="text-emerald-600 font-semibold">{c.sent_count} sent</span></>}
                </div>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{c.body}</p>
                {c.status === 'draft' && (
                  <Button onClick={() => handleSend(c)} disabled={sending === c.id}
                    className="w-full rounded-xl h-9 text-xs">
                    {sending === c.id
                      ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1.5" />Sending...</>
                      : <><Send className="h-3.5 w-3.5 mr-1.5" />Send to {getRecipients(c.target_audience).length} users</>
                    }
                  </Button>
                )}
                {c.status === 'sent' && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Sent {moment(c.sent_at).fromNow()} · {c.sent_count} delivered
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-3xl border border-border overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Event</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Recipient</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Channel</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map(l => (
                    <tr key={l.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-medium max-w-[120px] truncate">{l.event_type}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[120px] truncate">{l.user_email}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1">
                          {CHANNEL_ICONS[l.channel] && (() => { const Icon = CHANNEL_ICONS[l.channel]; return <Icon className="h-3 w-3" />; })()}
                          {l.channel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold ${l.status === 'sent' ? 'text-emerald-600' : l.status === 'failed' ? 'text-red-500' : 'text-amber-600'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{moment(l.created_date).fromNow()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}