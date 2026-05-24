import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';

const { width: W, height: H } = Dimensions.get('window');

/* Small floating particle bubble */
function Particle({ x, size, delay, duration }: {
  x: number; size: number; delay: number; duration: number;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity,    { toValue: 0.6, duration: 400,            useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -(H * 0.55), duration, easing: Easing.linear, useNativeDriver: true }),
        ]),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 60,
        left: x,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(99,102,241,0.55)',
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

/* Expanding pulsing ring */
function PulseRing({ delay, size }: { delay: number; size: number }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 2.4, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 1800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size, height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: 'rgba(99,102,241,0.5)',
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

const TOTAL_MS = 2800;

export default function SplashScreen() {
  const { user, loading } = useAuth();
  const startTime = useRef(Date.now());

  /* Logo animations */
  const logoScale   = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoRotate  = useRef(new Animated.Value(0)).current;

  /* Text animations */
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(30)).current;

  /* Tagline stagger */
  const taglineOp   = useRef(new Animated.Value(0)).current;
  const taglineY    = useRef(new Animated.Value(16)).current;

  /* Progress bar */
  const progress    = useRef(new Animated.Value(0)).current;
  const progressOp  = useRef(new Animated.Value(0)).current;

  /* Bottom dots */
  const dotsOp      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      /* Phase 1 — logo pops in with slight rotate */
      Animated.parallel([
        Animated.spring(logoScale,   { toValue: 1,   tension: 45, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500,              useNativeDriver: true }),
        Animated.spring(logoRotate,  { toValue: 1,   tension: 40, friction: 8, useNativeDriver: true }),
      ]),
      /* Phase 2 — title slides up */
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(textY,       { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
      ]),
      /* Phase 3 — tagline + progress bar appear */
      Animated.parallel([
        Animated.timing(taglineOp,  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(taglineY,   { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
        Animated.timing(dotsOp,     { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(progressOp, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(progress,   { toValue: 1, duration: TOTAL_MS - 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]),
    ]).start();
  }, []);

  /* Navigate after minimum splash time */
  useEffect(() => {
    if (loading) return;
    const elapsed = Date.now() - startTime.current;
    const wait    = Math.max(0, TOTAL_MS - elapsed);
    const t = setTimeout(() => {
      router.replace(user ? '/(tabs)/home' : '/login');
    }, wait);
    return () => clearTimeout(t);
  }, [loading, user]);

  const spin = logoRotate.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  const progressW = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <LinearGradient
      colors={['#06041A', '#0C0A2E', '#17105C', '#0C0A2E']}
      style={styles.container}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background blobs */}
      <View style={[styles.blob, { top: -100, right: -90, width: 300, height: 300, opacity: 0.16 }]} />
      <View style={[styles.blob, { bottom: 100, left: -80, width: 220, height: 220, opacity: 0.09 }]} />

      {/* Floating particles */}
      <Particle x={W * 0.12} size={6}  delay={0}    duration={3200} />
      <Particle x={W * 0.28} size={4}  delay={600}  duration={2800} />
      <Particle x={W * 0.55} size={7}  delay={300}  duration={3600} />
      <Particle x={W * 0.72} size={5}  delay={900}  duration={3000} />
      <Particle x={W * 0.88} size={4}  delay={150}  duration={3400} />
      <Particle x={W * 0.42} size={3}  delay={750}  duration={2600} />

      {/* Center content */}
      <View style={styles.center}>
        {/* Pulsing rings behind logo */}
        <View style={styles.ringWrap}>
          <PulseRing delay={0}    size={160} />
          <PulseRing delay={800}  size={160} />
          <PulseRing delay={1600} size={160} />
        </View>

        {/* Logo mark */}
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }, { rotate: spin }],
            },
          ]}
        >
          <LinearGradient
            colors={['#6366F1', '#8B5CF6', '#A78BFA']}
            style={styles.logoGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Text style={styles.logoLetters}>POS</Text>
          </LinearGradient>
          {/* Inner glow ring */}
          <View style={styles.innerRing} />
        </Animated.View>

        {/* App name */}
        <Animated.View style={[styles.titleWrap, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
          <Text style={styles.appName}>POS Terminal</Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={[styles.taglineWrap, { opacity: taglineOp, transform: [{ translateY: taglineY }] }]}>
          <Text style={styles.tagline}>Smart · Fast · Reliable</Text>
        </Animated.View>
      </View>

      {/* Bottom section: progress bar + dots */}
      <Animated.View style={[styles.bottomSection, { opacity: dotsOp }]}>
        {/* Progress bar track */}
        <Animated.View style={[styles.progressTrack, { opacity: progressOp }]}>
          <Animated.View style={[styles.progressFill, { width: progressW }]}>
            <LinearGradient
              colors={['#6366F1', '#A78BFA']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            />
          </Animated.View>
        </Animated.View>

        {/* Dots */}
        <View style={styles.dotsRow}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  blob: { position: 'absolute', borderRadius: 999, backgroundColor: '#6366F1' },

  center: { alignItems: 'center', gap: 20 },

  ringWrap: {
    position: 'absolute',
    width: 160, height: 160,
    alignItems: 'center', justifyContent: 'center',
  },

  logoWrap: {
    shadowColor: '#6366F1', shadowOpacity: 0.75,
    shadowRadius: 44, shadowOffset: { width: 0, height: 8 },
    elevation: 24,
  },
  logoGradient: {
    width: 110, height: 110, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  logoLetters: {
    color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 4,
  },
  innerRing: {
    position: 'absolute', top: -10, left: -10, right: -10, bottom: -10,
    borderRadius: 40, borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.3)',
  },

  titleWrap: { marginTop: 8 },
  appName: {
    color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.5,
  },

  taglineWrap: {},
  tagline: {
    color: 'rgba(255,255,255,0.45)', fontSize: 13, letterSpacing: 2.5, textTransform: 'uppercase',
  },

  bottomSection: {
    position: 'absolute', bottom: 52, alignItems: 'center', width: W * 0.55, gap: 16,
  },
  progressTrack: {
    width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },

  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotActive: { width: 28, height: 7, borderRadius: 3.5, backgroundColor: '#6366F1' },
});
