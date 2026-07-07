import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '@/context/auth';
import { getProfileSummary } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { ListItem, SectionCard, Skeleton, ProgressBar } from '@/components/kit';
import { Button, EmptyState } from '@/components/ui';
import { initials, formatDate } from '@/lib/format';
import { tierColors, font, radius, spacing, HIT } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;

function maskPhone(phone?: string) {
  if (!phone) return '—';
  const tail = phone.slice(-4);
  return `${phone.slice(0, 3)} •••• ${tail}`;
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, logout, logoutEverywhere } = useAuth();
  const toast = useToast();
  const [revealPhone, setRevealPhone] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const summaryQ = useQuery({
    queryKey: ['profile-summary', user?.id],
    queryFn: () => getProfileSummary(user!.id),
    enabled: !!user,
  });
  const s = summaryQ.data;

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <EmptyState
          emoji="👤"
          title="Welcome to ServisAku"
          subtitle="Sign in to manage your bookings, payments and profile."
          action={<Button label="Sign in / Register" onPress={() => router.push('/onboarding/welcome' as never)} />}
        />
      </View>
    );
  }

  const tier = s?.tier ?? 'Bronze';
  const tc = tierColors[tier];
  const shareUrl = s ? `https://servisaku.my/u/${s.customerId}` : 'https://servisaku.my';

  function soon(label: string) {
    toast.show(`${label} — coming soon`, 'info');
  }
  async function shareProfile() {
    try { await Share.share({ message: `Find trusted home-service pros on ServisAku. ${shareUrl}`, url: shareUrl }); } catch { /* dismissed */ }
  }

  const icon = (name: IoniconName, color?: string) => <Ionicons name={name} size={20} color={color ?? colors.inkSecondary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ backgroundColor: colors.brand, paddingTop: insets.top + 16, paddingHorizontal: spacing.lg, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => router.push('/profile/edit' as never)} accessibilityLabel="Edit profile photo">
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 26, fontWeight: '800', color: colors.brand }}>{initials(user.fullName || user.email || user.phone)}</Text>}
            </View>
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.brand }}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.inkInverse }} numberOfLines={1}>{user.fullName ?? 'ServisAku user'}</Text>
              {s?.verified ? <Ionicons name="checkmark-circle" size={18} color="#fff" /> : null}
            </View>
            {s ? (
              <Text style={{ color: '#ffedd5', fontSize: font.size.xs, marginTop: 2 }}>Member since {formatDate(s.memberSince)} · {s.customerId}</Text>
            ) : <Skeleton width={160} height={10} style={{ marginTop: 6 }} />}
          </View>
        </View>

        {/* Contact + tier */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Pressable onPress={() => setRevealPhone((r) => !r)} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ color: '#ffedd5', fontSize: 10, fontWeight: '700' }}>PHONE</Text>
            <Text style={{ color: '#fff', fontWeight: '700', marginTop: 2 }}>{revealPhone ? (user.phone ?? '—') : maskPhone(user.phone)}</Text>
          </Pressable>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ color: '#ffedd5', fontSize: 10, fontWeight: '700' }}>EMAIL</Text>
            <Text style={{ color: '#fff', fontWeight: '700', marginTop: 2 }} numberOfLines={1}>{user.email ?? 'Not added'}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {[
            { icon: 'create-outline' as IoniconName, label: 'Edit', onPress: () => router.push('/profile/edit' as never) },
            { icon: 'qr-code-outline' as IoniconName, label: 'QR', onPress: () => setQrOpen(true) },
            { icon: 'share-social-outline' as IoniconName, label: 'Share', onPress: shareProfile },
          ].map((a) => (
            <Pressable key={a.label} onPress={a.onPress} style={{ flex: 1, minHeight: HIT, backgroundColor: colors.surface, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingVertical: 10 }}>
              <Ionicons name={a.icon} size={16} color={colors.brand} />
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: font.size.sm }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Tier + points card */}
      <View style={{ paddingHorizontal: spacing.lg, marginTop: -14 }}>
        <Pressable onPress={() => router.push('/profile/loyalty' as never)} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: tc.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="medal" size={13} color={tc.fg} />
                <Text style={{ color: tc.fg, fontWeight: '800', fontSize: font.size.xs }}>{tier}</Text>
              </View>
              {s ? <Text style={{ color: colors.ink, fontWeight: '800' }}>{s.points.toLocaleString()} pts</Text> : <Skeleton width={60} height={12} />}
            </View>
            <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>View rewards ›</Text>
          </View>
          {s?.nextTier ? (
            <>
              <ProgressBar value={s.points / (s.points + s.pointsToNextTier)} tint={tc.fg} />
              <Text style={{ color: colors.inkTertiary, fontSize: font.size.xs }}>{s.pointsToNextTier} pts to {s.nextTier}</Text>
            </>
          ) : null}
        </Pressable>
      </View>

      {/* Menu */}
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <SectionCard title="Account">
          <ListItem first icon={icon('person-outline')} label="Personal information" onPress={() => router.push('/profile/edit' as never)} />
          <ListItem icon={icon('location-outline')} label="Saved addresses" onPress={() => router.push('/profile/addresses' as never)} />
          <ListItem icon={icon('card-outline')} label="Payment methods" onPress={() => router.push('/profile/payments' as never)} />
        </SectionCard>

        <SectionCard title="Activity">
          <ListItem first icon={icon('receipt-outline')} label="My bookings" onPress={() => router.push('/(tabs)/bookings')} />
          <ListItem icon={icon('wallet-outline')} label="Wallet" sublabel={s ? `RM${s.walletBalance.toFixed(2)}` : undefined} onPress={() => router.push('/profile/wallet' as never)} />
          <ListItem icon={icon('star-outline')} label="Reviews" badge={s?.pendingReviews || ''} onPress={() => router.push('/profile/reviews' as never)} />
          <ListItem icon={icon('heart-outline')} label="Wishlist" badge={s?.savedCount || ''} onPress={() => router.push('/profile/wishlist' as never)} />
        </SectionCard>

        <SectionCard title="Rewards">
          <ListItem first icon={icon('ribbon-outline')} label="Membership" onPress={() => router.push('/profile/membership' as never)} />
          <ListItem icon={icon('medal-outline')} label="Loyalty & rewards" onPress={() => router.push('/profile/loyalty' as never)} />
          <ListItem icon={icon('pricetags-outline')} label="Offers & coupons" badge={s?.activeCoupons || ''} onPress={() => router.push('/profile/offers' as never)} />
          <ListItem icon={icon('gift-outline')} label="Refer & earn" onPress={() => soon('Referrals')} />
        </SectionCard>

        <SectionCard title="Settings">
          <ListItem first icon={icon('notifications-outline')} label="Notifications" onPress={() => router.push('/profile/notification-settings' as never)} />
          <ListItem icon={icon('options-outline')} label="App preferences" onPress={() => soon('App preferences')} />
          <ListItem icon={icon('shield-checkmark-outline')} label="Privacy & security" onPress={() => soon('Privacy & security')} />
        </SectionCard>

        <SectionCard title="More">
          <ListItem first icon={icon('help-circle-outline')} label="Help center" onPress={() => router.push('/help' as never)} />
          <ListItem icon={icon('document-text-outline')} label="Legal" onPress={() => soon('Legal')} />
          <ListItem icon={icon('information-circle-outline')} label="About" onPress={() => soon('About')} />
        </SectionCard>

        <Button
          label="Log out"
          variant="outline"
          onPress={() => Alert.alert('Log out', 'Log out of this device, or everywhere?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'This device', onPress: async () => { await logout(); router.replace('/(tabs)'); } },
            { text: 'All devices', style: 'destructive', onPress: async () => { await logoutEverywhere(); router.replace('/(tabs)'); } },
          ])}
        />
        <Text style={{ textAlign: 'center', color: colors.inkTertiary, fontSize: font.size.xs }}>ServisAku · v1.0.0</Text>
      </View>

      {/* QR modal */}
      <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <Pressable onPress={() => setQrOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 28, alignItems: 'center', gap: 14 }}>
            <Text style={{ fontWeight: '800', fontSize: font.size.lg, color: colors.ink }}>{user.fullName ?? 'ServisAku'}</Text>
            <QRCode value={shareUrl} size={200} color={colors.ink} backgroundColor={colors.surface} />
            <Text style={{ color: colors.inkTertiary, fontSize: font.size.sm }}>{s?.customerId ?? ''}</Text>
            <Text style={{ color: colors.inkTertiary, fontSize: font.size.xs }}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
