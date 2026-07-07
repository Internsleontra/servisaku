import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router } from 'expo-router';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

// Urban-Company-style reels: short muted looping portrait clips that auto-rotate
// and link into the catalogue. Uses list windowing so only the on-screen videos
// mount/play (not all at once).
interface Reel { video: number; label: string; href: string }

const CLEAN = '/catalog/cleaning';
const WOMEN = '/catalog/beauty-wellness-women';
const MEN = '/catalog/mens-grooming-massage';
const EXPLORE = '/(tabs)/explore';

// Named clips carry a category; the extra clips link to Explore. Interleaved
// so the rotating strip mixes categories.
const REELS: Reel[] = [
  { video: require('../../assets/videos/c1.mp4'), label: 'Home Cleaning', href: CLEAN },
  { video: require('../../assets/videos/g1.mp4'), label: 'Trusted pros', href: EXPLORE },
  { video: require('../../assets/videos/w1.mp4'), label: 'Beauty & Wellness', href: WOMEN },
  { video: require('../../assets/videos/g2.mp4'), label: 'At your service', href: EXPLORE },
  { video: require('../../assets/videos/m1.mp4'), label: "Men's Grooming", href: MEN },
  { video: require('../../assets/videos/g3.mp4'), label: 'Verified experts', href: EXPLORE },
  { video: require('../../assets/videos/c2.mp4'), label: 'Deep Cleaning', href: CLEAN },
  { video: require('../../assets/videos/g4.mp4'), label: 'Quality work', href: EXPLORE },
  { video: require('../../assets/videos/w2.mp4'), label: 'Salon at Home', href: WOMEN },
  { video: require('../../assets/videos/g5.mp4'), label: 'Same-day help', href: EXPLORE },
  { video: require('../../assets/videos/m2.mp4'), label: 'Massage & Spa', href: MEN },
  { video: require('../../assets/videos/g6.mp4'), label: 'Trusted pros', href: EXPLORE },
  { video: require('../../assets/videos/c3.mp4'), label: 'Sofa & Upholstery', href: CLEAN },
  { video: require('../../assets/videos/g7.mp4'), label: 'At your service', href: EXPLORE },
  { video: require('../../assets/videos/w3.mp4'), label: 'Facial & Spa', href: WOMEN },
  { video: require('../../assets/videos/g8.mp4'), label: 'Verified experts', href: EXPLORE },
  { video: require('../../assets/videos/m3.mp4'), label: 'Beard & Trim', href: MEN },
  { video: require('../../assets/videos/g9.mp4'), label: 'Quality work', href: EXPLORE },
  { video: require('../../assets/videos/g10.mp4'), label: 'Same-day help', href: EXPLORE },
];

const CARD_W = 150;
const GAP = spacing.md;
const STRIDE = CARD_W + GAP;

function ReelCard({ item }: { item: Reel }) {
  const player = useVideoPlayer(item.video, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={styles.card}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <View style={styles.labelWrap}>
        <Text style={styles.label}>{item.label}</Text>
      </View>
      <Pressable onPress={() => router.push(item.href as never)} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export default function Reels() {
  const listRef = useRef<FlatList<Reel>>(null);
  const idx = useRef(0);

  // Auto-rotate every 3.2s, looping back to the start.
  useEffect(() => {
    const t = setInterval(() => {
      idx.current = (idx.current + 1) % REELS.length;
      listRef.current?.scrollToIndex({ index: idx.current, animated: true, viewPosition: 0 });
    }, 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <View>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.brand, letterSpacing: 1, textTransform: 'uppercase' }}>See it in action</Text>
        <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink, marginTop: 2 }}>ServisAku pros at work</Text>
      </View>
      <FlatList
        ref={listRef}
        data={REELS}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <ReelCard item={item} />}
        horizontal
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: STRIDE, offset: STRIDE * i, index: i })}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
    marginRight: GAP,
    ...shadow.e1,
  },
  labelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  label: { color: '#fff', fontWeight: '700', fontSize: font.size.sm },
});
