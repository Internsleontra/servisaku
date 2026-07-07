import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';
import { requestLocation } from '@/lib/location';
import { ScreenHeader, Button, Field, Input, Chip, Muted } from '@/components/ui';
import { colors, font, spacing } from '@/theme/tokens';

const LABELS = ['Home', 'Work', 'Other'];

export default function AddressSetup() {
  const p = useLocalSearchParams<{ lat?: string; lng?: string; city?: string; state?: string; area?: string; postal?: string; street?: string }>();

  const [label, setLabel] = useState('Home');
  const [houseNumber, setHouseNumber] = useState('');
  const [building, setBuilding] = useState('');
  const [street, setStreet] = useState(p.street ?? '');
  const [area, setArea] = useState(p.area ?? '');
  const [city, setCity] = useState(p.city ?? '');
  const [stateName, setStateName] = useState(p.state ?? '');
  const [postal, setPostal] = useState(p.postal ?? '');
  const [country, setCountry] = useState('Malaysia');
  const [landmark, setLandmark] = useState('');
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({
    lat: p.lat ? Number(p.lat) : undefined,
    lng: p.lng ? Number(p.lng) : undefined,
  });
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const valid = !!(street.trim() && city.trim());

  async function useCurrentLocation() {
    setLocating(true);
    const geo = await requestLocation();
    setLocating(false);
    if (!geo) { Alert.alert('Location unavailable', 'Please allow location access or fill the address manually.'); return; }
    if (geo.street) setStreet(geo.street);
    if (geo.area) setArea(geo.area);
    if (geo.city) setCity(geo.city);
    if (geo.state) setStateName(geo.state);
    if (geo.postal) setPostal(geo.postal);
    setCoords({ lat: geo.lat, lng: geo.lng });
  }

  async function save() {
    if (!valid) { Alert.alert('Add details', 'Street and city are required.'); return; }
    setSaving(true);
    try {
      await api.addAddress({
        label, house_number: houseNumber || undefined, building: building || undefined, street, area: area || undefined,
        city, state: stateName || undefined, postal: postal || undefined, country, landmark: landmark || undefined,
        lat: coords.lat, lng: coords.lng, is_default: true,
      });
      router.replace('/onboarding/notifications' as never);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Service address" onBack={() => {}} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>Where should we provide service?</Text>
            <Muted style={{ marginTop: 4 }}>Save an address to book faster next time.</Muted>
          </View>

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
          <Field label="Landmark (optional)"><Input value={landmark} onChangeText={setLandmark} placeholder="Near …" /></Field>

          <Button label="Save address" onPress={save} loading={saving} disabled={!valid} size="lg" />
          <Button label="Skip for now" variant="ghost" onPress={() => router.replace('/onboarding/notifications' as never)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
