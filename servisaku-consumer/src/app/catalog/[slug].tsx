import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ServiceCard } from '@/components/cards';
import { ScreenHeader, Loading, EmptyState } from '@/components/ui';
import { categoryIcon } from '@/lib/booking-meta';
import { colors, spacing } from '@/theme/tokens';

export default function CatalogCategory() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const services = useQuery({
    queryKey: ['category-services', slug],
    queryFn: () => api.categoryServices(String(slug)),
    enabled: !!slug,
  });

  const category = (categories.data ?? []).find((c) => c.slug === slug);
  const title = category ? `${categoryIcon(category.slug)} ${category.name}` : 'Category';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={title} />
      {services.isLoading ? (
        <Loading />
      ) : (services.data ?? []).length ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {(services.data ?? []).map((s) => <ServiceCard key={s.id} service={s} wide />)}
        </ScrollView>
      ) : (
        <EmptyState emoji="🧰" title="No services yet" subtitle="This category has no bookable services right now." />
      )}
    </View>
  );
}
