import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Phone, MessageSquare, X, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useRealtimeBooking, usePartnerLocation } from '@/hooks/useRealtimeBooking';
import { calcETA, KL_CENTER } from '@/lib/realtimeService';
import 'leaflet/dist/leaflet.css';
import { statusIconFor } from '@/lib/statusIcons';
import { useTranslation } from '@/lib/useTranslation';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* Leaflet divIcons are raw HTML injected outside React, so Lucide components
   cannot be used here. These are the same Lucide glyphs (wrench, house) inlined
   as SVG paths so the markers stay on the design system's icon vocabulary —
   2px stroke, round caps — with no emoji. */
const LUCIDE = { stroke: 'white', fill: 'none', width: 2, linecap: 'round', linejoin: 'round' };
const svg = (paths, size) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
       fill="${LUCIDE.fill}" stroke="${LUCIDE.stroke}" stroke-width="${LUCIDE.width}"
       stroke-linecap="${LUCIDE.linecap}" stroke-linejoin="${LUCIDE.linejoin}">${paths}</svg>`;

const WRENCH = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>';
const HOUSE = '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';

// Partner marker — brand fill, pulsing halo.
const partnerIcon = L.divIcon({
  className: 'transition-transform duration-75 ease-linear',
  html: `
    <div class="relative flex items-center justify-center w-11 h-11">
      <div class="absolute inset-0 bg-brand rounded-full animate-pulse opacity-40"></div>
      <div class="relative z-10 w-11 h-11 bg-brand rounded-full shadow-[0_0_0_3px_white,0_4px_16px_rgba(0,0,238,0.4)] flex items-center justify-center">${svg(WRENCH, 18)}</div>
    </div>
  `,
  iconSize: [44, 44], iconAnchor: [22, 22],
});

// Destination marker — radar ping.
const destIcon = L.divIcon({
  className: '',
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="absolute inset-0 bg-danger rounded-full animate-ping opacity-60"></div>
      <div class="relative z-10 w-9 h-9 bg-danger rounded-full shadow-[0_0_0_2.5px_white,0_4px_12px_rgba(2,2,43,0.25)] flex items-center justify-center">${svg(HOUSE, 16)}</div>
    </div>
  `,
  iconSize: [40, 40], iconAnchor: [20, 20],
});

// Component to recenter the map on the partner
function FlyTo({ center }) {
  const map = useMap();
  const hasFlown = useRef(false);
  useEffect(() => { 
    if (center && !hasFlown.current) {
      map.flyTo(center, 15, { duration: 1.5 }); 
      hasFlown.current = true;
    }
  }, [center]);
  return null;
}

