import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/config';
import { apiFetch } from '@/lib/api';

const { width: W } = Dimensions.get('window');

export default function LoginScreen() {
  const { login } = useAuth();
  const [username,    setUsername]   = useState('');
  const [password,    setPassword]   = useState('');
  const [showPass,    setShowPass]   = useState(false);
  const [error,       setError]      = useState('');
  const [loading,     setLoading]    = useState(false);
  const [connStatus,  setConnStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [connTesting, setConnTest]   = useState(false);
  const [userFocus,   setUserFocus]  = useState(false);
  const [passFocus,   setPassFocus]  = useState(false);

  /* ── Entrance animations ── */
  const logoScale   = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const brandY      = useRef(new Animated.Value(24)).current;
  const brandOp     = useRef(new Animated.Value(0)).current;
  const cardY       = useRef(new Animated.Value(56)).current;
  const cardOp      = useRef(new Animated.Value(0)).current;

  /* ── Error shake ── */
  const shakeX = useRef(new Animated.Value(0)).current;

  /* ── Button press ── */
  const btnScale = useRef(new Animated.Value(1)).current;

  /* ── Blob float animation ── */
  const blob1Y = useRef(new Animated.Value(0)).current;
  const blob2Y = useRef(new Animated.Value(0)).current;

  /* Entrance sequence */
  useEffect(() => {
    Animated.sequence([
      /* Logo pops in */
      Animated.parallel([
        Animated.spring(logoScale,   { toValue: 1, tension: 50, friction: 7,  useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400,              useNativeDriver: true }),
      ]),
      /* Brand text slides up */
      Animated.parallel([
        Animated.timing(brandOp, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(brandY,  { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
      ]),
      /* Card slides up */
      Animated.parallel([
        Animated.timing(cardOp, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(cardY,  { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
      ]),
    ]).start();

    /* Blobs floating loop */
    const floatBlob = (val: Animated.Value, dist: number, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: -dist, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(val, { toValue:  dist, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    floatBlob(blob1Y, 14, 3800).start();
    floatBlob(blob2Y, 10, 3100).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue:  10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const pressBtnIn  = () => Animated.spring(btnScale, { toValue: 0.95, tension: 140, friction: 8, useNativeDriver: true }).start();
  const pressBtnOut = () => Animated.spring(btnScale, { toValue: 1,    tension: 140, friction: 8, useNativeDriver: true }).start();

  /* ── Handlers ── */
  const testConnection = async () => {
    setConnTest(true);
    setConnStatus('idle');
    try {
      const r = await apiFetch('/api/health');
      setConnStatus(r.ok ? 'ok' : 'fail');
    } catch {
      setConnStatus('fail');
    } finally {
      setConnTest(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      shake();
      return;
    }
    setLoading(true);
    setError('');
    const err = await login(username.trim(), password.trim());
    setLoading(false);
    if (err) {
      setError(err);
      shake();
      return;
    }
    router.replace('/(tabs)/home');
  };

  const connLabel = connStatus === 'ok' ? '✓ Connected' : connStatus === 'fail' ? '✗ Failed' : 'Test';
  const connColor = connStatus === 'ok' ? '#10B981' : connStatus === 'fail' ? '#EF4444' : '#9CA3AF';

  return (
    <LinearGradient
      colors={['#06041A', '#0C0A2E', '#17105C', '#0C0A2E']}
      style={styles.gradient}
      start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Animated background blobs */}
        <Animated.View style={[styles.blob, { top: -90, right: -70, width: 260, height: 260, transform: [{ translateY: blob1Y }] }]} />
        <Animated.View style={[styles.blob, { bottom: 60, left: -80, width: 200, height: 200, opacity: 0.07, transform: [{ translateY: blob2Y }] }]} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Branding ── */}
            <View style={styles.brandSection}>
              {/* Animated logo */}
              <Animated.View style={[styles.logoOuter, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
                <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.logoBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Text style={styles.logoBoxText}>POS</Text>
                </LinearGradient>
                {/* Glow ring */}
                <View style={styles.logoGlowRing} />
              </Animated.View>

              {/* Brand name + sub */}
              <Animated.View style={[styles.brandTextWrap, { opacity: brandOp, transform: [{ translateY: brandY }] }]}>
                <Text style={styles.brandTitle}>POS Terminal</Text>
                <Text style={styles.brandSub}>Sign in to your account</Text>
              </Animated.View>
            </View>

            {/* ── Card (shakes on error) ── */}
            <Animated.View style={[styles.card, { opacity: cardOp, transform: [{ translateY: cardY }, { translateX: shakeX }] }]}>

              {/* Server row */}
              <View style={styles.serverRow}>
                <View style={styles.serverInfo}>
                  <Text style={styles.serverLabel}>SERVER</Text>
                  <Text style={styles.serverUrl} numberOfLines={1}>{API_BASE}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.testBtn,
                    connStatus === 'ok'   && styles.testBtnOk,
                    connStatus === 'fail' && styles.testBtnFail,
                  ]}
                  onPress={testConnection}
                  disabled={connTesting}
                >
                  {connTesting
                    ? <ActivityIndicator size="small" color="#6366F1" />
                    : <Text style={[styles.testBtnText, { color: connColor }]}>{connLabel}</Text>}
                </TouchableOpacity>
              </View>

              {/* Error */}
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#FCA5A5" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Username input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <View style={[styles.inputRow, userFocus && styles.inputRowFocused]}>
                  <Ionicons name="person-outline" size={18} color={userFocus ? '#6366F1' : '#6B7280'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter username or email"
                    placeholderTextColor="#4B5563"
                    value={username}
                    onChangeText={v => { setUsername(v); setError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onFocus={() => setUserFocus(true)}
                    onBlur={()  => setUserFocus(false)}
                  />
                </View>
              </View>

              {/* Password input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={[styles.inputRow, passFocus && styles.inputRowFocused]}>
                  <Ionicons name="lock-closed-outline" size={18} color={passFocus ? '#6366F1' : '#6B7280'} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Enter password"
                    placeholderTextColor="#4B5563"
                    value={password}
                    onChangeText={v => { setPassword(v); setError(''); }}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    onFocus={() => setPassFocus(true)}
                    onBlur={()  => setPassFocus(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={passFocus ? '#6366F1' : '#6B7280'} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign In button with press scale */}
              <Animated.View style={{ transform: [{ scale: btnScale }], borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
                <TouchableOpacity
                  onPress={handleLogin}
                  onPressIn={pressBtnIn}
                  onPressOut={pressBtnOut}
                  disabled={loading}
                  activeOpacity={1}
                >
                  <LinearGradient
                    colors={loading ? ['#4B4B8A', '#6B5B9A'] : ['#6366F1', '#8B5CF6']}
                    style={styles.signInGradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <Text style={styles.signInText}>Sign In</Text>
                          <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.85)" />
                        </>}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>

            {/* Connection fail hint */}
            {connStatus === 'fail' && (
              <Animated.View style={[styles.hintBox, { opacity: cardOp }]}>
                <Ionicons name="information-circle-outline" size={16} color="#FCD34D" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hintTitle}>Cannot reach {API_BASE}</Text>
                  <Text style={styles.hintBody}>
                    1. Start server on your PC:{'\n'}
                    {'   cd D:\\POS\\server && node index.js'}{'\n\n'}
                    2. Check your PC IP (run ipconfig){'\n'}
                    {'   then update lib/config.ts'}{'\n\n'}
                    3. Allow port 3000 in Windows Firewall{'\n\n'}
                    4. Phone & PC must be on same WiFi
                  </Text>
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },

  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(99,102,241,0.13)' },

  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 12 },

  /* Branding */
  brandSection: { alignItems: 'center', marginBottom: 28, gap: 16 },

  logoOuter: {
    shadowColor: '#6366F1', shadowOpacity: 0.6, shadowRadius: 32, shadowOffset: { width: 0, height: 6 },
    elevation: 18,
  },
  logoBox: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBoxText: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  logoGlowRing: {
    position: 'absolute', top: -10, left: -10, right: -10, bottom: -10,
    borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.28)',
  },

  brandTextWrap: { alignItems: 'center', gap: 6 },
  brandTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  brandSub:   { color: 'rgba(255,255,255,0.45)', fontSize: 14, letterSpacing: 0.3 },

  /* Card */
  card: {
    backgroundColor: '#14123A',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    gap: 16,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  /* Server row */
  serverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 12,
  },
  serverInfo: { flex: 1 },
  serverLabel: { fontSize: 9, color: '#6B7280', fontWeight: '700', letterSpacing: 0.8, marginBottom: 3 },
  serverUrl:   { fontSize: 12, color: '#D1D5DB', fontWeight: '500' },
  testBtn:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', minWidth: 80, alignItems: 'center' },
  testBtnOk:   { backgroundColor: 'rgba(16,185,129,0.15)' },
  testBtnFail: { backgroundColor: 'rgba(239,68,68,0.15)' },
  testBtnText: { fontSize: 12, fontWeight: '700' },

  /* Error */
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 12, padding: 12 },
  errorText: { color: '#FCA5A5', fontSize: 13, flex: 1 },

  /* Inputs */
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, color: '#6B7280', fontWeight: '700', letterSpacing: 0.8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    transition: 'border-color 0.2s',
  } as any,
  inputRowFocused: {
    borderColor: 'rgba(99,102,241,0.55)',
    backgroundColor: 'rgba(99,102,241,0.07)',
  },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, color: '#F9FAFB', fontSize: 15, paddingVertical: 14 },
  eyeBtn:    { padding: 6 },

  /* Sign In */
  signInGradient: {
    paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  /* Hint */
  hintBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginTop: 16, backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  hintTitle: { color: '#FCD34D', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  hintBody:  { color: '#FDE68A', fontSize: 11, lineHeight: 19 },
});
