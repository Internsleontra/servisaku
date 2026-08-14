import {
  Clock, UserRound, CalendarCheck, Navigation, MapPin, LoaderCircle,
  CircleCheck, CircleX, TriangleAlert,
} from 'lucide-react';

/**
 * Booking status → Lucide glyph. CLIENT ONLY.
 *
 * This exists because `src/lib/bookingEngine.js` is imported by the Express
 * server (`server/routes/bookings.js` for `canTransition`, `server/routes/
 * catalog.js` for `SLOT_GROUPS`). Holding Lucide components in `STATUS_META`
 * pulled a React icon library into the Node process on boot — backend booking
 * logic must not depend on a frontend package.
 *
 * `bookingEngine.js` now carries only domain data (labels, step order, colour
 * keys, slot times, transitions). Presentation is mapped here, keyed by the
 * same status ids.
 *
 * Do not import this module from anything under `server/`.
 */
export const STATUS_ICON = {
  pending: Clock,
  assigned: UserRound,
  accepted: CalendarCheck,
  en_route: Navigation,
  arrived: MapPin,
  started: LoaderCircle,
  in_progress: LoaderCircle,
  completed: CircleCheck,
  cancelled: CircleX,
  disputed: TriangleAlert,
};

export const statusIconFor = (status) => STATUS_ICON[status] || null;
