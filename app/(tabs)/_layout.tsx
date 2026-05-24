import { Tabs, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator, Animated, Dimensions,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '@/context/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');

/* ── Tab definitions ──────────────────────────── */
const TABS = [
  { key: 'home',      icon: 'home-outline'       as const, iconFocused: 'home'       as const, label: 'Home'      },
  { key: 'index',     icon: 'storefront-outline'  as const, iconFocused: 'storefront'  as const, label: 'POS', special: true },
  { key: 'explore',   icon: 'receipt-outline'     as const, iconFocused: 'receipt'     as const, label: 'Sales'     },
  { key: 'inventory', icon: 'cube-outline'         as const, iconFocused: 'cube'         as const, label: 'Inventory' },
  { key: 'more',      icon: 'grid-outline'         as const, iconFocused: 'grid'         as const, label: 'More'      },
];

const PRIMARY    = '#6366F1';
const INACTIVE   = '#9CA3AF';
const TAB_BAR_H  = 64;
const TAB_W      = SCREEN_W / TABS.length;
const PILL_W     = TAB_W - 16;

/* ══════════════════════════════════════════════════
   Custom Animated Tab Bar
══════════════════════════════════════════════════ */
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  /* Mount: slide up from bottom */
  const slideY = useRef(new Animated.Value(TAB_BAR_H + 40)).current;
  useEffect(() => {
    Animated.spring(slideY, {
      toValue: 0, tension: 55, friction: 12, useNativeDriver: true,
    }).start();
  }, []);

  /* Per-tab icon scale animations */
  const scales = useRef(
    TABS.map((_, i) => new Animated.Value(i === state.index ? 1 : 0.82))
  ).current;

  /* Per-tab label opacity */
  const labelOps = useRef(
    TABS.map((_, i) => new Animated.Value(i === state.index ? 1 : 0.45))
  ).current;

  /* Sliding indicator: full-width background pill that moves between tabs */
  const indicatorX = useRef(new Animated.Value(state.index * TAB_W + 8)).current;
  const indicatorOp = useRef(new Animated.Value(state.index === 1 ? 0 : 1)).current;

  /* POS button pulse glow */
  const posGlow = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(posGlow, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(posGlow, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    const idx = state.index;
    const isSpecial = TABS[idx]?.special ?? false;

    /* Slide indicator to new tab (hide when POS active) */
    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: idx * TAB_W + 8,
        tension: 70, friction: 12, useNativeDriver: true,
      }),
      Animated.timing(indicatorOp, {
        toValue: isSpecial ? 0 : 1, duration: 160, useNativeDriver: true,
      }),
    ]).start();

    /* Scale and label for each tab */
    TABS.forEach((_, i) => {
      const focused = i === idx;
      Animated.parallel([
        Animated.spring(scales[i], {
          toValue: focused ? 1 : 0.82, tension: 80, friction: 9, useNativeDriver: true,
        }),
        Animated.timing(labelOps[i], {
          toValue: focused ? 1 : 0.45, duration: 180, useNativeDriver: true,
        }),
      ]).start();
    });
  }, [state.index]);

  const totalH = TAB_BAR_H + insets.bottom;

  return (
    <Animated.View style={[tb.wrapper, { height: totalH, transform: [{ translateY: slideY }] }]}>
      {/* Floating card */}
      <View style={tb.card}>

        {/* Sliding background indicator */}
        <Animated.View
          style={[
            tb.indicator,
            { width: PILL_W, opacity: indicatorOp, transform: [{ translateX: indicatorX }] },
          ]}
        />

        {TABS.map((tab, index) => {
          const focused = state.index === index;
          const color   = focused ? PRIMARY : INACTIVE;

          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const event = navigation.emit({
              type: 'tabPress',
              target: state.routes[index].key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(state.routes[index].name);
            }
          };

          /* ── POS: special raised gradient button ── */
          if (tab.special) {
            return (
              <TouchableOpacity
                key={tab.key}
                style={tb.specialWrap}
                onPress={onPress}
                activeOpacity={0.85}
              >
                {/* Glow ring */}
                <Animated.View style={[tb.posGlowRing, { transform: [{ scale: posGlow }], opacity: focused ? 0 : 0.55 }]} />

                <LinearGradient
                  colors={focused ? ['#4F46E5', '#7C3AED'] : ['#6366F1', '#8B5CF6']}
                  style={[tb.posBtn, focused && tb.posBtnActive]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <Animated.View style={{ transform: [{ scale: scales[index] }] }}>
                    <Ionicons name={focused ? tab.iconFocused : tab.icon} size={24} color="#fff" />
                  </Animated.View>
                </LinearGradient>

                <Animated.Text style={[tb.specialLabel, { opacity: labelOps[index], color: focused ? PRIMARY : INACTIVE }]}>
                  {tab.label}
                </Animated.Text>
              </TouchableOpacity>
            );
          }

          /* ── Regular tab ── */
          return (
            <TouchableOpacity
              key={tab.key}
              style={tb.tab}
              onPress={onPress}
              activeOpacity={0.75}
            >
              <Animated.View style={[tb.iconWrap, { transform: [{ scale: scales[index] }] }]}>
                <Ionicons name={focused ? tab.iconFocused : tab.icon} size={22} color={color} />
              </Animated.View>
              <Animated.Text style={[tb.label, { color, opacity: labelOps[index] }]}>
                {tab.label}
              </Animated.Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Safe area spacer */}
      {insets.bottom > 0 && <View style={{ height: insets.bottom, backgroundColor: '#fff' }} />}
    </Animated.View>
  );
}

/* ── Styles ── */
const tb = StyleSheet.create({
  wrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'transparent',
  },
  card: {
    height: TAB_BAR_H,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 0,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  indicator: {
    position: 'absolute',
    top: 8, height: TAB_BAR_H - 16,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
  },
  tab: {
    flex: 1, height: TAB_BAR_H,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  iconWrap: {
    width: 44, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.2,
  },

  /* POS special button */
  specialWrap: {
    flex: 1, height: TAB_BAR_H + 12,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 6,
    marginTop: -12,
    zIndex: 10,
  },
  posGlowRing: {
    position: 'absolute', top: 2,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(99,102,241,0.18)',
  },
  posBtn: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1', shadowOpacity: 0.5,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  posBtnActive: { shadowOpacity: 0.7 },
  specialLabel: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.2, marginTop: 2,
  },
});

/* ══════════════════════════════════════════════════
   Root Tab Navigator
══════════════════════════════════════════════════ */
export default function TabLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C0A2E' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }
  if (!user) return null;

  return (
    <Tabs
      initialRouteName="home"
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home"      options={{ title: 'Home'      }} />
      <Tabs.Screen name="index"     options={{ title: 'POS'       }} />
      <Tabs.Screen name="explore"   options={{ title: 'Sales'     }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="more"      options={{ title: 'More'      }} />
    </Tabs>
  );
}
