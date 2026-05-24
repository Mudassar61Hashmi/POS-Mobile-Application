import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { apiFetch } from '@/lib/api';

const C = {
  navy: '#0f172a', blue: '#2563eb', green: '#059669', amber: '#d97706',
  red: '#ef4444', bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', muted: '#64748b', light: '#94a3b8',
};

type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';

type OrderItem = { name: string; quantity: number; price: number; subtotal: number };

type Order = {
  _id: string; orderNumber: string; customerName: string;
  customerPhone?: string; items: OrderItem[];
  subtotal: number; tax: number; taxAmount: number;
  discount: number; discountAmount: number; total: number;
  paymentMethod: string; status: OrderStatus;
  note?: string; createdAt: string; servedBy?: { username: string };
};

const STATUS: Record<OrderStatus, { label: string; bg: string; color: string }> = {
  pending:    { label: 'Pending',    bg: '#fef3c7', color: C.amber },
  processing: { label: 'Processing', bg: '#dbeafe', color: C.blue  },
  completed:  { label: 'Completed',  bg: '#d1fae5', color: C.green },
  cancelled:  { label: 'Cancelled',  bg: '#f3f4f6', color: '#6b7280' },
  refunded:   { label: 'Refunded',   bg: '#fee2e2', color: C.red  },
};

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['processing', 'completed', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed:  ['refunded'],
  cancelled:  [],
  refunded:   [],
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
];

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await apiFetch('/api/orders?limit=200');
      if (r.ok) {
        const data = await r.json();
        setOrders(Array.isArray(data) ? data : (data.orders || []));
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter;
    const matchSearch = !search ||
      (o.orderNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleStatusChange = (order: Order, newStatus: OrderStatus) => {
    const transitions = STATUS_TRANSITIONS[order.status] || [];
    if (!transitions.includes(newStatus)) return;

    Alert.alert(
      'Update Status',
      `Change order ${order.orderNumber} to ${STATUS[newStatus].label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', onPress: async () => {
            setUpdating(true);
            try {
              const r = await apiFetch(`/api/orders/${order._id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus }),
              });
              if (r.ok) {
                load();
                setDetailVisible(false);
              } else {
                const d = await r.json().catch(() => ({}));
                Alert.alert('Error', d.message || 'Failed to update status');
              }
            } catch (e: any) { Alert.alert('Error', e.message); }
            finally { setUpdating(false); }
          },
        },
      ]
    );
  };

  const openDetail = (order: Order) => { setSelected(order); setDetailVisible(true); };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0),
  };

  const renderOrder = ({ item: o }: { item: Order }) => {
    const st = STATUS[o.status] || STATUS.pending;
    return (
      <TouchableOpacity style={s.card} onPress={() => openDetail(o)}>
        <View style={s.cardTop}>
          <View>
            <Text style={s.orderNum}>#{o.orderNumber}</Text>
            <Text style={s.customerName}>{o.customerName || 'Walk-in'}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: st.bg }]}>
            <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <View style={s.cardBottom}>
          <Text style={s.cardDate}>{new Date(o.createdAt).toLocaleDateString()} · {o.items.length} item{o.items.length !== 1 ? 's' : ''}</Text>
          <Text style={s.cardTotal}>${o.total.toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Orders</Text>
          <Text style={s.headerSub}>{orders.length} total</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',     value: stats.total,              color: C.text  },
          { label: 'Pending',   value: stats.pending,            color: C.amber },
          { label: 'Done',      value: stats.completed,          color: C.green },
          { label: 'Revenue',   value: `$${stats.revenue.toFixed(0)}`, color: C.blue  },
        ].map(item => (
          <View key={item.label} style={s.statCard}>
            <Text style={[s.statVal, { color: item.color }]}>{item.value}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput style={s.search} value={search} onChangeText={setSearch} placeholder="Search order # or customer..." placeholderTextColor={C.light} />
        {search ? <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}><Text style={{ color: C.muted, fontWeight: '700' }}>×</Text></TouchableOpacity> : null}
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[s.filterChip, filter === f.key && s.filterChipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[s.filterChipText, filter === f.key && s.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={o => o._id}
          renderItem={renderOrder}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyText}>No orders found</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Order #{selected?.orderNumber}</Text>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {selected && (
            <ScrollView contentContainerStyle={s.detailBody}>
              {/* Status */}
              {(() => { const st = STATUS[selected.status] || STATUS.pending; return (
                <View style={[s.statusBanner, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusBannerText, { color: st.color }]}>{st.label}</Text>
                </View>
              ); })()}

              {/* Customer */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>Customer</Text>
                <Text style={s.detailValue}>{selected.customerName || 'Walk-in'}</Text>
                {selected.customerPhone ? <Text style={s.detailSub}>📞 {selected.customerPhone}</Text> : null}
              </View>

              {/* Items */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>Items</Text>
                {selected.items.map((item, i) => (
                  <View key={i} style={s.itemRow}>
                    <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.itemQty}>×{item.quantity}</Text>
                    <Text style={s.itemSubtotal}>${item.subtotal.toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              {/* Totals */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>Payment</Text>
                {[
                  { label: 'Subtotal',   value: `$${selected.subtotal.toFixed(2)}` },
                  selected.discountAmount > 0 && { label: 'Discount', value: `-$${selected.discountAmount.toFixed(2)}` },
                  selected.taxAmount > 0 && { label: `Tax (${selected.tax}%)`, value: `$${selected.taxAmount.toFixed(2)}` },
                ].filter(Boolean).map((r: any, i) => (
                  <View key={i} style={s.totalRow}>
                    <Text style={s.totalLabel}>{r.label}</Text>
                    <Text style={s.totalValue}>{r.value}</Text>
                  </View>
                ))}
                <View style={[s.totalRow, s.grandRow]}>
                  <Text style={s.grandLabel}>Total</Text>
                  <Text style={s.grandValue}>${selected.total.toFixed(2)}</Text>
                </View>
                <Text style={s.payMethod}>Paid via {selected.paymentMethod}</Text>
              </View>

              {/* Status transitions */}
              {STATUS_TRANSITIONS[selected.status]?.length > 0 && (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>Update Status</Text>
                  <View style={s.transitionRow}>
                    {STATUS_TRANSITIONS[selected.status].map(ns => {
                      const m = STATUS[ns];
                      return (
                        <TouchableOpacity
                          key={ns}
                          style={[s.transitionBtn, { backgroundColor: m.bg, borderColor: m.color }, updating && { opacity: 0.5 }]}
                          onPress={() => handleStatusChange(selected, ns)}
                          disabled={updating}
                        >
                          {updating ? <ActivityIndicator size="small" color={m.color} /> : (
                            <Text style={[s.transitionBtnText, { color: m.color }]}>{m.label}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={s.createdAt}>Created {new Date(selected.createdAt).toLocaleString()}</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { paddingRight: 4 },
  backText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#94a3b8', fontSize: 12 },

  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statVal: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2 },

  searchWrap: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: C.text },
  clearBtn: { padding: 4 },

  filterScroll: { marginBottom: 8 },
  filterChip: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.navy, borderColor: C.navy },
  filterChipText: { fontSize: 12, fontWeight: '600', color: C.muted },
  filterChipTextActive: { color: '#fff' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 15, fontWeight: '500' },

  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  orderNum: { fontSize: 15, fontWeight: '800', color: C.text },
  customerName: { fontSize: 13, color: C.muted, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: 12, color: C.light },
  cardTotal: { fontSize: 16, fontWeight: '800', color: C.text },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalClose: { fontSize: 20, color: C.muted, paddingHorizontal: 4 },

  detailBody: { padding: 20, paddingBottom: 40 },
  statusBanner: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
  statusBannerText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },

  detailSection: { marginBottom: 20 },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  detailValue: { fontSize: 16, fontWeight: '700', color: C.text },
  detailSub: { fontSize: 13, color: C.muted, marginTop: 4 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: C.border },
  itemName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },
  itemQty: { fontSize: 13, color: C.muted, marginHorizontal: 8 },
  itemSubtotal: { fontSize: 14, fontWeight: '700', color: C.text },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: C.muted },
  totalValue: { fontSize: 13, color: C.text, fontWeight: '600' },
  grandRow: { borderTopWidth: 1, borderColor: C.border, paddingTop: 8, marginTop: 4 },
  grandLabel: { fontSize: 15, fontWeight: '800', color: C.text },
  grandValue: { fontSize: 18, fontWeight: '800', color: C.navy },
  payMethod: { fontSize: 12, color: C.light, marginTop: 6, fontStyle: 'italic' },

  transitionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  transitionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, minWidth: 90, alignItems: 'center' },
  transitionBtnText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

  createdAt: { fontSize: 12, color: C.light, textAlign: 'center', marginTop: 12 },
});
