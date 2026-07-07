import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Category, ServiceSummary, Booking } from '@/api/client';
import { categoryIcon, statusMeta } from '@/lib/booking-meta';
import { categoryImage, serviceImage } from '@/lib/images';
import { formatMYR, formatDay } from '@/lib/format';
import { Badge } from '@/components/ui';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

const prettyCategory = (slug = '') =>
  slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Web parity: "From <price_from or visit_fee>".
function fromPrice(s: ServiceSummary): string | null {
  const v = (s.price_from && s.price_from > 0) ? s.price_from : (s.visit_fee ?? s.base_price ?? 0);
  return v > 0 ? formatMYR(Math.round(v)) : null;
}

export function CategoryTile({ category }: { category: Category }) {
  const img = categoryImage(category.slug);
  return (
    <Pressable
      onPress={() => router.push(`/catalog/${category.slug}`)}
      style={({ pressed }) => [{ width: '31%', alignItems: 'center', gap: 8, marginBottom: spacing.lg, opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ width: '100%', aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', padding: 8, ...shadow.e1 }}>
        {img ? (
          // `contain` so wide product shots (AC unit, washing machine) show in full.
          <Image source={img} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={150} />
        ) : (
          <Text style={{ fontSize: 34 }}>{categoryIcon(category.slug)}</Text>
        )}
      </View>
      <Text numberOfLines={2} style={{ fontSize: font.size.sm, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>
        {category.name}
      </Text>
    </Pressable>
  );
}

// Vertical card for the horizontal "Popular" rail.
export function ServiceCardTall({ service }: { service: ServiceSummary }) {
  const img = serviceImage(service.slug);
  const price = fromPrice(service);
  return (
    <Pressable
      onPress={() => router.push(`/book-service/${service.slug}`)}
      style={({ pressed }) => [{ width: 220, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, marginRight: spacing.md, overflow: 'hidden', opacity: pressed ? 0.9 : 1, ...shadow.e1 }]}>
      <View style={{ height: 120, backgroundColor: colors.brandTint }}>
        {img ? <Image source={img} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
             : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 44 }}>{categoryIcon(service.category_slug)}</Text></View>}
      </View>
      <View style={{ padding: spacing.md }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.brand, textTransform: 'uppercase', marginBottom: 4 }}>{prettyCategory(service.category_slug)}</Text>
        <Text numberOfLines={2} style={{ fontSize: font.size.base, fontWeight: '800', color: colors.ink, minHeight: 40 }}>{service.name}</Text>
        <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary, marginTop: 6 }}>
          {price ? <>From <Text style={{ fontWeight: '800', color: colors.brand }}>{price}</Text></> : 'Get a quote'}
        </Text>
      </View>
    </Pressable>
  );
}

// Wide row card (image left, details right) — the site's "Popular" layout.
export function ServiceCard({ service }: { service: ServiceSummary; wide?: boolean }) {
  const img = serviceImage(service.slug);
  const price = fromPrice(service);
  return (
    <Pressable
      onPress={() => router.push(`/book-service/${service.slug}`)}
      style={({ pressed }) => [{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', opacity: pressed ? 0.9 : 1, ...shadow.e1 }]}>
      <View style={{ width: 120, backgroundColor: colors.brandTint }}>
        {img ? <Image source={img} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
             : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 36 }}>{categoryIcon(service.category_slug)}</Text></View>}
      </View>
      <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center' }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.brandTint, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.brand }}>{prettyCategory(service.category_slug)}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: font.size.base, fontWeight: '800', color: colors.ink }}>{service.name}</Text>
        {service.description ? <Text numberOfLines={2} style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 3 }}>{service.description}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>
            {price ? <>From <Text style={{ fontWeight: '800', color: colors.brand }}>{price}</Text></> : 'Get a quote'}
          </Text>
          <Text style={{ color: colors.inkTertiary, fontSize: 16 }}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}

const ACTIVE_STATUSES = ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'started'];

export function BookingCard({ booking }: { booking: Booking }) {
  const meta = statusMeta(booking.status);
  const img = serviceImage(booking.service_slug);
  const active = ACTIVE_STATUSES.includes(booking.status);
  const canRate = booking.status === 'completed' && !booking.rating;
  const ref = `#${String(booking.id).slice(0, 8).toUpperCase()}`;
  return (
    <Pressable
      onPress={() => router.push(`/booking/${booking.id}`)}
      style={({ pressed }) => [{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md, marginBottom: spacing.md, opacity: pressed ? 0.9 : 1, ...shadow.e1 }]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
          {img ? <Image source={img} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Text style={{ fontSize: 24 }}>🧰</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: font.size.base, fontWeight: '700', color: colors.ink, paddingRight: 8 }}>{booking.service_type}</Text>
            <Badge label={`${meta.icon} ${meta.label}`} tint={meta.tint} fg={meta.fg} />
          </View>
          <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary, marginTop: 1 }}>{ref}</Text>
          <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary, marginTop: 2 }}>
            {formatDay(booking.date)}{booking.time_slot ? ` · ${booking.time_slot}` : ''}
          </Text>
          {booking.partner_name ? (
            <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 2 }}>
              👷 {booking.partner_name}{booking.partner_rating ? ` · ⭐ ${booking.partner_rating.toFixed(1)}` : ''}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text numberOfLines={1} style={{ fontSize: font.size.xs, color: colors.inkTertiary, flex: 1 }}>{booking.city ?? booking.address ?? ''}</Text>
            <Text style={{ fontSize: font.size.base, fontWeight: '700', color: colors.ink }}>{formatMYR(booking.price)}</Text>
          </View>
        </View>
      </View>

      {(active || canRate) ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {active ? <QuickAction icon="navigate" label="Track" onPress={() => router.push(`/tracking/${booking.id}`)} /> : null}
          {active ? <QuickAction icon="chatbubble-ellipses" label="Chat" onPress={() => router.push(`/chat/${booking.id}`)} /> : null}
          {canRate ? <QuickAction icon="star" label="Rate" onPress={() => router.push(`/review/${booking.id}`)} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingVertical: 9 }}>
      <Ionicons name={icon} size={15} color={colors.brand} />
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: font.size.sm }}>{label}</Text>
    </Pressable>
  );
}
