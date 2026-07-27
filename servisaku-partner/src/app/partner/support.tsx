import { useState } from 'react';
import { Linking, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, SectionCard, StatusChip } from '@/components/kit';
import { ScreenHeader, Button, Chip, Field, Input } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

const SUPPORT_PHONE = '+60322998888';
const EMERGENCY_PHONE = '+60322990000';
const CATEGORIES = [
  { id: 'technical', label: 'Technical issue' }, { id: 'payment', label: 'Payment issue' }, { id: 'booking', label: 'Booking issue' },
  { id: 'report_customer', label: 'Report a customer' }, { id: 'other', label: 'Other' },
];
const FAQS = [
  { q: 'When do I get paid?', a: 'Completed jobs add to your wallet. Withdraw to your Malaysian bank anytime — funds arrive in 1–3 business days.' },
  { q: 'How do I add extra work during a job?', a: 'Open the job, tap "Add extra service", and propose it. The customer approves and the invoice updates automatically. Never take cash.' },
  { q: 'What if the customer is not home?', a: 'Use "Cannot access" on the job screen to alert the customer and support. Wait the grace period before marking it.' },
  { q: 'How is my rating calculated?', a: 'The average of customer star ratings on completed jobs. Reply professionally to feedback to build trust.' },
  { q: 'Why am I not getting jobs?', a: 'Check you are Online, not in Vacation mode, fully verified, and your coverage area and categories are set in Availability.' },
];

export default function Support() {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['support'], queryFn: api.support });
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState('technical');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (subject.trim().length < 3 || message.trim().length < 5) { toast.show('Add a subject and a short description', 'error'); return; }
    setSubmitting(true);
    try {
      await api.createTicket({ category, subject: subject.trim(), message: message.trim() });
      await qc.invalidateQueries({ queryKey: ['support'] });
      setSubject(''); setMessage(''); setShowForm(false);
      toast.show('Ticket raised — we&apos;ll get back to you', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not raise ticket', 'error'); } finally { setSubmitting(false); }
  }

  const contacts = [
    { icon: 'call' as const, label: 'Call support', tint: colors.brandTint, fg: colors.brand, onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`) },
    { icon: 'chatbubbles' as const, label: 'Live chat', tint: '#eff6ff', fg: '#2563eb', onPress: () => toast.show('Live chat — coming soon', 'info') },
    { icon: 'warning' as const, label: 'Emergency', tint: colors.dangerTint, fg: colors.danger, onPress: () => Linking.openURL(`tel:${EMERGENCY_PHONE}`) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Support" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Contact actions */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {contacts.map((c) => (
            <Pressable key={c.label} onPress={c.onPress} style={{ flex: 1, alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.lg, padding: 14, ...shadow.e1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={c.icon} size={20} color={c.fg} /></View>
              <Text style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Tickets */}
        <SectionCard title="Tickets" action={<Pressable onPress={() => setShowForm((s) => !s)}><Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>{showForm ? 'Close' : '+ Raise ticket'}</Text></Pressable>}>
          <View style={{ padding: spacing.lg, gap: showForm ? spacing.md : 0 }}>
            {showForm ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} active={category === c.id} onPress={() => setCategory(c.id)} />)}
                </View>
                <Field label="Subject"><Input value={subject} onChangeText={setSubject} placeholder="Brief summary" /></Field>
                <Field label="Describe the issue"><Input value={message} onChangeText={setMessage} placeholder="What happened?" multiline style={{ minHeight: 80, textAlignVertical: 'top' }} /></Field>
                <Button label="Submit ticket" onPress={submit} loading={submitting} />
              </>
            ) : null}
            {q.isLoading ? <Skeleton height={44} /> : (q.data ?? []).length ? (q.data ?? []).map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: (showForm || i) ? 1 : 0, borderTopColor: colors.hairline }}>
                <View style={{ flex: 1, paddingRight: 8 }}><Text numberOfLines={1} style={{ fontWeight: '700', color: colors.ink }}>{t.subject || t.category}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{CATEGORIES.find((c) => c.id === t.category)?.label ?? t.category}{t.created_date ? ` · ${formatDate(t.created_date)}` : ''}</Text></View>
                <StatusChip label={t.status} tone={t.status === 'resolved' ? 'success' : 'warning'} />
              </View>
            )) : (!showForm ? <Text style={{ color: colors.inkTertiary, fontSize: font.size.sm, paddingVertical: 6 }}>No tickets yet.</Text> : null)}
          </View>
        </SectionCard>

        {/* FAQs */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6 }}>FAQS</Text>
          {FAQS.map((f, i) => (
            <Pressable key={i} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, gap: 10 }}>
                <Text style={{ flex: 1, fontWeight: '600', color: colors.ink }}>{f.q}</Text>
                <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkTertiary} />
              </View>
              {openFaq === i ? <Text style={{ paddingHorizontal: 14, paddingBottom: 14, fontSize: font.size.sm, color: colors.inkSecondary, lineHeight: 20 }}>{f.a}</Text> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
