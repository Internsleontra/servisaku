import { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PartnerDocument } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, ProgressBar } from '@/components/kit';
import { ScreenHeader, Button, Field, Input } from '@/components/ui';
import { font, radius, shadow, spacing } from '@/theme/tokens';

const STATUS: Record<string, { label: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  verified: { label: 'Verified', bg: '#ecfdf5', fg: '#059669', icon: 'checkmark-circle' },
  pending: { label: 'In review', bg: '#fffbeb', fg: '#d97706', icon: 'time' },
  rejected: { label: 'Rejected', bg: '#fef2f2', fg: '#dc2626', icon: 'close-circle' },
  expired: { label: 'Expired', bg: '#fef2f2', fg: '#dc2626', icon: 'alert-circle' },
  missing: { label: 'Not submitted', bg: '#f4f4f5', fg: '#6b7280', icon: 'ellipse-outline' },
};

export default function Verification() {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['documents'], queryFn: api.documents });
  const [openType, setOpenType] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  const summary = q.data;
  const groups = [...new Set((summary?.documents ?? []).map((d) => d.group ?? 'Other'))];

  function openForm(d: PartnerDocument) {
    setOpenType(d.type === openType ? null : d.type);
    setNumber(d.number ?? '');
    setExpiry(d.expiry_date ? String(d.expiry_date).slice(0, 10) : '');
  }

  async function submit(d: PartnerDocument) {
    setBusy(true);
    try {
      await api.submitDocument({
        type: d.type,
        file_url: 'uploaded://pending', // real photo upload needs object storage (deferred)
        number: d.hasNumber ? number.trim() || undefined : undefined,
        expiry_date: d.hasExpiry ? expiry.trim() || undefined : undefined,
      });
      await qc.invalidateQueries({ queryKey: ['documents'] });
      setOpenType(null);
      toast.show('Submitted for review', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not submit', 'error'); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Verification" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!summary ? <Skeleton height={80} radius={16} /> : (
          <View style={{ backgroundColor: summary.activated ? colors.successTint : colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: summary.activated ? '#a7f3d0' : colors.hairline, padding: spacing.lg, gap: 10, ...shadow.e1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.ink, fontSize: font.size.base }}>{summary.activated ? '✅ Account activated' : 'Verification progress'}</Text>
              <Text style={{ fontWeight: '800', color: colors.brand }}>{summary.progress}%</Text>
            </View>
            <ProgressBar value={summary.progress / 100} tint={summary.activated ? colors.success : colors.brand} />
            <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary }}>{summary.required_verified} of {summary.required_total} required documents verified</Text>
          </View>
        )}

        {q.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} height={70} radius={16} />)
          : groups.map((g) => (
            <View key={g} style={{ gap: 8 }}>
              <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6 }}>{g.toUpperCase()}</Text>
              {(summary?.documents ?? []).filter((d) => (d.group ?? 'Other') === g).map((d) => {
                const st = STATUS[d.status ?? 'missing'] ?? STATUS.missing;
                const open = openType === d.type;
                return (
                  <View key={d.type} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', ...shadow.e1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md }}>
                      <Ionicons name={st.icon} size={22} color={st.fg} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: colors.ink }}>{d.label}{d.required ? '' : ' (optional)'}</Text>
                        <Text style={{ fontSize: 11, color: colors.inkTertiary }} numberOfLines={2}>{d.help}</Text>
                      </View>
                      <View style={{ backgroundColor: st.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 10, fontWeight: '700', color: st.fg }}>{st.label}</Text></View>
                    </View>
                    {d.rejection_reason ? <Text style={{ paddingHorizontal: spacing.md, paddingBottom: 8, color: colors.danger, fontSize: font.size.xs }}>Reason: {d.rejection_reason}</Text> : null}
                    {d.status !== 'verified' ? (
                      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                        {open ? (
                          <View style={{ gap: 10, marginTop: 4 }}>
                            <Pressable onPress={() => toast.show('Photo upload needs storage — coming soon', 'info')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairline, borderRadius: radius.md, paddingVertical: 14 }}>
                              <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} /><Text style={{ color: colors.brand, fontWeight: '700' }}>Upload photo</Text>
                            </Pressable>
                            {d.hasNumber ? <Field label={d.numberLabel ?? 'Reference number'}><Input value={number} onChangeText={setNumber} placeholder={d.numberLabel ?? 'Number'} /></Field> : null}
                            {d.hasExpiry ? <Field label="Expiry date"><Input value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" /></Field> : null}
                            <Button label="Submit for review" onPress={() => submit(d)} loading={busy} size="md" />
                          </View>
                        ) : (
                          <Button label={d.status === 'missing' ? 'Submit document' : 'Re-submit'} variant="outline" size="sm" onPress={() => openForm(d)} />
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
      </ScrollView>
    </View>
  );
}
