// Public surface of the notification subsystem. Import from here:
//   import { notify, notifyConsumer, notifyPartner } from '../lib/notifications/index.js';
import { prisma } from '../../db.js';
import { startScheduler } from './queue.js';
import { releaseScheduled } from './dispatcher.js';

export {
  notify, notifyConsumer, notifyPartner,
  getOrCreatePreference, mapOut, releaseScheduled, shortRef,
} from './dispatcher.js';
export { attachRealtime, emitNotification, emitUnreadCount, emitNotificationUpdate } from './realtime.js';
export { CATALOG, CATEGORIES, PRIORITIES, CHANNELS, renderEvent, isKnownEvent } from './catalog.js';
export { resolveChannels, isDndActive, isCategoryEnabled, DEFAULT_PREFERENCES } from './preferences.js';
export { setQueueAdapter, enqueue } from './queue.js';
export { setPushProvider, isPushReady } from './push.js';

// Start background workers (scheduled-notification poller). Call once at boot.
export function startNotificationWorkers() {
  startScheduler(prisma, releaseScheduled);
}
