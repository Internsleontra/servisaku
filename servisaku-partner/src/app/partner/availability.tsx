import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { api, type AvailabilityConfig } from '@/api/client';
import { CITIES } from '@/lib/booking-meta';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { SectionCard } from '@/components/kit';
import { ScreenHeader, Button, Chip, Field, Input } from '@/components/ui';
import { font, radius, spacing } from '@/theme/tokens';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RADII = [5, 10, 15, 20, 30];

export default function Availability() {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<AvailabilityConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState('');

  useEffect(() => { api.availability().then(setCfg).catch(() => setCfg({})); }, []);

  function set<K extends keyof AvailabilityConfig>(k: K, v: AvailabilityConfig[K]) { setCfg((c) => ({ ...(c ?? {}), [k]: v })); }
  function toggleDay(d: string) {
    const days = cfg?.working_days ?? [];
    set('working_days', days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  }
  function toggleCity(city: string) {
    const cities = (cfg?.cities as string[] | undefined) ?? [];
    set('cities' as keyof AvailabilityConfig, (cities.includes(city) ? cities.filter((x) => x !== city) : [...cities, city]) as never);
  }
  function addVacation() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { toast.show('Use YYYY-MM-DD', 'error'); return; }
    const dates = cfg?.vacation ? [] : (cfg?.unavailable_dates as string[] | undefined) ?? [];
    set('unavailable_dates' as keyof AvailabilityConfig, [...new Set([...dates, newDate])] as never);
    setNewDate('');
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await api.updateAvailability(cfg);
      await qc.invalidateQueries({ queryKey: ['availability'] });
      toast.show('Availability saved', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not save', 'error'); } finally { setSaving(false); }
  }

  if (!cfg) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Availability" /></View>;

  const online = cfg.online !== false;
  const cities = (cfg.cities as string[] | undefined) ?? [];
  const vacation = (cfg.unavailable_dates as string[] | undefined) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Availability & schedule" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Online */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: font.size.base }}>{online ? 'You&apos;re online' : 'You&apos;re offline'}</Text>
            <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{online ? 'Receiving new job requests' : 'Not receiving new jobs'}</Text>
          </View>
          <Switch value={online} onValueChange={(v) => set('online', v)} trackColor={{ true: colors.brand }} />
        </View>

        {/* Working days */}
        <SectionCard title="Working days">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: spacing.lg }}>
            {DAYS.map((d) => <Chip key={d} label={d} active={(cfg.working_days ?? []).includes(d)} onPress={() => toggleDay(d)} />)}
          </View>
        </SectionCard>

        {/* Hours */}
        <SectionCard title="Working hours">
          <View style={{ flexDirection: 'row', gap: 12, padding: spacing.lg }}>
            <View style={{ flex: 1 }}><Field label="Start"><Input value={cfg.start_time ?? '09:00'} onChangeText={(v) => set('start_time', v)} placeholder="09:00" /></Field></View>
            <View style={{ flex: 1 }}><Field label="End"><Input value={cfg.end_time ?? '18:00'} onChangeText={(v) => set('end_time', v)} placeholder="18:00" /></Field></View>
          </View>
        </SectionCard>

        {/* Radius */}
        <SectionCard title="Coverage radius">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: spacing.lg }}>
            {RADII.map((r) => <Chip key={r} label={`${r} km`} active={(cfg.radius_km ?? 10) === r} onPress={() => set('radius_km', r)} />)}
          </View>
        </SectionCard>

        {/* Cities */}
        <SectionCard title="Coverage areas">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: spacing.lg }}>
            {CITIES.map((c) => <Chip key={c} label={c} active={cities.includes(c)} onPress={() => toggleCity(c)} />)}
          </View>
        </SectionCard>

        {/* Vacation */}
        <SectionCard title="Days off / vacation">
          <View style={{ padding: spacing.lg, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Input value={newDate} onChangeText={setNewDate} placeholder="YYYY-MM-DD" /></View>
              <Button label="Add" size="md" onPress={addVacation} />
            </View>
            {vacation.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {vacation.map((d) => (
                  <Pressable key={d} onPress={() => set('unavailable_dates' as keyof AvailabilityConfig, vacation.filter((x) => x !== d) as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.raised, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: font.size.xs, color: colors.ink, fontWeight: '600' }}>{d}</Text>
                    <Ionicons name="close" size={13} color={colors.inkTertiary} />
                  </Pressable>
                ))}
              </View>
            ) : <Text style={{ color: colors.inkTertiary, fontSize: font.size.sm }}>No days off set.</Text>}
          </View>
        </SectionCard>

        <Button label="Save availability" onPress={save} loading={saving} size="lg" />
      </ScrollView>
    </View>
  );
}
