import { useState, useEffect } from 'react';
import { servisaku } from '@/api/servisakuClient';
import { Search, RefreshCw, AlertTriangle } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { STATUS_TRANSITIONS, formatBookingRef } from '@/lib/bookingEngine';
import { toast } from 'sonner';
import moment from 'moment';

const STATUS_FILTERS = ['all', 'pending', 'assigned', 'accepted', 'en_route', 'started', 'completed', 'cancelled', 'disputed'];

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [reassigning, setReassigning] = useState(null);

  useEffect(() => {
    load();
    // Subscribe to real-time booking changes
    const unsub = servisaku.entities.Booking.subscribe(event => {
      if (event.type === 'create') setBookings(prev => [event.data, ...prev]);
      else if (event.type === 'update') setBookings(prev => prev.map(b => b.id === event.id ? event.data : b));
      else if (event.type === 'delete') setBookings(prev => prev.filter(b => b.id !== event.id));
    });
    return unsub;
  }, []);

  const load = async () => {
    setLoading(true);
    const [b, u] = await Promise.all([
      servisaku.entities.Booking.list('-created_date', 200),
      servisaku.entities.User.filter({ role: 'partner' }),
    ]);
    setBookings(b);
    setUsers(u);
    setLoading(false);
  };

  const filtered = bookings.filter(b => {
    const matchStatus = filter === 'all' || b.status === filter;
    const matchQuery = !query || b.service_type?.toLowerCase().includes(query.toLowerCase()) ||
      b.consumer_name?.toLowerCase().includes(query.toLowerCase()) ||
      b.city?.toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  const handleStatusChange = async (bookingId, newStatus) => {
    await servisaku.entities.Booking.update(bookingId, { status: newStatus });
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    toast.success(`Booking status → ${newStatus}`);
  };

  const handleReassign = async (bookingId, partnerEmail, partnerName) => {
    await servisaku.entities.Booking.update(bookingId, {
      partner_email: partnerEmail,
      partner_name: partnerName,
      status: 'assigned',
    });
    setBookings(prev => prev.map(b => b.id === bookingId
      ? { ...b, partner_email: partnerEmail, partner_name: partnerName, status: 'assigned' }
      : b
    ));
    setReassigning(null);
    toast.success('Partner reassigned!');
  };

  const counts = {
    pending: bookings.filter(b => b.status === 'pending').length,
    active: bookings.filter(b => ['assigned', 'accepted', 'en_route', 'arrived', 'started'].includes(b.status)).length,
    disputed: bookings.filter(b => b.status === 'disputed').length,
    today: bookings.filter(b => b.date === moment().format('YYYY-MM-DD')).length,
  };

  const verifiedPartners = users.filter(u => u.partner_verified);

  return (
    <div className="min-h-screen bg-background font-inter pb-8">
      <div className="bg-primary px-5 pt-14 pb-5">
        <div className="max-w-5xl mx-auto">
          <p className="text-white/60 text-xs">Admin</p>
          <h1 className="text-xl font-bold text-white">Live Bookings</h1>

          {/* Alert Banner */}
          {counts.disputed > 0 && (
            <div className="mt-3 bg-white/10 rounded-2xl p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <p className="text-white/80 text-xs font-medium">{counts.disputed} booking{counts.disputed > 1 ? 's' : ''} under dispute — requires review</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 max-w-5xl mx-auto">
        {/* KPI Strips */}
        <div className="grid grid-cols-4 gap-2 -mt-3 mb-5">
          {[
            { label: 'Pending', value: counts.pending, color: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Active', value: counts.active, color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Today', value: counts.today, color: 'bg-primary/10 border-primary/20 text-primary' },
            { label: 'Disputed', value: counts.disputed, color: 'bg-red-50 border-red-200 text-red-700' },
          ].map((k, i) => (
            <div key={i} className={`border rounded-2xl p-3 text-center bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${k.color}`}>
              <p className="text-lg font-bold">{k.value}</p>
              <p className="text-[10px] font-medium">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Search + Refresh */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bookings..."
              className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none" />
          </div>
          <button onClick={load} className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center hover:bg-muted transition-colors">
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${filter === s ? 'bg-primary text-white' : 'bg-surface border border-border text-muted-foreground'}`}>
              {s === 'all' ? `All (${bookings.length})` : s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {filtered.map(b => (
              <div key={b.id} className="bg-surface rounded-3xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                <button className="w-full text-left px-4 py-3.5" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{b.service_type}</p>
                      <StatusBadge status={b.status} />
                    </div>
                    <span className="font-bold text-primary text-sm">RM{b.price || 0}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{b.consumer_name || b.consumer_email}</span>
                    <span>•</span>
                    <span>{moment(b.date).format('D MMM')} {b.time_slot}</span>
                    <span>•</span>
                    <span>{b.city}</span>
                  </div>
                </button>

                {expanded === b.id && (
                  <div className="border-t border-border px-4 pb-4 pt-3 bg-muted/30 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><p className="text-muted-foreground">Booking Ref</p><p className="font-mono font-medium">{formatBookingRef(b.id)}</p></div>
                      <div><p className="text-muted-foreground">Payment</p><p className="font-medium capitalize">{b.payment_status || 'pending'}</p></div>
                      <div><p className="text-muted-foreground">Partner</p><p className="font-medium">{b.partner_name || 'Unassigned'}</p></div>
                      <div><p className="text-muted-foreground">Address</p><p className="font-medium truncate">{b.address}</p></div>
                    </div>

                    {/* Override Status */}
                    <div>
                      <p className="text-xs font-bold mb-1.5">Override Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_TRANSITIONS[b.status]?.map(nextStatus => (
                          <button key={nextStatus} onClick={() => handleStatusChange(b.id, nextStatus)}
                            className="text-[11px] px-3 py-1.5 bg-surface border border-border rounded-xl font-medium hover:border-primary hover:text-primary transition-all">
                            → {nextStatus.replace('_', ' ')}
                          </button>
                        ))}
                        {!['cancelled', 'completed'].includes(b.status) && (
                          <button onClick={() => handleStatusChange(b.id, 'cancelled')}
                            className="text-[11px] px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-all">
                            Cancel
                          </button>
                        )}
                        {b.status === 'completed' && (
                          <button onClick={() => handleStatusChange(b.id, 'disputed')}
                            className="text-[11px] px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-600 rounded-xl font-medium">
                            Mark Disputed
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reassign Partner */}
                    {!['completed', 'cancelled'].includes(b.status) && (
                      <div>
                        <p className="text-xs font-bold mb-1.5">Reassign Partner</p>
                        {reassigning === b.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto">
                              {verifiedPartners.map(p => (
                                <button key={p.id} onClick={() => handleReassign(b.id, p.email, p.full_name)}
                                  className="flex items-center gap-2 text-xs px-3 py-2 bg-surface rounded-xl border border-border hover:border-primary transition-all text-left">
                                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-[10px] font-bold text-primary">{p.full_name?.charAt(0)}</span>
                                  </div>
                                  <span className="font-medium">{p.full_name}</span>
                                  <span className="text-muted-foreground ml-auto">{p.city}</span>
                                </button>
                              ))}
                            </div>
                            <button onClick={() => setReassigning(null)} className="text-xs text-muted-foreground">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setReassigning(b.id)}
                            className="text-[11px] px-3 py-1.5 bg-surface border border-border rounded-xl font-medium hover:border-primary hover:text-primary transition-all">
                            Reassign Partner
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                <p className="text-sm text-muted-foreground">No bookings found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}