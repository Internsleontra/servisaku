import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Users, Activity, RefreshCw, Eye, MessageSquare, Zap } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useActiveBookings, useOnlinePartners } from '@/hooks/useRealtimeBooking';
import { servisaku } from '@/api/servisakuClient';
import StatusBadge from '../components/StatusBadge';
import { formatRM } from '@/lib/paymentEngine';
import { toast } from 'sonner';
import moment from 'moment';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const onlineIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#14532d;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🔧</div>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
});

const KL = [3.1390, 101.6869];

export default function AdminOperations() {
  const navigate = useNavigate();
  const activeBookings = useActiveBookings();
  const onlinePartners = useOnlinePartners();
  const [tab, setTab] = useState('map');
  const [_tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const disputed = activeBookings.filter(b => b.status === 'disputed');
  const pending = activeBookings.filter(b => b.status === 'pending');
  const onJob = onlinePartners.filter(p => p.is_on_job);
  const idle = onlinePartners.filter(p => !p.is_on_job);

  const handleForceAssign = async (bookingId) => {
    const idlePartner = onlinePartners.find(p => !p.is_on_job);
    if (!idlePartner) { toast.error('No idle partners available'); return; }
    await servisaku.entities.Booking.update(bookingId, {
      partner_email: idlePartner.partner_email,
      partner_name: idlePartner.partner_name,
      status: 'assigned',
    });
    toast.success('Partner auto-assigned');
  };

  const handleEscalate = async (bookingId, consumerEmail) => {
    await servisaku.entities.Notification.create({
      user_email: consumerEmail,
      title: 'Dispute Escalated',
      body: 'Your dispute has been escalated to senior support. We will contact you within 2 hours.',
      type: 'system', channel: 'in_app',
    });
    toast.success('Dispute escalated to senior support');
  };

  return (
    <div className="min-h-screen bg-background font-inter pb-8">
      <div className="bg-primary px-5 pt-14 pb-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate('/admin')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div className="flex-1">
              <p className="text-white/60 text-xs">Admin</p>
              <h1 className="text-xl font-bold text-white">Live Operations</h1>
            </div>
            <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-white text-xs font-medium">Live</span>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Active Jobs', value: activeBookings.length, icon: Activity, alert: false },
              { label: 'Online Partners', value: onlinePartners.length, icon: Users, alert: false },
              { label: 'Pending', value: pending.length, icon: RefreshCw, alert: pending.length > 5 },
              { label: 'Disputed', value: disputed.length, icon: AlertTriangle, alert: disputed.length > 0 },
            ].map((k, i) => (
              <div key={i} className={`rounded-2xl p-2.5 text-center ${k.alert ? 'bg-red-400/30' : 'bg-white/10'}`}>
                <p className="text-white font-bold text-lg">{k.value}</p>
                <p className="text-white/50 text-[9px] leading-tight">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 max-w-4xl mx-auto pt-4 space-y-4">

        {/* Alerts */}
        {disputed.map(b => (
          <div key={b.id} className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Dispute — {b.service_type}</p>
              <p className="text-xs text-red-500">{b.consumer_name} • {moment(b.date).format('D MMM')}</p>
            </div>
            <button onClick={() => handleEscalate(b.id, b.consumer_email)}
              className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-xl font-semibold">
              Escalate
            </button>
          </div>
        ))}

        {/* Tabs */}
        <div className="flex gap-1.5">
          {['map', 'jobs', 'partners'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-primary text-white' : 'bg-surface border border-border text-muted-foreground'}`}>
              {t === 'jobs' ? `Jobs (${activeBookings.length})` : t === 'partners' ? `Partners (${onlinePartners.length})` : 'Live Map'}
            </button>
          ))}
        </div>

        {tab === 'map' && (
          <div className="rounded-3xl overflow-hidden border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]" style={{ height: 380 }}>
            <MapContainer center={KL} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              {onlinePartners.filter(p => p.latitude).map(p => (
                <Marker key={p.id} position={[p.latitude, p.longitude]} icon={onlineIcon}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-bold">{p.partner_name}</p>
                      <p className={p.is_on_job ? 'text-primary' : 'text-emerald-600'}>
                        {p.is_on_job ? 'On Job' : 'Idle'}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {/* Demo markers for UI */}
              {onlinePartners.length === 0 && (
                <Circle center={KL} radius={5000} pathOptions={{ color: '#14532d', fillOpacity: 0.05 }} />
              )}
            </MapContainer>
          </div>
        )}

        {tab === 'jobs' && (
          <div className="space-y-3">
            {activeBookings.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active jobs right now</p>
              </div>
            ) : activeBookings.map(b => (
              <div key={b.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm">{b.service_type}</p>
                    <p className="text-xs text-muted-foreground">{b.consumer_name} • {b.city}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
                  <span>{moment(b.date).format('D MMM')} {b.time_slot}</span>
                  <span>•</span>
                  <span>{b.partner_name || 'Unassigned'}</span>
                  <span>•</span>
                  <span className="font-semibold text-primary">{formatRM(b.price)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/booking/${b.id}`)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-muted rounded-xl font-medium hover:bg-primary/10 transition-colors">
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                  <button onClick={() => navigate(`/chat/${b.id}`)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-muted rounded-xl font-medium hover:bg-primary/10 transition-colors">
                    <MessageSquare className="h-3.5 w-3.5" /> Chat
                  </button>
                  {b.status === 'pending' && (
                    <button onClick={() => handleForceAssign(b.id)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-xl font-semibold hover:bg-primary/20 transition-colors">
                      <Zap className="h-3.5 w-3.5" /> Force Assign
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'partners' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 mb-1">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                <p className="font-bold text-lg text-emerald-700">{onJob.length}</p>
                <p className="text-[10px] text-emerald-600">On Active Job</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
                <p className="font-bold text-lg text-blue-700">{idle.length}</p>
                <p className="text-[10px] text-blue-600">Idle / Available</p>
              </div>
            </div>
            {onlinePartners.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No partners online right now</p>
              </div>
            ) : onlinePartners.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-surface rounded-2xl border border-border p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <div className="relative w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="font-bold text-primary">{p.partner_name?.charAt(0) || '?'}</span>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${p.is_on_job ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{p.partner_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.is_on_job ? '🔧 On Job' : '✅ Available'}
                    {p.city ? ` • ${p.city}` : ''}
                    {p.speed > 0 ? ` • ${p.speed} km/h` : ''}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground">{moment(p.last_seen).fromNow()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}