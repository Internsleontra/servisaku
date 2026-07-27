import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '@/theme/tokens';

type ToastType = 'success' | 'error' | 'info';
interface ToastCtx { show: (message: string, type?: ToastType) => void }

const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ msg: message, type });
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
  }, [opacity]);

  const bg = toast?.type === 'success' ? colors.success : toast?.type === 'error' ? colors.danger : colors.ink;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 24, opacity, alignItems: 'center' }}>
          <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, maxWidth: '100%', ...shadow.e2 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: font.size.sm }} numberOfLines={2}>{toast.msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}