export default function LiveTracking() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { booking, loading } = useRealtimeBooking(bookingId);
  const partnerLoc = usePartnerLocation(booking?.partner_email);
  const [eta, setEta] = useState(null);
  
  // Smooth mock animation state
  const destPos = { lat: KL_CENTER.lat, lng: KL_CENTER.lng };
  const initialPartnerPos = { lat: destPos.lat - 0.015, lng: destPos.lng - 0.012 };
  const [simLoc, setSimLoc] = useState(initialPartnerPos);
  const animationRef = useRef(null);

  // 60FPS Smooth Mock Interpolation
  useEffect(() => {
    if (booking && ['en_route', 'accepted'].includes(booking.status) && !partnerLoc?.latitude) {
      let currentLat = initialPartnerPos.lat;
      let currentLng = initialPartnerPos.lng;
      
      const animate = () => {
        // Move 0.1% closer to the destination each frame
        const latDiff = destPos.lat - currentLat;
        const lngDiff = destPos.lng - currentLng;
        
        // Stop animating if very close
        if (Math.abs(latDiff) > 0.0001 || Math.abs(lngDiff) > 0.0001) {
          currentLat += latDiff * 0.001;
          currentLng += lngDiff * 0.001;
          setSimLoc({ lat: currentLat, lng: currentLng });
        }
        animationRef.current = requestAnimationFrame(animate);
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [booking?.status, partnerLoc?.latitude]);

  const partnerPos = partnerLoc?.latitude
    ? { lat: partnerLoc.latitude, lng: partnerLoc.longitude }
    : simLoc;

  useEffect(() => {
    if (partnerPos) {
      const e = calcETA(partnerPos.lat, partnerPos.lng, destPos.lat, destPos.lng, 40); // slightly faster mock speed
      setEta(e);
    }
  }, [partnerPos]);

  if (loading || !booking) return (
    <div className="h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-hairline border-t-brand rounded-full animate-spin" />
    </div>
  );

  const StatusIcon = statusIconFor(booking.status);

  return (
    <div className="h-screen flex flex-col font-inter relative bg-surface">
      {/* The map is the page; a visible title would cover it. This names the
          route for assistive tech and gives the document its single h1. */}
      <h1 className="sr-only">
        Live tracking — {booking.service_type}{booking.partner_name ? ` with ${booking.partner_name}` : ''}
      </h1>

      {/* Full-screen Map */}
      <div className="flex-1 relative z-0">
        <MapContainer
          center={[KL_CENTER.lat - 0.007, KL_CENTER.lng - 0.006]}
          zoom={14}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {partnerPos && (
            <Marker position={[partnerPos.lat, partnerPos.lng]} icon={partnerIcon}>
              <Popup className="font-inter rounded-xl overflow-hidden font-semibold">{booking.partner_name || 'Partner'}</Popup>
            </Marker>
          )}
          <Marker position={[destPos.lat, destPos.lng]} icon={destIcon}>
            <Popup className="font-inter font-semibold">{t('Your location')}</Popup>
          </Marker>
          {partnerPos && (
            <Polyline
              positions={[[partnerPos.lat, partnerPos.lng], [destPos.lat, destPos.lng]]}
              pathOptions={{ color: 'rgb(var(--brand))', weight: 4, dashArray: '8 8', opacity: 0.8, lineCap: 'round' }}
            />
          )}
          {partnerPos && <FlyTo center={[partnerPos.lat, partnerPos.lng]} />}
        </MapContainer>

        {/* Floating Back Button */}
        <button onClick={() => navigate(`/booking/${bookingId}`)}
          aria-label={t('Close tracking')}
          className="absolute top-5 left-5 z-[1000] w-11 h-11 bg-surface/90 backdrop-blur-md rounded-2xl shadow-e2 flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
          <X className="h-5 w-5 text-ink" />
        </button>

        {/* Dynamic ETA Pill */}
        {eta && booking.status === 'en_route' && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] bg-surface/95 backdrop-blur-md rounded-full px-5 py-2.5 shadow-e2 flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 bg-live rounded-full animate-pulse shadow-[0_0_8px_rgb(var(--live))]" />
            <span className="text-sm font-semibold text-ink tracking-tight">{t('{minutes} min away', { minutes: eta })}</span>
          </div>
        )}
      </div>

      {/* Modern Bottom Sheet Overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-surface rounded-t-sheet shadow-[0_-8px_40px_rgba(4,4,74,0.16)]">
        <div className="w-12 h-1.5 bg-hairline/20 rounded-full mx-auto mt-3.5 mb-5" />

        {/* Live status banner. The glyph comes from the client-only icon map
            (statusIcons.js); bookingEngine.js is server-safe and carries no
            React components. */}
        <div className={`mx-5 mb-5 rounded-2xl p-4 flex items-center gap-3.5 transition-all ${
          booking.status === 'arrived' ? 'bg-brand-tint shadow-[inset_0_0_0_1px_rgb(var(--brand)/0.2)]' :
          booking.status === 'started' ? 'bg-info-tint shadow-[inset_0_0_0_1px_rgb(var(--info)/0.3)]' :
          'bg-warning-tint shadow-[inset_0_0_0_1px_rgb(var(--warning)/0.3)]'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
            {StatusIcon ? <StatusIcon className="size-5 text-ink" /> : null}
          </div>
          <div>
            <p className={`font-semibold text-[15px] leading-tight ${
              booking.status === 'arrived' ? 'text-brand' : booking.status === 'started' ? 'text-info' : 'text-warning'
            }`}>
              {booking.status === 'en_route' && t('Partner on the way • ETA {minutes} min', { minutes: eta || '—' })}
              {booking.status === 'arrived' && t('Partner has arrived!')}
              {booking.status === 'started' && t('Service in progress')}
              {booking.status === 'accepted' && 'Partner preparing to depart'}
            </p>
            <p className="text-xs font-medium text-ink/60 mt-1">{booking.service_type} • {booking.time_slot}</p>
          </div>
        </div>

        {/* Partner Info & Actions */}
        <div className="mx-5 flex items-center gap-3.5 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand-tint flex items-center justify-center shrink-0 shadow-inner">
            <span className="text-2xl font-semibold text-brand">{booking.partner_name?.charAt(0) || '?'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base text-ink truncate">{booking.partner_name || 'Your Partner'}</p>
            <p className="text-xs font-medium text-ink-secondary mt-0.5">
              {partnerLoc?.speed ? `${partnerLoc.speed} km/h` : 'Honda City • VAM 2314'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button aria-label={t('Call your partner')} className="w-12 h-12 rounded-2xl bg-raised flex items-center justify-center hover:bg-brand-tint transition-colors active:scale-95">
              <Phone className="h-5 w-5 text-ink-secondary hover:text-brand transition-colors" />
            </button>
            <button onClick={() => navigate(`/chat/${bookingId}`)}
              aria-label={t('Message your partner')}
              className="w-12 h-12 rounded-2xl bg-ink flex items-center justify-center shadow-e2 active:scale-95 transition-all">
              <MessageSquare className="h-5 w-5 text-ink-inverse" />
            </button>
          </div>
        </div>

        {/* Destination Address */}
        <div className="mx-5 mb-8 flex items-start gap-2.5 p-3 rounded-2xl bg-raised/50">
          <Navigation className="h-4 w-4 mt-0.5 shrink-0 text-brand" />
          <span className="text-xs font-medium leading-relaxed text-ink-secondary">{booking.address}</span>
        </div>
      </div>
    </div>
  );
}