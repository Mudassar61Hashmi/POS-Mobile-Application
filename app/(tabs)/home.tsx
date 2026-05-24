import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  RefreshControl,
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
import { apiFetch } from '@/lib/api';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 32 - 30) / 4;

type Stats        = { totalRevenue: number; totalTransactions: number; averageOrderValue: number };
type WeekStats    = Stats & { topProducts?: TopProduct[] };
type TopProduct   = { name: string; totalQty: number; totalRevenue: number };
type SaleRow      = { id: string; invoiceNumber: string; customerName: string; total: number; status: string; timestamp: string; paymentMethod?: string };
type LowItem      = { _id: string; name: string; quantity: number; lowStockThreshold?: number };
type DayBar       = { label: string; revenue: number; isToday: boolean };
type PayBreakdown = { method: string; count: number; revenue: number };

const PAY_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444'];

function normalizeMethod(m?: string): string {
  if (!m || m === 'cash') return 'Cash';
  if (m === 'card' || m === 'card_credit' || m === 'card_debit') return 'Card';
  if (['mobile_wallet','jazzcash','easypaisa','sadapay','nayapay'].includes(m)) return 'Mobile Wallet';
  if (m === 'bank_transfer') return 'Bank Transfer';
  return m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ');
}

const STATUS_COLOR: Record<string, string> = {
  completed: '#10B981', pending: '#F59E0B', processing: '#6366F1',
  cancelled: '#EF4444', refunded: '#8B5CF6',
};

