import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

type MenuItem = {
  label: string;
  sub: string;
  icon: string;
  route: string;
  color: string;
  bg: string;
};

const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Sales & Customers',
    items: [
      { label: 'Customers',  sub: 'Manage customer profiles',  icon: 'people',       route: '/customers',   color: '#6366F1', bg: '#EEF2FF' },
      { label: 'Orders',     sub: 'View & manage orders',      icon: 'receipt',      route: '/orders',      color: '#8B5CF6', bg: '#F5F3FF' },
      { label: 'Payments',   sub: 'Payment methods & history', icon: 'card',         route: '/payments',    color: '#06B6D4', bg: '#ECFEFF' },
      { label: 'Coupons',    sub: 'Discount codes & offers',   icon: 'pricetag',     route: '/coupons',     color: '#F59E0B', bg: '#FFFBEB' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Taxes',        sub: 'Tax rates & rules',        icon: 'calculator',       route: '/taxes',       color: '#10B981', bg: '#ECFDF5' },
      { label: 'Users',        sub: 'Staff accounts & roles',   icon: 'person-circle',    route: '/users',       color: '#6B7280', bg: '#F9FAFB' },
      { label: 'Data Manager', sub: 'Import & export data',     icon: 'server',           route: '/datamanager', color: '#8B5CF6', bg: '#F5F3FF' },
      { label: 'Settings',     sub: 'App & store settings',     icon: 'settings-outline', route: '/settings',    color: '#374151', bg: '#F3F4F6' },
    ],
  },
];

export default function MoreScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () =>
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => { await logout(); router.replace('/login'); },
      },
    ]);

  const roleColor: Record<string, string> = {
    superadmin: '#8B5CF6', admin: '#6366F1', manager: '#10B981', cashier: '#F59E0B',
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={['#0C0A2E', '#17105C']}
        style={s.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={s.headerBlob} />
        <View style={s.headerContent}>
          <View>
            <Text style={s.headerTitle}>More</Text>
            <Text style={s.headerSub}>Manage your store</Text>
          </View>
          <LinearGradient colors={['#6366F1', '#8B5CF6']} style={s.avatar}>
            <Text style={s.avatarText}>{(user?.name || user?.username || 'U').charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Account card */}
        <View style={s.accountCard}>
          <LinearGradient colors={['#6366F1', '#8B5CF6']} style={s.accountAvatar}>
            <Text style={s.accountAvatarText}>{(user?.name || user?.username || 'U').charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={s.accountName}>{user?.name || user?.username}</Text>
            <Text style={s.accountHandle}>@{user?.username}</Text>
          </View>
          <View style={[s.roleBadge, { backgroundColor: (roleColor[user?.role || ''] || '#6366F1') + '22' }]}>
            <Text style={[s.roleText, { color: roleColor[user?.role || ''] || '#6366F1' }]}>
              {(user?.role || '').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Menu sections */}
        {MENU_SECTIONS.map(section => (
          <View key={section.title} style={s.sectionWrap}>
            <Text style={s.sectionLabel}>{section.title}</Text>
            <View style={s.menuGroup}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.route}
                  style={[
                    s.menuRow,
                    idx < section.items.length - 1 && s.menuRowBorder,
                  ]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[s.menuIconWrap, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuLabel}>{item.label}</Text>
                    <Text style={s.menuSub}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={s.version}>POS Terminal · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F0FA' },

  /* Header */
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, overflow: 'hidden' },
  headerBlob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(99,102,241,0.14)', top: -80, right: -50 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  avatar:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#fff', fontWeight: '800', fontSize: 16 },

  body: { padding: 16, paddingBottom: 32, gap: 16 },

  /* Account card */
  accountCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  accountAvatar:     { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  accountName:       { fontSize: 15, fontWeight: '700', color: '#111827' },
  accountHandle:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  roleBadge:         { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  roleText:          { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  /* Menu sections */
  sectionWrap:  {},
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, paddingLeft: 4 },
  menuGroup:    { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  menuRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  menuRowBorder:{ borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  menuIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  menuLabel:    { fontSize: 14, fontWeight: '700', color: '#111827' },
  menuSub:      { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  /* Logout */
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#FECACA',
  },
  logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },

  version: { textAlign: 'center', fontSize: 11, color: '#D1D5DB', marginTop: 4 },
});
