import { Tabs, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/context/AuthContext';

function AnimatedTabIcon({ name, focusedName, color, focused }: {
  name: string; focusedName: string; color: string; focused: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevFocused = useRef(false);

  useEffect(() => {
    if (focused && !prevFocused.current) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 28, bounciness: 14 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
      ]).start();
    }
    prevFocused.current = focused;
  }, [focused, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={(focused ? focusedName : name) as any} size={22} color={color} />
    </Animated.View>
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

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

  const tabBarHeight = 56 + insets.bottom;

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
          shadowColor: '#6366F1',
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="home-outline" focusedName="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="cart-outline" focusedName="cart" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="receipt-outline" focusedName="receipt" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="cube-outline" focusedName="cube" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="grid-outline" focusedName="grid" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