const QUICK_ACTIONS = [
  { label: 'Customers', icon: 'people',          route: '/customers',   color: '#6366F1', bg: '#EEF2FF' },
  { label: 'Orders',    icon: 'receipt',          route: '/orders',      color: '#8B5CF6', bg: '#F5F3FF' },
  { label: 'Payments',  icon: 'card',             route: '/payments',    color: '#06B6D4', bg: '#ECFEFF' },
  { label: 'Taxes',     icon: 'calculator',       route: '/taxes',       color: '#10B981', bg: '#ECFDF5' },
  { label: 'Coupons',   icon: 'pricetag',         route: '/coupons',     color: '#F59E0B', bg: '#FFFBEB' },
  { label: 'Users',     icon: 'person-circle',    route: '/users',       color: '#6B7280', bg: '#F9FAFB' },
  { label: 'Data',      icon: 'server',           route: '/datamanager', color: '#8B5CF6', bg: '#F5F3FF' },
  { label: 'Settings',  icon: 'settings-outline', route: '/settings',    color: '#374151', bg: '#F3F4F6' },
] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [stats, setStats]               = useState<Stats | null>(null);
  const [weekStats, setWeekStats]       = useState<WeekStats | null>(null);
  const [recentSales, setRecentSales]   = useState<SaleRow[]>([]);
  const [lowStock, setLowStock]         = useState<LowItem[]>([]);
  const [stockLevels, setStockLevels]   = useState<LowItem[]>([]);
  const [paymentData, setPaymentData]   = useState<PayBreakdown[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [weekBars, setWeekBars]         = useState<DayBar[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 6);
      const sevenDaysAgo = d7.toISOString().split('T')[0];

      const [todayRes, weekRes, salesRes, productsRes, custRes] = await Promise.all([
        apiFetch(`/api/sales/reports/summary?from=${today}&to=${today}`),
        apiFetch(`/api/sales/reports/summary?from=${sevenDaysAgo}&to=${today}`),
        apiFetch('/api/sales?limit=300'),
        apiFetch('/api/products'),
        apiFetch('/api/customers'),
      ]);

      if (todayRes.ok) setStats(await todayRes.json());
      if (weekRes.ok)  setWeekStats(await weekRes.json());

      if (salesRes.ok) {
        const all: SaleRow[] = await salesRes.json();
        const list = Array.isArray(all) ? all : [];
        setRecentSales(list.slice(0, 6));

        const bars: DayBar[] = [];
        for (let i = 6; i >= 0; i--) {
          const day = new Date();
          day.setDate(day.getDate() - i);
          const dateStr  = day.toISOString().split('T')[0];
          const dayLabel = day.toLocaleDateString('en-US', { weekday: 'short' });
          const revenue  = list
            .filter(s => s.timestamp?.slice(0, 10) === dateStr && s.status !== 'cancelled')
            .reduce((sum, s) => sum + (s.total ?? 0), 0);
          bars.push({ label: dayLabel, revenue, isToday: dateStr === today });
        }
        setWeekBars(bars);

        // Payment method breakdown
        const payMap: Record<string, { count: number; revenue: number }> = {};
        list.forEach(s => {
          if (s.status === 'cancelled') return;
          const m = normalizeMethod(s.paymentMethod);
          if (!payMap[m]) payMap[m] = { count: 0, revenue: 0 };
          payMap[m].count++;
          payMap[m].revenue += s.total ?? 0;
        });
        setPaymentData(
          Object.entries(payMap)
            .map(([method, d]) => ({ method, ...d }))
            .sort((a, b) => b.count - a.count)
        );
      }

      if (productsRes.ok) {
        const products: LowItem[] = await productsRes.json();
        const pList = Array.isArray(products) ? products : [];
        setProductCount(pList.length);
        setLowStock(pList.filter(p => p.quantity <= (p.lowStockThreshold ?? 10)).slice(0, 8));
        // Stock levels widget: 8 lowest-stock items
        setStockLevels([...pList].sort((a, b) => a.quantity - b.quantity).slice(0, 8));
      }

      if (custRes.ok) {
        const c = await custRes.json();
        setCustomerCount(Array.isArray(c) ? c.length : 0);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [today]);

  useEffect(() => {
    load();
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [load]);

  const roleColor: Record<string, string> = {
    superadmin: '#8B5CF6', admin: '#6366F1', manager: '#10B981', cashier: '#F59E0B',
  };

  const maxBar     = Math.max(...weekBars.map(b => b.revenue), 1);
  const topProds   = weekStats?.topProducts?.slice(0, 5) ?? [];
  const maxProdQty = topProds[0]?.totalQty ?? 1;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366F1" />}
        >
          {/* ─── Header ─────────────────────────────── */}
          <LinearGradient colors={['#0C0A2E', '#17105C']} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={s.blob1} />
            <View style={s.blob2} />

            <View style={s.headerTop}>
              <View>
                <Text style={s.greetText}>{greeting()}</Text>
                <Text style={s.userName}>{user?.name || user?.username}</Text>
              </View>
              <View style={s.headerRight}>
                <View style={[s.rolePill, { backgroundColor: roleColor[user?.role || ''] || '#6366F1' }]}>
                  <Text style={s.roleText}>{(user?.role || '').toUpperCase()}</Text>
                </View>
                <LinearGradient colors={['#6366F1', '#8B5CF6']} style={s.avatar}>
                  <Text style={s.avatarText}>{(user?.name || user?.username || 'U').charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              </View>
            </View>

            <Text style={s.dateText}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>

            {/* Today's Revenue hero */}
            <View style={s.heroCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroLabel}>Today's Revenue</Text>
                {loading
                  ? <ActivityIndicator color="#6366F1" style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                  : <Text style={s.heroValue}>${(stats?.totalRevenue ?? 0).toFixed(2)}</Text>}
                <Text style={s.heroSub}>Completed sales today</Text>
              </View>
              <View style={s.heroIcon}>
                <Ionicons name="trending-up" size={28} color="#6366F1" />
              </View>
            </View>

            {/* 4 mini stat chips */}
            <View style={s.chipRow}>
              <StatChip icon="swap-horizontal-outline" label="Tx Today"  value={loading ? '·' : String(stats?.totalTransactions ?? 0)} />
              <StatChip icon="people-outline"          label="Customers" value={loading ? '·' : String(customerCount)} />
              <StatChip icon="cube-outline"            label="Products"  value={loading ? '·' : String(productCount)} />
              <StatChip icon="warning-outline"         label="Low Stock" value={loading ? '·' : String(lowStock.length)} warn={lowStock.length > 0} />
            </View>
          </LinearGradient>

          {/* ─── POS Terminal Launch ────────────────── */}
          <TouchableOpacity activeOpacity={0.88} style={s.posWrap} onPress={() => router.navigate('/(tabs)' as any)}>
            <LinearGradient
              colors={['#0C0A2E', '#17105C', '#2D1B69']}
              style={s.posCard}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={s.posBlob} />
              <LinearGradient colors={['#6366F1', '#8B5CF6']} style={s.posIconBox}>
                <Ionicons name="cart" size={26} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={s.posTitle}>Open POS Terminal</Text>
                <Text style={s.posSub}>Tap to start selling</Text>
              </View>
              <View style={s.posArrowBox}>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* ─── 7-Day KPI cards ────────────────────── */}
          <View style={s.kpiRow}>
            <View style={[s.kpiCard, { borderTopColor: '#6366F1' }]}>
              <Text style={s.kpiLabel}>7-Day Revenue</Text>
              <Text style={[s.kpiVal, { color: '#6366F1' }]}>
                {loading ? '—' : `$${((weekStats?.totalRevenue ?? 0) >= 1000
                  ? ((weekStats?.totalRevenue ?? 0) / 1000).toFixed(1) + 'k'
                  : (weekStats?.totalRevenue ?? 0).toFixed(0))}`}
              </Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: '#10B981' }]}>
              <Text style={s.kpiLabel}>7-Day Sales</Text>
              <Text style={[s.kpiVal, { color: '#10B981' }]}>
                {loading ? '—' : String(weekStats?.totalTransactions ?? 0)}
              </Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: '#8B5CF6' }]}>
              <Text style={s.kpiLabel}>Avg Order</Text>
              <Text style={[s.kpiVal, { color: '#8B5CF6' }]}>
                {loading ? '—' : `$${(stats?.averageOrderValue ?? 0).toFixed(0)}`}
              </Text>
            </View>
          </View>

          {/* ─── 7-Day Bar Chart ────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Revenue Trend</Text>
              <Text style={s.sectionBadge}>7 days</Text>
            </View>
            <View style={s.chartCard}>
              {loading ? (
                <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator color="#6366F1" />
                </View>
              ) : (
                <View style={s.barChart}>
                  {weekBars.map((bar, i) => {
                    const barH = Math.max((bar.revenue / maxBar) * 80, bar.revenue > 0 ? 8 : 4);
                    return (
                      <View key={i} style={s.barCol}>
                        {bar.revenue > 0 && (
                          <Text style={s.barValTxt}>
                            {bar.revenue >= 1000
                              ? `$${(bar.revenue / 1000).toFixed(1)}k`
                              : `$${bar.revenue.toFixed(0)}`}
                          </Text>
                        )}
                        <View style={[s.bar, { height: barH }, bar.isToday ? s.barToday : s.barOther]} />
                        <Text style={[s.barLbl, bar.isToday && s.barLblToday]}>{bar.label}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={s.chartLegend}>
                <View style={[s.legendDot, { backgroundColor: '#6366F1' }]} />
                <Text style={s.legendTxt}>Today</Text>
                <View style={[s.legendDot, { backgroundColor: '#C7D2FE', marginLeft: 12 }]} />
                <Text style={s.legendTxt}>Previous days</Text>
              </View>
            </View>
          </View>

          {/* ─── Top Products ───────────────────────── */}
          {topProds.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Top Products</Text>
                <Text style={s.sectionBadge}>7 days</Text>
              </View>
              <View style={s.chartCard}>
                {topProds.map((p, i) => (
                  <View key={i} style={[s.prodRow, i === topProds.length - 1 && { marginBottom: 0 }]}>
                    <View style={[s.prodRank, { backgroundColor: i === 0 ? '#FEF3C7' : '#F3F4F6' }]}>
                      <Text style={[s.prodRankTxt, { color: i === 0 ? '#D97706' : '#9CA3AF' }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text style={s.prodName} numberOfLines={1}>{p.name}</Text>
                        <Text style={s.prodSold}>{p.totalQty} sold</Text>
                      </View>
                      <View style={s.progBg}>
                        <View style={[
                          s.progFill,
                          {
                            width: `${Math.max((p.totalQty / maxProdQty) * 100, 5)}%` as any,
                            backgroundColor: i === 0 ? '#6366F1' : i === 1 ? '#8B5CF6' : '#A5B4FC',
                          },
                        ]} />
                      </View>
                    </View>
                    <Text style={s.prodRev}>${p.totalRevenue.toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ─── Low Stock Alerts ───────────────────── */}
          {!loading && lowStock.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={s.alertDot} />
                  <Text style={[s.sectionTitle, { marginBottom: 0 }]}>Low Stock Alerts</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(tabs)/inventory')}>
                  <Text style={s.seeAll}>Manage →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -16 }}
                contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}
              >
                {lowStock.map(item => (
                  <View key={item._id} style={[s.lowCard, item.quantity <= 0 && { borderColor: '#FECACA' }]}>
                    <View style={[s.lowIconWrap, { backgroundColor: item.quantity <= 0 ? '#FEF2F2' : '#FFFBEB' }]}>
                      <Ionicons
                        name={item.quantity <= 0 ? 'alert-circle' : 'warning-outline'}
                        size={16}
                        color={item.quantity <= 0 ? '#EF4444' : '#F59E0B'}
                      />
                    </View>
                    <Text style={s.lowName} numberOfLines={2}>{item.name}</Text>
                    <Text style={[s.lowQty, { color: item.quantity <= 0 ? '#EF4444' : '#F59E0B' }]}>
                      {item.quantity <= 0 ? 'Out of stock' : `Qty: ${item.quantity}`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ─── Quick Actions ──────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Quick Actions</Text>
            <View style={s.actionsGrid}>
              {QUICK_ACTIONS.map(item => (
                <TouchableOpacity
                  key={item.route}
                  style={[s.actionCard, { width: CARD_W }]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.75}
                >
                  <View style={[s.actionIconWrap, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <Text style={s.actionLabel} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ─── Recent Sales ───────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Recent Sales</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
                <Text style={s.seeAll}>See All →</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={s.emptyState}><ActivityIndicator color="#6366F1" /></View>
            ) : recentSales.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="receipt-outline" size={36} color="#D1D5DB" />
                <Text style={s.emptyText}>No sales yet today</Text>
              </View>
            ) : recentSales.map(sale => (
              <View key={sale.id} style={s.saleCard}>
                <View style={[s.saleBar, { backgroundColor: STATUS_COLOR[sale.status] || '#6B7280' }]} />
                <View style={s.saleBody}>
                  <View>
                    <Text style={s.saleInvoice}>{sale.invoiceNumber}</Text>
                    <Text style={s.saleCustomer}>{sale.customerName}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.saleAmt}>${sale.total.toFixed(2)}</Text>
                    <Text style={s.saleTime}>
                      {new Date(sale.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* ─── Stock Levels ───────────────────────── */}
          {stockLevels.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Stock Levels</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/inventory')}>
                  <Text style={s.seeAll}>Manage →</Text>
                </TouchableOpacity>
              </View>
              <View style={s.chartCard}>
                {stockLevels.map((item, i) => {
                  const maxQ   = Math.max(...stockLevels.map(p => p.quantity), 1);
                  const thresh = item.lowStockThreshold ?? 10;
                  const color  = item.quantity <= 0 ? '#EF4444'
                               : item.quantity <= thresh ? '#EF4444'
                               : item.quantity <= thresh * 2 ? '#F59E0B'
                               : '#10B981';
                  const pct = Math.max((item.quantity / maxQ) * 100, item.quantity > 0 ? 3 : 1);
                  return (
                    <View key={item._id} style={[s.stockRow, i === stockLevels.length - 1 && { marginBottom: 0 }]}>
                      <Text style={s.stockName} numberOfLines={1}>{item.name}</Text>
                      <View style={[s.progBg, { flex: 1, marginHorizontal: 10 }]}>
                        <View style={[s.progFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.stockQty, { color }]}>{item.quantity}</Text>
                    </View>
                  );
                })}
                <View style={[s.chartLegend, { marginTop: 12 }]}>
                  <View style={[s.legendDot, { backgroundColor: '#EF4444' }]} /><Text style={s.legendTxt}>Critical</Text>
                  <View style={[s.legendDot, { backgroundColor: '#F59E0B', marginLeft: 12 }]} /><Text style={s.legendTxt}>Low</Text>
                  <View style={[s.legendDot, { backgroundColor: '#10B981', marginLeft: 12 }]} /><Text style={s.legendTxt}>OK</Text>
                </View>
              </View>
            </View>
          )}

          {/* ─── Payment Methods ────────────────────── */}
          {paymentData.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Payment Methods</Text>
              <View style={s.chartCard}>
                {paymentData.map((p, i) => {
                  const maxCount = paymentData[0].count;
                  const color    = PAY_COLORS[i % PAY_COLORS.length];
                  const pct      = Math.max((p.count / maxCount) * 100, 4);
                  return (
                    <View key={p.method} style={[s.payRow, i === paymentData.length - 1 && { marginBottom: 0 }]}>
                      <View style={[s.payDot, { backgroundColor: color }]} />
                      <Text style={s.payMethod}>{p.method}</Text>
                      <View style={[s.progBg, { flex: 1, marginHorizontal: 10 }]}>
                        <View style={[s.progFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                      </View>
                      <Text style={s.payStat}>{p.count} tx</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

function StatChip({ icon, label, value, warn }: { icon: string; label: string; value: string; warn?: boolean }) {
  return (
    <View style={[s.chip, warn && { borderColor: 'rgba(245,158,11,0.4)' }]}>
      <Ionicons name={icon as any} size={12} color={warn ? '#FBBF24' : 'rgba(255,255,255,0.65)'} />
      <Text style={[s.chipVal, warn && { color: '#FBBF24' }]}>{value}</Text>
      <Text style={s.chipLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F0FA' },

  /* Header */
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, overflow: 'hidden' },
  blob1:  { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(99,102,241,0.14)', top: -80, right: -60 },
  blob2:  { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(139,92,246,0.1)', bottom: -30, left: 30 },

  headerTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  greetText:  { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 2 },
  userName:   { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  rolePill:   { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  roleText:   { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  avatar:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  dateText:   { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 16 },

  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 14,
  },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 },
  heroValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1.5 },
  heroSub:   { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 },
  heroIcon:  { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center' },

  /* Stat chips in header */
  chipRow:   { flexDirection: 'row', gap: 7 },
  chip:      { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 9, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipVal:   { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  chipLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

  /* KPI row */
  kpiRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  kpiCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderTopWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  kpiLabel: { fontSize: 9, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  kpiVal:   { fontSize: 18, fontWeight: '800', color: '#111827' },

  /* Sections */
  section:     { paddingHorizontal: 16, paddingTop: 22 },
  sectionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle:{ fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 14 },
  sectionBadge:{ fontSize: 11, color: '#6366F1', fontWeight: '700', backgroundColor: '#EEF2FF', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  seeAll:      { fontSize: 13, color: '#6366F1', fontWeight: '600' },

  /* Chart card */
  chartCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  /* Bar chart */
  barChart:    { flexDirection: 'row', alignItems: 'flex-end', height: 120 },
  barCol:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  barValTxt:   { fontSize: 7, color: '#9CA3AF', fontWeight: '600', textAlign: 'center' },
  bar:         { width: '65%', borderRadius: 5 },
  barToday:    { backgroundColor: '#6366F1' },
  barOther:    { backgroundColor: '#C7D2FE' },
  barLbl:      { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  barLblToday: { color: '#6366F1', fontWeight: '800' },
  chartLegend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendTxt:   { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginLeft: 4 },

  /* Top products */
  prodRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  prodRank:   { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  prodRankTxt:{ fontSize: 12, fontWeight: '800' },
  prodName:   { fontSize: 13, fontWeight: '700', color: '#111827', flex: 1 },
  prodSold:   { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  prodRev:    { fontSize: 12, fontWeight: '700', color: '#6366F1', width: 50, textAlign: 'right' },
  progBg:     { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  progFill:   { height: '100%', borderRadius: 3 },

  /* Low stock */
  alertDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' },
  lowCard:     { width: 108, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#FDE68A', shadowColor: '#F59E0B', shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
  lowIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lowName:     { fontSize: 11, fontWeight: '700', color: '#111827', textAlign: 'center' },
  lowQty:      { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  /* Stock levels */
  stockRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stockName: { fontSize: 12, fontWeight: '600', color: '#374151', width: 90 },
  stockQty:  { fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right' },

  /* Payment methods */
  payRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  payDot:    { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  payMethod: { fontSize: 12, fontWeight: '700', color: '#374151', width: 90, marginLeft: 8 },
  payStat:   { fontSize: 11, color: '#6B7280', fontWeight: '600', width: 36, textAlign: 'right' },

  /* Quick actions */
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard:   { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  actionIconWrap:{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 10, fontWeight: '700', color: '#374151', textAlign: 'center' },

  /* Recent sales */
  saleCard:    { backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 8, flexDirection: 'row', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  saleBar:     { width: 4 },
  saleBody:    { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  saleInvoice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  saleCustomer:{ fontSize: 11, color: '#6B7280', marginTop: 2 },
  saleAmt:     { fontSize: 15, fontWeight: '800', color: '#6366F1' },
  saleTime:    { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  emptyState:  { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyText:   { color: '#9CA3AF', fontSize: 14 },

  /* POS Terminal card */
  posWrap: { marginHorizontal: 14, marginTop: 14, marginBottom: 4, borderRadius: 20, shadowColor: '#0C0A2E', shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  posCard: {
    borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  posBlob:    { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(99,102,241,0.2)', right: -40, top: -70 },
  posIconBox: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  posTitle:   { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  posSub:     { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 },
  posArrowBox:{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
