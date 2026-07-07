import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getWishlist, type WishlistState } from '@/features/profile/mockApi';
import { serviceImage } from '@/lib/images';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, SectionCard } from '@/components/kit';
import { ScreenHeader, Chip, EmptyState } from '@/components/ui';
import { formatMYR } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

export default function Wishlist() {
  const { colors } = useTheme();
  const toast = useToast();
  const [data, setData] = useState<WishlistState | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => { getWishlist().then(setData); }, []);

  function removeService(slug: string) {
    setData((d) => (d ? { ...d, services: d.services.filter((s) => s.slug !== slug) } : d));
    toast.show('Removed from wishlist', 'success');
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Wishlist" />
        <View style={{ padding: spacing.lg, gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={90} radius={16} />)}</View>
      </View>
    );
  }

  const empty = !data.services.length && !data.categories.length && !data.partners.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Wishlist" right={
        <Pressable onPress={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))} hitSlop={8}>
          <Ionicons name={view === 'grid' ? 'list' : 'grid'} size={20} color={colors.ink} />
        </Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {empty ? (
          <EmptyState emoji="💛" title="Nothing saved yet" subtitle="Tap the heart on services and pros to save them here." />
        ) : (
          <>
            {data.services.length ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6 }}>SAVED SERVICES</Text>
                <View style={{ flexDirection: view === 'grid' ? 'row' : 'column', flexWrap: 'wrap', gap: spacing.md }}>
                  {data.services.map((s) => {
                    const img = serviceImage(s.slug);
                    return (
                      <View key={s.slug} style={{ width: view === 'grid' ? '47%' : '100%', flexDirection: view === 'grid' ? 'column' : 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', ...shadow.e1 }}>
                        <View style={{ width: view === 'grid' ? '100%' : 96, height: view === 'grid' ? 96 : 96, backgroundColor: colors.brandTint }}>
                          {img ? <Image source={img} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                          <Pressable onPress={() => removeService(s.slug)} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="heart" size={15} color="#fff" />
                          </Pressable>
                        </View>
                        <View style={{ flex: 1, padding: 10, gap: 4 }}>
                          <Text numberOfLines={1} style={{ fontWeight: '700', color: colors.ink, fontSize: font.size.sm }}>{s.name}</Text>
                          <Text style={{ fontSize: 10, color: colors.inkTertiary }}>{s.category}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={{ color: colors.brand, fontWeight: '800', fontSize: font.size.sm }}>from {formatMYR(s.price)}</Text>
                            <Pressable onPress={() => router.push(`/book-service/${s.slug}`)} style={{ backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Book</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {data.partners.length ? (
              <SectionCard title="Favourite pros">
                <View>
                  {data.partners.map((p, i) => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '800', color: colors.brand }}>{p.name[0]}</Text></View>
                      <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{p.name}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>⭐ {p.rating} · {p.jobs} jobs</Text></View>
                    </View>
                  ))}
                </View>
              </SectionCard>
            ) : null}

            {data.categories.length ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6 }}>SAVED CATEGORIES</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {data.categories.map((c) => <Chip key={c.slug} label={c.name} onPress={() => router.push(`/catalog/${c.slug}` as never)} />)}
                </View>
              </View>
            ) : null}

            {data.recentlyViewed.length ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6 }}>RECENTLY VIEWED</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {data.recentlyViewed.map((r) => <Chip key={r.slug} label={r.name} onPress={() => router.push(`/book-service/${r.slug}` as never)} />)}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
