import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [connStatus, setConnStatus]     = useState<'idle' | 'ok' | 'fail'>('idle');
  const [connTesting, setConnTesting]   = useState(false);

  const testConnection = async () => {
    setConnTesting(true);
    setConnStatus('idle');
    try {
      const r = await apiFetch('/api/health');
      setConnStatus(r.ok ? 'ok' : 'fail');
    } catch {
      setConnStatus('fail');
    } finally {
      setConnTesting(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    setLoading(true);
    setError('');
    const err = await login(username.trim(), password.trim());
    setLoading(false);
    if (err) { setError(err); return; }
    router.replace('/(tabs)/home');
  };

  const connLabel = connStatus === 'ok' ? '✓ Connected' : connStatus === 'fail' ? '✗ Failed' : 'Test';
  const connColor = connStatus === 'ok' ? '#10B981' : connStatus === 'fail' ? '#EF4444' : '#9CA3AF';

  return (
    <LinearGradient
      colors={['#0C0A2E', '#17105C', '#0C0A2E']}
      style={styles.gradient}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Decorative blobs */}
        <View style={[styles.blob, { top: -80, right: -60, width: 240, height: 240 }]} />
        <View style={[styles.blob, { bottom: 80, left: -80, width: 180, height: 180, opacity: 0.06 }]} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Branding */}
            <View style={styles.brandSection}>
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                style={styles.logoBox}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Text style={styles.logoBoxText}>POS</Text>
              </LinearGradient>
              <Text style={styles.brandTitle}>POS Terminal</Text>
              <Text style={styles.brandSub}>Sign in to your account</Text>
            </View>

            {/* Card */}
            <View style={styles.card}>
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
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={18} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter username or email"
                    placeholderTextColor="#4B5563"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Password input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={18} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Enter password"
                    placeholderTextColor="#4B5563"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign in button */}
              <TouchableOpacity
                style={[styles.signInBtn, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#6366F1', '#8B5CF6']}
                  style={styles.signInGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Text style={styles.signInText}>Sign In</Text>
                        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.8)" />
                      </>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Connection fail hint */}
            {connStatus === 'fail' && (
              <View style={styles.hintBox}>
                <Ionicons name="information-circle-outline" size={16} color="#FCD34D" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hintTitle}>Cannot reach {API_BASE}</Text>
                  <Text style={styles.hintBody}>
                    1. Start the server on your PC:{'\n'}
                    {'   cd D:\\POS\\server && node index.js'}{'\n\n'}
                    2. Check your PC IP hasn't changed:{'\n'}
                    {'   ipconfig  →  update lib/config.ts'}{'\n\n'}
                    3. Allow port 3000 in Windows Firewall{'\n\n'}
                    4. Phone & PC must be on same WiFi{'\n'}
                    {'   (adb reverse only needed for USB)'}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },

  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(99,102,241,0.12)' },

  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 16 },

  /* Branding */
  brandSection: { alignItems: 'center', marginBottom: 32, gap: 10 },
  logoBox: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logoBoxText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  brandTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  brandSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 14 },

  /* Card */
  card: {
    backgroundColor: '#14123A',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.22)',
    gap: 16,
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

  /* Input fields */
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, color: '#6B7280', fontWeight: '700', letterSpacing: 0.8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 8 },
  input:    { flex: 1, color: '#F9FAFB', fontSize: 15, paddingVertical: 14 },
  eyeBtn:   { padding: 6 },

  /* Sign In */
  signInBtn:      { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  signInGradient: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signInText:     { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  /* Hint */
  hintBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginTop: 16,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  hintTitle: { color: '#FCD34D', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  hintBody:  { color: '#FDE68A', fontSize: 11, lineHeight: 19 },
});
