import { StyleSheet, Text, TextInput } from 'react-native';

// Apply Inter globally without touching every <Text>. Custom fonts don't respond
// to fontWeight on their own, so we map each weight to the matching Inter file
// and inject it as the default fontFamily. An explicit fontFamily in a style
// still wins (it's layered after).
const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': 'Inter_400Regular',
  '200': 'Inter_400Regular',
  '300': 'Inter_400Regular',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
};

function patch(Component: unknown) {
  const C = Component as { render?: (props: Record<string, unknown>, ref: unknown) => unknown; __interPatched?: boolean };
  if (!C.render || C.__interPatched) return;
  const orig = C.render;
  C.render = function (props: Record<string, unknown>, ref: unknown) {
    const flat = (StyleSheet.flatten(props.style as never) || {}) as { fontWeight?: string | number; fontFamily?: string };
    const family = flat.fontFamily ?? WEIGHT_TO_FAMILY[String(flat.fontWeight ?? '400')] ?? 'Inter_400Regular';
    return orig.call(this, { ...props, style: [{ fontFamily: family }, props.style] }, ref);
  };
  C.__interPatched = true;
}

patch(Text);
patch(TextInput);
