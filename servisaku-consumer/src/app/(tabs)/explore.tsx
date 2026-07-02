import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ServiceCard } from '@/components/cards';
import { Chip, Input, Loading, EmptyState, Title } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';

export default function Explore() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const services = useQuery({ queryKey: ['services'], queryFn: api.services });

  const filtered = useMemo(() => {
    let list = services.data ?? [];
    if (cat !== 'all') list = list.filter((s) => s.category_slug === cat);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.category_name ?? '').toLowerCase().includes(q));
    return list;
  }, [services.data, cat, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.md }}>
        <Title>Explore services</Title>
        <Input value={query} onChangeText={setQuery} placeholder="🔍 Search services…" autoCapitalize="none" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={cat === 'all'} onPress={() => setCat('all')} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={cat === c.slug} onPress={() => setCat(c.slug)} />
          ))}
        </ScrollView>
      </View>

      {services.isLoading ? (
        <Loading />
      ) : filtered.length ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}>
          {filtered.map((s) => <ServiceCard key={s.id} service={s} wide />)}
        </ScrollView>
      ) : (
        <EmptyState
          emoji="🔍"
          title="No services found"
          subtitle={services.isError ? 'Could not reach the server. Make sure the API is running.' : 'Try a different search or category.'}
        />
      )}
    </View>
  );
}
