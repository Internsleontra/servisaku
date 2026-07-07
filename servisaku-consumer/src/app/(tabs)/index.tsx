import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/context/auth';
import { CategoryTile, ServiceCardTall } from '@/components/cards';
import Reels from '@/components/Reels';
import { HERO_IMAGE, LOGO_IMAGE } from '@/lib/images';
import { Loading, Muted } from '@/components/ui';
import { CITIES } from '@/lib/booking-meta';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

const POPULAR_SLUGS = ['full-house-cleaning', 'ac-servicing', 'tap-repair-replacement', 'interior-painting', 'fan-installation', 'cockroach-control'];
const STEPS = [
  { icon: '✨', label: 'Pick a service', sub: 'Curated packages' },
  { icon: '📅', label: 'Choose time', sub: 'Today or later' },
  { icon: '✅', label: 'Meet your pro', sub: 'Verified partner' },
  { icon: '💳', label: 'Pay safely', sub: 'Card, FPX, e-wallet' },
];
const PROMOS = [
  { icon: '🎟️', title: 'WELCOME20 for first bookings', body: 'Get 20% off any service across Klang Valley, capped at RM50.', bg: '#fff7ed', bd: '#fed7aa' },
  { icon: '⏱️', title: 'Same-day home care', body: 'Book cleaning, AC, plumbing and electrical slots morning to evening.', bg: '#eff6ff', bd: '#bfdbfe' },
  { icon: '💳', title: 'Local payment options', body: 'Pay by card, FPX, Touch n Go, GrabPay or secure in-app wallet.', bg: '#ecfdf5', bd: '#a7f3d0' },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const services = useQuery({ queryKey: ['services'], queryFn: api.services });

  const popular = (() => {
    const all = services.data ?? [];
    if (!all.length) return [];
    const bySlug = Object.fromEntries(all.map((s) => [s.slug, s]));
    const picked = POPULAR_SLUGS.map((sl) => bySlug[sl]).filter(Boolean);
    const rest = all.filter((s) => !POPULAR_SLUGS.includes(s.slug));
    return [...picked, ...rest].slice(0, 12);
  })();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      stickyHeaderIndices={[0]}
      showsVerticalScrollIndicator={false}>

      {/* 0 — Sticky header: logo + search, stays pinned while scrolling */}
      <View style={{ backgroundColor: colors.surface, paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Image source={LOGO_IMAGE} style={{ width: 132, height: 30 }} contentFit="contain" />
          <Pressable onPress={() => router.push(user ? '/notifications' : '/login')} hitSlop={8}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={user ? 'notifications-outline' : 'person-outline'} size={20} color={colors.ink} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/explore')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Ionicons name="search" size={18} color={colors.brand} />
          <Text style={{ color: colors.inkTertiary, fontSize: font.size.base }}>Search cleaning, plumbing, AC…</Text>
        </Pressable>
      </View>

      {/* 1 — Scrollable body */}
      <View>
        {/* Hero (beige) */}
        <View style={{ backgroundColor: '#f8f1e9', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Pill text="❤️ Malaysia-ready home services" />
            <Pill text="📍 Klang Valley" />
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink, lineHeight: 36 }}>
            Book trusted help for every Malaysian home
          </Text>
          <Text style={{ fontSize: font.size.base, color: colors.inkSecondary, marginTop: 10, lineHeight: 22 }}>
            Verified cleaners, AC techs, plumbers, electricians, painters and pest experts — with upfront RM pricing.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 16 }}>
            {CITIES.slice(0, 5).map((c) => (
              <Pressable key={c} onPress={() => router.push('/(tabs)/explore')} style={{ backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.inkSecondary }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Hero photo — full portrait, not cropped */}
          <View style={{ marginTop: 18, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, ...shadow.e2 }}>
            <Image source={HERO_IMAGE} style={{ width: '100%', height: 300 }} contentFit="contain" contentPosition="bottom" transition={200} />
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: -28, marginHorizontal: 16, paddingVertical: 14, ...shadow.e2 }}>
            {[['32K+', 'jobs done'], ['4.8', 'rating'], ['30m', 'fast slots']].map(([n, l], i) => (
              <View key={l} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.hairline }}>
                <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>{n}</Text>
                <Text style={{ fontSize: 11, color: colors.inkTertiary }}>{l}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {STEPS.map((s) => (
              <View key={s.label} style={{ width: '47.5%', backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, ...shadow.e1 }}>
                <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                <Text style={{ fontSize: font.size.sm, fontWeight: '700', color: colors.ink, marginTop: 6 }}>{s.label}</Text>
                <Text style={{ fontSize: 11, color: colors.inkTertiary, marginTop: 1 }}>{s.sub}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* White body */}
        <View style={{ padding: spacing.lg, gap: spacing.xl }}>
          <View>
            <SectionTitle eyebrow="Explore" title="Browse categories" onSeeAll={() => router.push('/(tabs)/explore')} />
            {categories.isLoading ? <Loading /> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {(categories.data ?? []).map((c) => <CategoryTile key={c.id} category={c} />)}
              </View>
            )}
          </View>

          <Reels />

          <View>
            <SectionTitle eyebrow="Curated packages" title="Popular around Malaysia" onSeeAll={() => router.push('/(tabs)/explore')} />
            {services.isLoading ? <Loading /> : popular.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {popular.map((s) => <ServiceCardTall key={s.id} service={s} />)}
              </ScrollView>
            ) : <Muted>No services available. Is the API running?</Muted>}
          </View>

          <View style={{ gap: spacing.md }}>
            {PROMOS.map((p) => (
              <View key={p.title} style={{ backgroundColor: p.bg, borderWidth: 1, borderColor: p.bd, borderRadius: radius.lg, padding: spacing.lg }}>
                <Text style={{ fontSize: 24 }}>{p.icon}</Text>
                <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink, marginTop: 8 }}>{p.title}</Text>
                <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary, marginTop: 4, lineHeight: 20 }}>{p.body}</Text>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl }}>
            <Text style={{ color: '#d1d5db', fontSize: font.size.sm, fontWeight: '700' }}>🔔 For condos, landed homes, offices & rentals</Text>
            <Text style={{ color: colors.inkInverse, fontSize: font.size.xl, fontWeight: '800', marginTop: 8, lineHeight: 28 }}>
              Keep your home running without calling five contractors.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/explore')} style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>Start booking →</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, paddingVertical: 16 }}>
            {[['🛡️', 'Verified pros'], ['💯', 'Quality guarantee'], ['💬', '24/7 support']].map(([icon, label]) => (
              <View key={label} style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 22 }}>{icon}</Text>
                <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, fontWeight: '600' }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink }}>{text}</Text>
    </View>
  );
}

function SectionTitle({ eyebrow, title, onSeeAll }: { eyebrow: string; title: string; onSeeAll?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
      <View>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.brand, letterSpacing: 1, textTransform: 'uppercase' }}>{eyebrow}</Text>
        <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink, marginTop: 2 }}>{title}</Text>
      </View>
      {onSeeAll ? <Pressable onPress={onSeeAll}><Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>See all →</Text></Pressable> : null}
    </View>
  );
}
