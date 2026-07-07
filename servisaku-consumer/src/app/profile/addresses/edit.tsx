import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Address, type AddressInput } from '@/api/client';
import { requestLocation } from '@/lib/location';
import { useToast } from '@/components/toast';
import { useTheme } from '@/theme/theme';
import { ScreenHeader, Button, Field, Input, Chip } from '@/components/ui';
import { spacing, font } from '@/theme/tokens';

const LABELS = ['Home', 'Work', 'Other'];

export default function AddressEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();

  const existing = id ? (qc.getQueryData<Address[]>(['addresses']) ?? []).find((a) => a.id === id) : undefined;

  const [label, setLabel] = useState(existing?.label ?? 'Home');
  const [houseNumber, setHouseNumber] = useState(existing?.house_number ?? '');
  const [building, setBuilding] = useState(existing?.building ?? '');
  const [street, setStreet] = useState(existing?.street ?? '');
  const [area, setArea] = useState(existing?.area ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [stateName, setStateName] = useState(existing?.state ?? '');
  const [postal, setPostal] = useState(existing?.postal ?? '');
  const [country, setCountry] = useState(existing?.country ?? 'Malaysia');
  const [landmark, setLandmark] = useState(existing?.landmark ?? '');
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({ lat: existing?.lat, lng: existing?.lng });
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const valid = !!(street.trim() && city.trim());

  async function useCurrentLocation() {
    setLocating(true);
    const geo = await requestLocation();
    setLocating(false);
    if (!geo) { Alert.alert('Location unavailable', 'Allow location access or fill the address manually.'); return; }
    if (geo.street) setStreet(geo.street);
    if (geo.area) setArea(geo.area);
    if (geo.city) setCity(geo.city);
    if (geo.state) setStateName(geo.state);
    if (geo.postal) setPostal(geo.postal);
    setCoords({ lat: geo.lat, lng: geo.lng });
  }

  async function save() {
    if (!valid) { Alert.alert('Add details', 'Street and city are required.'); return; }
    const body: AddressInput = {
      label, house_number: houseNumber || undefined, building: building || undefined, street, area: area || undefined,
      city, state: stateName || undefined, postal: postal || undefined, country, landmark: landmark || undefined,
      lat: coords.lat, lng: coords.lng,
    };
    setSaving(true);
    try {
      if (id) await api.updateAddress(id, body); else await api.addAddress(body);
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.show(id ? 'Address updated' : 'Address saved', 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={id ? 'Edit address' : 'Add address'} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {LABELS.map((l) => <Chip key={l} label={l} active={label === l} onPress={() => setLabel(l)} />)}
        </View>

        <Button label={locating ? 'Locating…' : '📍 Use my current location'} variant="outline" onPress={useCurrentLocation} loading={locating} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="House / unit no."><Input value={houseNumber} onChangeText={setHouseNumber} placeholder="A-12-3" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Building"><Input value={building} onChangeText={setBuilding} placeholder="Name" /></Field></View>
        </View>
        <Field label="Street *"><Input value={street} onChangeText={setStreet} placeholder="Jalan …" /></Field>
        <Field label="Area"><Input value={area} onChangeText={setArea} placeholder="Neighbourhood" /></Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="City *"><Input value={city} onChangeText={setCity} placeholder="Kuala Lumpur" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Postal"><Input value={postal} onChangeText={setPostal} placeholder="50000" keyboardType="number-pad" /></Field></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="State"><Input value={stateName} onChangeText={setStateName} placeholder="Selangor" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Country"><Input value={country} onChangeText={setCountry} /></Field></View>
        </View>
        <Field label="Landmark / instructions (optional)"><Input value={landmark} onChangeText={setLandmark} placeholder="Near …, gate code, parking…" /></Field>

        <Button label={id ? 'Save changes' : 'Save address'} onPress={save} loading={saving} disabled={!valid} size="lg" />
        <Text style={{ textAlign: 'center', color: colors.inkTertiary, fontSize: font.size.xs }}>A draggable map pin is coming when maps are enabled.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
