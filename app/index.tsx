import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const { user, loading } = useAuth();
  const startTime = useRef(Date.now());

  const logoScale   = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(24)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.spring(textY, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
        Animated.timing(dotsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    if (loading) return;
    const MIN = 2800;
    const elapsed = Date.now() - startTime.current;
    const wait = Math.max(0, MIN - elapsed);
    const t = setTimeout(() => {
      router.replace(user ? '/(tabs)/home' : '/login');
    }, wait);
    return () => clearTimeout(t);
  }, [loading, user]);

  return (
    <LinearGradient
      colors={['#0C0A2E', '#17105C', '#0C0A2E']}
      style={styles.container}
      start={{ x: 0.0, y: 0.0 }}
      end={{ x: 1.0, y: 1.0 }}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Decorative blobs */}
      <View style={[styles.blob, { top: -100, right: -80, width: 280, height: 280, opacity: 0.14 }]} />
      <View style={[styles.blob, { bottom: 40, left: -70, width: 200, height: 200, opacity: 0.08 }]} />
      <View style={[styles.blob, { top: '40%', left: width * 0.5 - 60, width: 120, height: 120, opacity: 0.06 }]} />

      {/* Center content */}
      <View style={styles.center}>
        {/* Logo mark */}
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
          <LinearGradient
            colors={['#6366F1', '#8B5CF6', '#A78BFA']}
            style={styles.logoGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.logoLetters}>POS</Text>
          </LinearGradient>
          {/* Glow ring */}
          <View style={styles.glowRing} />
        </Animated.View>

        {/* App name + tagline */}
        <Animated.View style={[styles.textBlock, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
          <Text style={styles.appName}>POS Terminal</Text>
          <Text style={styles.tagline}>Smart Point of Sale</Text>
        </Animated.View>
      </View>

      {/* Bottom indicator dots */}
      <Animated.View style={[styles.dotsRow, { opacity: dotsOpacity }]}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  blob: { position: 'absolute', borderRadius: 999, backgroundColor: '#6366F1' },

  center: { alignItems: 'center', gap: 28 },

  logoWrap: {
    shadowColor: '#6366F1',
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 8 },
    elevation: 24,
  },
  logoGradient: {
    width: 112,
    height: 112,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetters: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 3 },
  glowRing: {
    position: 'absolute',
    top: -8, left: -8, right: -8, bottom: -8,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(99,102,241,0.35)',
  },

  textBlock: { alignItems: 'center', gap: 8 },
  appName: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  tagline:  { color: 'rgba(255,255,255,0.5)', fontSize: 14, letterSpacing: 0.8 },

  dotsRow: { position: 'absolute', bottom: 56, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 26, height: 8, borderRadius: 4, backgroundColor: '#6366F1' },
});
