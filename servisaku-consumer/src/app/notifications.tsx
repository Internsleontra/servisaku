import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Animated, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AppNotification } from '@/api/client';
import { useAuth } from '@/context/auth';
import { EmptyState, Button } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { colors, font, radius, spacing, shadow } from '@/theme/tokens';

// Type → icon + colour + label. Mirrors the consumer website's TYPE_META so the
// mobile notification center reads identically to the web one.
type Meta = { icon: keyof typeof Ionicons.glyphMap; tint: string; fg: string; label: string };
const TYPE_META: Record<string, Meta> = {
  booking_update: { icon: 'book-outline',                tint: '#e0f2fe', fg: '#0284c7', label: 'Booking' },
  payment:        { icon: 'card-outline',                tint: '#d1fae5', fg: '#059669', label: 'Payment' },
  chat:           { icon: 'chatbubble-ellipses-outline', tint: '#ede9fe', fg: '#7c3aed', label: 'Chat' },
  promo:          { icon: 'megaphone-outline',           tint: '#fef3c7', fg: '#d97706', label: 'Promo' },
  system:         { icon: 'settings-outline',            tint: colors.raised, fg: colors.inkSecondary, label: 'System' },
  reminder:       { icon: 'notifications-outline',       tint: '#ffedd5', fg: '#ea580c', label: 'Reminder' },
};
const metaFor = (t?: string) => TYPE_META[t || 'system'] || TYPE_META.system;

const FILTERS = ['all', 'booking_update', 'payment', 'chat', 'promo', 'system', 'reminder'] as const;

