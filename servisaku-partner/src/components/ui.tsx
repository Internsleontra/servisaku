import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

/* --------------------------------------------------------------- Screen --- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = { padding: padded ? spacing.lg : 0, paddingBottom: (padded ? spacing.lg : 0) + insets.bottom + 8 };
  if (!scroll) {
    return <View style={[styles.screen, pad, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[pad, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- Text ---- */

export function Title({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}
export function Subtitle({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}
export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: object; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[styles.body, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: object; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[styles.muted, style]}>{children}</Text>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

/* ---------------------------------------------------------------- Card ----- */

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

/* --------------------------------------------------------------- Button ---- */

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost';
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  size = 'md',
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg' | 'sm';
  style?: ViewStyle;
}) {
  const bg =
    variant === 'primary' ? colors.brand :
    variant === 'accent' ? colors.ink :
    'transparent';
  const fg =
    variant === 'outline' ? colors.ink :
    variant === 'ghost' ? colors.brand :
    colors.inkInverse;
  const pv = size === 'lg' ? 15 : size === 'sm' ? 8 : 12;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, paddingVertical: pv },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.hairline },
        isDisabled && { opacity: 0.5 },
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text style={[styles.btnText, { color: fg, fontSize: size === 'sm' ? font.size.sm : font.size.base }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/* --------------------------------------------------------------- Chip ------ */

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: colors.brand, borderColor: colors.brand } : null]}>
      <Text style={[styles.chipText, active && { color: colors.inkInverse }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tint, fg }: { label: string; tint?: string; fg?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: tint ?? colors.raised }]}>
      <Text style={[styles.badgeText, { color: fg ?? colors.inkSecondary }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ label, size = 44, uri }: { label?: string; size?: number; uri?: string }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{label ?? '?'}</Text>
    </View>
  );
}

/* --------------------------------------------------------------- Field ----- */

export function Field({
  label,
  error,
  children,
}: {
  label?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.inkTertiary} {...props} style={[styles.input, props.style]} />;
}

/* ------------------------------------------------------------- feedback ---- */

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} />
      {label ? <Muted style={{ marginTop: 8 }}>{label}</Muted> : null}
    </View>
  );
}

export function EmptyState({ emoji = '🗂️', title, subtitle, action }: { emoji?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 44, marginBottom: 8 }}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Muted style={{ textAlign: 'center', marginTop: 4, paddingHorizontal: 24 }}>{subtitle}</Muted> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function ScreenHeader({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={styles.headerBtn}>
        <Text style={{ fontSize: 22, color: colors.ink }}>‹</Text>
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerBtn}>{right}</View>
    </View>
  );
}

/* --------------------------------------------------------------- styles ---- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: font.size.xl, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: font.size.lg, fontWeight: '700', color: colors.ink },
  body: { fontSize: font.size.base, color: colors.ink },
  muted: { fontSize: font.size.sm, color: colors.inkSecondary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: font.size.lg, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.hairline, ...shadow.e1 },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.md },
  btn: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, flexDirection: 'row', gap: 6 },
  btnText: { fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  chipText: { fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: font.size.xs, fontWeight: '700' },
  avatar: { backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.brand, fontWeight: '700' },
  fieldLabel: { fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary },
  fieldError: { fontSize: font.size.xs, color: colors.danger },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: font.size.base, color: colors.ink },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  headerBtn: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: font.size.base, fontWeight: '700', color: colors.ink },
});
