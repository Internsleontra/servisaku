import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { font, radius, shadow, spacing, HIT } from '@/theme/tokens';

/* ------------------------------------------------------------- Skeleton ---- */

export function Skeleton({ width, height = 14, radius: r = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width: width ?? '100%', height, borderRadius: r, backgroundColor: colors.raised, opacity: pulse }, style]} />;
}

/* ------------------------------------------------------------- ListItem ---- */

export function ListItem({
  icon, label, sublabel, right, badge, onPress, danger, first,
}: {
  icon?: ReactNode; label: string; sublabel?: string; right?: ReactNode; badge?: string | number;
  onPress?: () => void; danger?: boolean; first?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, minHeight: HIT + 8, paddingVertical: 12 },
        !first && { borderTopWidth: 1, borderTopColor: colors.hairline },
        pressed && { backgroundColor: colors.raised },
      ]}>
      {icon ? <View style={{ width: 26, alignItems: 'center' }}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.size.base, fontWeight: '600', color: danger ? colors.danger : colors.ink }}>{label}</Text>
        {sublabel ? <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary, marginTop: 1 }}>{sublabel}</Text> : null}
      </View>
      {badge !== undefined && badge !== '' ? (
        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{badge}</Text>
        </View>
      ) : null}
      {right ?? <Text style={{ color: colors.inkTertiary, fontSize: 20 }}>›</Text>}
    </Pressable>
  );
}

/* --------------------------------------------------------- SectionCard ----- */

export function SectionCard({ title, children, style, action }: { title?: string; children: ReactNode; style?: ViewStyle; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
          <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</Text>
          {action}
        </View>
      ) : null}
      <View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', ...shadow.e1 }, style]}>
        {children}
      </View>
    </View>
  );
}

/* --------------------------------------------------------- ProgressBar ----- */

export function ProgressBar({ value, tint }: { value: number; tint?: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.raised, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 4, backgroundColor: tint ?? colors.brand }} />
    </View>
  );
}

/* ---------------------------------------------------------- StatusChip ----- */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: colors.successTint, fg: colors.success },
    warning: { bg: colors.warningTint, fg: colors.warning },
    danger: { bg: colors.dangerTint, fg: colors.danger },
    info: { bg: '#eff6ff', fg: '#2563eb' },
    neutral: { bg: colors.raised, fg: colors.inkSecondary },
  };
  const c = map[tone];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: c.fg, fontSize: font.size.xs, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