// Calendar-style bucket label (Today / Yesterday / weekday / full date) — the RN
// equivalent of moment().calendar() used on the web.
function groupLabel(iso?: string): string {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Where a notification navigates on tap. Expo booking route is /booking/[id];
// the backend emits /bookings/:id, so prefer the explicit booking_id.
function targetFor(n: AppNotification): string | null {
  if (n.booking_id) return `/booking/${n.booking_id}`;
  const url = n.action_url || n.link;
  return url ? url.replace('/bookings/', '/booking/') : null;
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [showFilter, setShowFilter] = useState(false);

  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications('?_limit=100'),
    enabled: !!user,
  });
  const all = q.data ?? [];

  // Optimistic cache helpers.
  const setCache = (fn: (list: AppNotification[]) => AppNotification[]) =>
    qc.setQueryData<AppNotification[]>(['notifications'], (prev) => fn(prev ?? []));

  async function open(n: AppNotification) {
    if (!n.is_read) {
      setCache((l) => l.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api.markNotificationRead(n.id).catch(() => q.refetch());
    }
    const target = targetFor(n);
    if (target) router.push(target as never);
  }
  async function remove(n: AppNotification) {
    setCache((l) => l.filter((x) => x.id !== n.id));
    api.deleteNotification(n.id).catch(() => q.refetch());
  }
  async function markAll() {
    setCache((l) => l.map((x) => ({ ...x, is_read: true })));
    api.markAllNotificationsRead().catch(() => q.refetch());
  }

  const unreadCount = all.filter((n) => !n.is_read).length;
  const readCount = all.length - unreadCount;

  const filtered = useMemo(() => all.filter((n) => {
    if (filter !== 'all' && (n.type || 'system') !== filter) return false;
    if (search) {
      const q2 = search.toLowerCase();
      if (!n.title.toLowerCase().includes(q2) && !(n.body || '').toLowerCase().includes(q2)) return false;
    }
    return true;
  }), [all, filter, search]);

  // Preserve server order (newest first) while bucketing by day.
  const groups = useMemo(() => {
    const out: { label: string; items: AppNotification[] }[] = [];
    for (const n of filtered) {
      const label = groupLabel(n.created_date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [filtered]);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header insets={insets} unreadCount={0} filterActive={false}
          onBack={() => router.back()} onMarkAll={() => {}} onToggleFilter={() => {}} showMarkAll={false} showFilter={false} />
        <EmptyState emoji="🔔" title="Sign in to see notifications"
          action={<Button label="Sign in" onPress={() => router.push('/login')} />} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <Header
        insets={insets}
        unreadCount={unreadCount}
        filterActive={filter !== 'all'}
        showMarkAll={unreadCount > 0}
        showFilter
        onBack={() => router.back()}
        onMarkAll={markAll}
        onToggleFilter={() => setShowFilter((s) => !s)}
      />

      {/* Search + filter pills */}
      <View style={{ backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={15} color={colors.inkTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search notifications…"
            placeholderTextColor={colors.inkTertiary}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.inkTertiary} />
            </Pressable>
          ) : null}
        </View>

        {showFilter ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }}>
            {FILTERS.map((f) => {
              const active = filter === f;
              return (
                <Pressable key={f} onPress={() => setFilter(f)}
                  style={[styles.pill, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                  <Text style={[styles.pillText, active && { color: colors.inkInverse }]}>
                    {f === 'all' ? 'All' : metaFor(f).label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* Body */}
      {q.isLoading ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} />)}
        </ScrollView>
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji="🔔"
          title={search || filter !== 'all' ? 'No matching notifications' : "You're all caught up!"}
          subtitle={search || filter !== 'all' ? 'Try adjusting your search or filter' : 'New notifications will appear here'}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 32, gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={q.refetch} tintColor={colors.brand} />}
          showsVerticalScrollIndicator={false}>
          {groups.map((g) => (
            <View key={g.label} style={{ gap: 8 }}>
              <Text style={styles.groupLabel}>{g.label}</Text>
              <View style={styles.groupCard}>
                {g.items.map((n, idx) => (
                  <NotifItem key={n.id} n={n} last={idx === g.items.length - 1} onOpen={open} onDelete={remove} />
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.footer}>
            {all.length} total · {unreadCount} unread · {readCount} read
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ header --- */
function Header({
  insets, unreadCount, filterActive, showMarkAll, showFilter, onBack, onMarkAll, onToggleFilter,
}: {
  insets: { top: number };
  unreadCount: number;
  filterActive: boolean;
  showMarkAll: boolean;
  showFilter: boolean;
  onBack: () => void;
  onMarkAll: () => void;
  onToggleFilter: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? <Text style={styles.headerSub}>{unreadCount} unread</Text> : null}
      </View>
      {showMarkAll ? (
        <Pressable onPress={onMarkAll} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="checkmark-done" size={20} color={colors.brand} />
        </Pressable>
      ) : null}
      {showFilter ? (
        <Pressable onPress={onToggleFilter} hitSlop={8}
          style={[styles.iconBtn, filterActive && { backgroundColor: colors.brand }]}>
          <Ionicons name="options-outline" size={19} color={filterActive ? colors.inkInverse : colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------- item --- */
function NotifItem({
  n, last, onOpen, onDelete,
}: {
  n: AppNotification;
  last: boolean;
  onOpen: (n: AppNotification) => void;
  onDelete: (n: AppNotification) => void;
}) {
  const meta = metaFor(n.type);
  return (
    <Pressable
      onPress={() => onOpen(n)}
      style={({ pressed }) => [
        styles.item,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.hairline },
        !n.is_read && { backgroundColor: colors.brandTint },
        pressed && { backgroundColor: colors.raised },
      ]}>
      <View style={[styles.iconTile, { backgroundColor: meta.tint }]}>
        {n.icon ? <Text style={{ fontSize: 17 }}>{n.icon}</Text> : <Ionicons name={meta.icon} size={17} color={meta.fg} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <Text numberOfLines={1} style={[styles.itemTitle, { fontWeight: n.is_read ? '500' : '800' }]}>{n.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <Text style={styles.itemTime}>{relativeTime(n.created_date)}</Text>
            {!n.is_read ? <View style={styles.unreadDot} /> : null}
          </View>
        </View>
        {n.body ? <Text numberOfLines={2} style={styles.itemBody}>{n.body}</Text> : null}
        <View style={[styles.typeBadge, { backgroundColor: meta.tint }]}>
          <Text style={[styles.typeBadgeText, { color: meta.fg }]}>{meta.label}</Text>
        </View>
      </View>
      <Pressable onPress={() => onDelete(n)} hitSlop={8} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={15} color={colors.inkTertiary} />
      </Pressable>
    </Pressable>
  );
}

/* -------------------------------------------------------------- skeleton --- */
function Skeleton() {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const bar = (w: ViewStyle['width']): ViewStyle => ({ height: 12, borderRadius: 999, backgroundColor: colors.raised, width: w });
  return (
    <Animated.View style={[styles.groupCard, { flexDirection: 'row', gap: 12, padding: spacing.md, opacity: pulse }]}>
      <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.raised }} />
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        <View style={bar('60%')} />
        <View style={bar('100%')} />
        <View style={bar('40%')} />
      </View>
    </Animated.View>
  );
}

/* --------------------------------------------------------------- styles ---- */
const styles = {
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: spacing.md, paddingBottom: 10,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  } as ViewStyle,
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  headerTitle: { fontSize: font.size.lg, fontWeight: '800', color: colors.ink },
  headerSub: { fontSize: font.size.xs, fontWeight: '700', color: colors.brand, marginTop: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 40,
    backgroundColor: colors.raised, borderRadius: radius.md, paddingHorizontal: 12, marginTop: 10,
  } as ViewStyle,
  searchInput: { flex: 1, fontSize: font.size.sm, color: colors.ink, paddingVertical: 0 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pillText: { fontSize: font.size.xs, fontWeight: '700', color: colors.inkSecondary },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.inkTertiary, textTransform: 'uppercase', paddingHorizontal: 2 },
  groupCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', ...shadow.e1 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14 } as ViewStyle,
  iconTile: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 1 } as ViewStyle,
  itemTitle: { flex: 1, fontSize: font.size.sm, color: colors.ink, lineHeight: 18 },
  itemTime: { fontSize: 10, color: colors.inkTertiary },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  itemBody: { fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 3, lineHeight: 17 },
  typeBadge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  typeBadgeText: { fontSize: 9, fontWeight: '800' },
  deleteBtn: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginTop: 1 } as ViewStyle,
  footer: { textAlign: 'center', fontSize: 10, color: colors.inkTertiary, marginTop: 4 },
} as const;
