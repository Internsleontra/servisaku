import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
      <View style={{ width: 74, height: 74, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center', ...shadow.e1 }}>
        {img ? (
          <Image source={img} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        ) : (
          <Text style={{ fontSize: 30 }}>{categoryIcon(category.slug)}</Text>
        )}
      </View>
      <Text numberOfLines={2} style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>
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

export function BookingCard({ booking }: { booking: Booking }) {
  const meta = statusMeta(booking.status);
  const img = serviceImage(booking.service_slug);
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
          <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary, marginTop: 2 }}>
            {formatDay(booking.date)}{booking.time_slot ? ` · ${booking.time_slot}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text numberOfLines={1} style={{ fontSize: font.size.xs, color: colors.inkTertiary, flex: 1 }}>{booking.city ?? booking.address ?? ''}</Text>
            <Text style={{ fontSize: font.size.base, fontWeight: '700', color: colors.ink }}>{formatMYR(booking.price)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
