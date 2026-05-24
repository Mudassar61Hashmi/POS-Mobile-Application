import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { apiFetch } from '@/lib/api';

const C = {
  navy: '#0f172a', blue: '#2563eb', green: '#059669', amber: '#d97706',
  red: '#ef4444', bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', muted: '#64748b', light: '#94a3b8',
};

type MethodType = 'cash' | 'card_credit' | 'card_debit' | 'bank_transfer' | 'mobile_wallet' | 'other';

const TYPE_META: Record<MethodType, { label: string; icon: string; color: string }> = {
  cash:          { label: 'Cash',          icon: '💵', color: C.green },
  card_credit:   { label: 'Credit Card',   icon: '💳', color: C.blue },
  card_debit:    { label: 'Debit Card',    icon: '🏧', color: '#6366f1' },
  bank_transfer: { label: 'Bank Transfer', icon: '🏦', color: C.amber },
  mobile_wallet: { label: 'Mobile Wallet', icon: '📱', color: '#ec4899' },
  other:         { label: 'Other',         icon: '💰', color: C.muted },
};

type PaymentMethod = {
  _id: string; name: string; type: MethodType; provider?: string;
  accountNumber?: string; accountTitle?: string; icon?: string; color?: string;
  processingFee?: number; notes?: string; isActive: boolean; isDefault: boolean;
};

type Transaction = {
  _id: string; amount: number; processingFee?: number; netAmount?: number;
  methodName: string; methodType: string; transactionRef?: string; status: string;
  refundAmount?: number; customerName?: string; createdAt: string;
};

const EMPTY_METHOD: Omit<PaymentMethod, '_id'> = {
  name: '', type: 'cash', provider: '', accountNumber: '', accountTitle: '',
  processingFee: 0, notes: '', isActive: true, isDefault: false,
};

const ALL_TYPES: MethodType[] = ['cash', 'card_credit', 'card_debit', 'bank_transfer', 'mobile_wallet', 'other'];

/* ═══════════════════════════════════════
   Add/Edit Method Modal
═══════════════════════════════════════ */
function MethodModal({ visible, initial, onSave, onClose }: {
  visible: boolean; initial: Partial<PaymentMethod> | null;
  onSave(data: typeof EMPTY_METHOD): void; onClose(): void;
}) {
  const [form, setForm] = useState({ ...EMPTY_METHOD });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initial ? { ...EMPTY_METHOD, ...initial } : { ...EMPTY_METHOD });
    }
  }, [visible, initial]);

  const set = (k: keyof typeof EMPTY_METHOD, v: any) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!initial && !!(initial as PaymentMethod)._id;

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Method name is required'); return; }
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={mm.container}>
        <View style={mm.header}>
          <TouchableOpacity onPress={onClose}><Text style={mm.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={mm.title}>{isEdit ? 'Edit Method' : 'Add Method'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={C.blue} /> : <Text style={mm.save}>Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={mm.label}>Method Name *</Text>
          <TextInput style={mm.input} value={form.name} onChangeText={v => set('name', v)} placeholder="e.g. Cash, Visa Card" placeholderTextColor={C.light} />

          <Text style={mm.label}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {ALL_TYPES.map(t => {
              const meta = TYPE_META[t];
              return (
                <TouchableOpacity key={t} style={[mm.typeChip, form.type === t && { backgroundColor: meta.color }]}
                  onPress={() => set('type', t)}>
                  <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
                  <Text style={[mm.typeLabel, form.type === t && { color: '#fff' }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {(form.type === 'bank_transfer' || form.type === 'mobile_wallet') && (
            <>
              <Text style={mm.label}>Provider / Bank</Text>
              <TextInput style={mm.input} value={form.provider} onChangeText={v => set('provider', v)} placeholder="e.g. HBL, Easypaisa" placeholderTextColor={C.light} />
              <Text style={mm.label}>Account Number</Text>
              <TextInput style={mm.input} value={form.accountNumber} onChangeText={v => set('accountNumber', v)} placeholder="Account / IBAN number" placeholderTextColor={C.light} />
              <Text style={mm.label}>Account Title</Text>
              <TextInput style={mm.input} value={form.accountTitle} onChangeText={v => set('accountTitle', v)} placeholder="Account holder name" placeholderTextColor={C.light} />
            </>
          )}

          <Text style={mm.label}>Processing Fee (%)</Text>
          <TextInput style={mm.input} value={form.processingFee ? String(form.processingFee) : ''}
            onChangeText={v => set('processingFee', parseFloat(v) || 0)} keyboardType="decimal-pad"
            placeholder="0" placeholderTextColor={C.light} />

          <Text style={mm.label}>Notes</Text>
          <TextInput style={[mm.input, { minHeight: 60, textAlignVertical: 'top' }]} value={form.notes}
            onChangeText={v => set('notes', v)} placeholder="Optional notes" placeholderTextColor={C.light} multiline />

          <View style={mm.toggleRow}>
            <Text style={mm.toggleLabel}>Active</Text>
            <Switch value={form.isActive} onValueChange={v => set('isActive', v)} trackColor={{ true: C.green }} />
          </View>
          <View style={mm.toggleRow}>
            <Text style={mm.toggleLabel}>Set as Default</Text>
            <Switch value={form.isDefault} onValueChange={v => set('isDefault', v)} trackColor={{ true: C.blue }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const mm = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card },
  title: { fontSize: 17, fontWeight: '700', color: C.text },
  cancel: { color: C.muted, fontWeight: '600', fontSize: 15 },
  save: { color: C.blue, fontWeight: '700', fontSize: 15 },
  label: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8 },
  typeLabel: { fontSize: 12, fontWeight: '600', color: C.muted },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: C.text },
});

/* ═══════════════════════════════════════
   Payments Screen
═══════════════════════════════════════ */
export default function PaymentsScreen() {
  const [tab, setTab] = useState<'methods' | 'transactions'>('methods');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Partial<PaymentMethod> | null>(null);

  const loadMethods = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/payment-methods');
      if (r.ok) setMethods(await r.json());
    } catch {}
    finally { setLoading(false); }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const r = await apiFetch('/api/payments?limit=100');
      if (r.ok) {
        const d = await r.json();
        setTransactions(Array.isArray(d) ? d : (Array.isArray(d?.payments) ? d.payments : []));
      }
    } catch {}
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => { loadMethods(); }, [loadMethods]);
  useEffect(() => { if (tab === 'transactions') loadTransactions(); }, [tab, loadTransactions]);

  const saveMethod = async (data: typeof EMPTY_METHOD) => {
    const isEdit = !!(editTarget as PaymentMethod)?._id;
    const id = (editTarget as PaymentMethod)?._id;
    const r = await apiFetch(isEdit ? `/api/payment-methods/${id}` : '/api/payment-methods', {
      method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(data),
    });
    if (r.ok) { setShowModal(false); loadMethods(); }
    else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed to save'); }
  };

  const deleteMethod = (m: PaymentMethod) => {
    Alert.alert('Delete Method', `Delete "${m.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const r = await apiFetch(`/api/payment-methods/${m._id}`, { method: 'DELETE' });
        if (r.ok) setMethods(prev => prev.filter(x => x._id !== m._id));
        else Alert.alert('Error', 'Failed to delete');
      }},
    ]);
  };

  const toggleActive = async (m: PaymentMethod) => {
    const r = await apiFetch(`/api/payment-methods/${m._id}`, {
      method: 'PUT', body: JSON.stringify({ ...m, isActive: !m.isActive }),
    });
    if (r.ok) setMethods(prev => prev.map(x => x._id === m._id ? { ...x, isActive: !x.isActive } : x));
  };

  const setDefault = async (m: PaymentMethod) => {
    const r = await apiFetch(`/api/payment-methods/${m._id}`, {
      method: 'PUT', body: JSON.stringify({ ...m, isDefault: true }),
    });
    if (r.ok) {
      setMethods(prev => prev.map(x => ({ ...x, isDefault: x._id === m._id })));
    }
  };

  /* Stats */
  const activeMethods = methods.filter(m => m.isActive).length;
  const totalTx = transactions.length;
  const txRevenue = transactions.filter(t => t.status !== 'refunded').reduce((s, t) => s + t.amount, 0);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Payments</Text>
          <Text style={s.headerSub}>Methods & Transactions</Text>
        </View>
        {tab === 'methods' && (
          <TouchableOpacity style={s.addBtn} onPress={() => { setEditTarget(null); setShowModal(true); }}>
            <Text style={s.addBtnTxt}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['methods', 'transactions'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === 'methods' ? 'Payment Methods' : 'Transactions'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'methods' ? (
        /* ── Methods Tab ── */
        loading ? (
          <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
        ) : (
          <FlatList
            data={methods}
            keyExtractor={m => m._id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            ListHeaderComponent={
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Text style={s.statLabel}>Total Methods</Text>
                  <Text style={s.statVal}>{methods.length}</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statLabel}>Active</Text>
                  <Text style={[s.statVal, { color: C.green }]}>{activeMethods}</Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>💳</Text>
                <Text style={{ color: C.muted, fontSize: 14 }}>No payment methods</Text>
              </View>
            }
            renderItem={({ item: m }) => {
              const meta = TYPE_META[m.type] || TYPE_META.other;
              return (
                <View style={s.card}>
                  <View style={s.cardTop}>
                    <View style={[s.methodIcon, { backgroundColor: meta.color + '20' }]}>
                      <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.methodName}>{m.name}</Text>
                        {m.isDefault && (
                          <View style={s.defaultBadge}><Text style={s.defaultBadgeTxt}>DEFAULT</Text></View>
                        )}
                      </View>
                      <Text style={s.methodType}>{meta.label}</Text>
                      {m.provider ? <Text style={s.methodSub}>{m.provider}</Text> : null}
                      {m.accountNumber ? <Text style={s.methodSub}>{m.accountNumber}</Text> : null}
                      {(m.processingFee ?? 0) > 0 && (
                        <Text style={s.methodSub}>Fee: {m.processingFee}%</Text>
                      )}
                    </View>
                    <Switch value={m.isActive} onValueChange={() => toggleActive(m)} trackColor={{ true: C.green }} />
                  </View>
                  <View style={s.cardActions}>
                    {!m.isDefault && m.isActive && (
                      <TouchableOpacity style={s.actionBtn} onPress={() => setDefault(m)}>
                        <Text style={s.actionBtnTxt}>Set Default</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={s.actionBtn} onPress={() => { setEditTarget(m); setShowModal(true); }}>
                      <Text style={s.actionBtnTxt}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#fee2e2' }]} onPress={() => deleteMethod(m)}>
                      <Text style={[s.actionBtnTxt, { color: C.red }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )
      ) : (
        /* ── Transactions Tab ── */
        txLoading ? (
          <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
        ) : (
          <FlatList
            data={transactions}
            keyExtractor={t => t._id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
            ListHeaderComponent={
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Text style={s.statLabel}>Transactions</Text>
                  <Text style={s.statVal}>{totalTx}</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statLabel}>Revenue</Text>
                  <Text style={[s.statVal, { color: C.green }]}>${txRevenue.toFixed(0)}</Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>📊</Text>
                <Text style={{ color: C.muted, fontSize: 14 }}>No transactions yet</Text>
              </View>
            }
            renderItem={({ item: tx }) => {
              const meta = TYPE_META[(tx.methodType as MethodType)] || TYPE_META.other;
              const isRefund = tx.status === 'refunded';
              return (
                <View style={s.card}>
                  <View style={s.cardTop}>
                    <View style={[s.methodIcon, { backgroundColor: meta.color + '20' }]}>
                      <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.methodName}>{tx.methodName}</Text>
                      {tx.customerName ? <Text style={s.methodSub}>{tx.customerName}</Text> : null}
                      {tx.transactionRef ? <Text style={s.methodSub}>Ref: {tx.transactionRef}</Text> : null}
                      <Text style={s.methodSub}>{new Date(tx.createdAt).toLocaleString()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[s.txAmount, isRefund && { color: C.red }]}>
                        {isRefund ? '−' : ''}${tx.amount.toFixed(2)}
                      </Text>
                      <View style={[s.txStatus, { backgroundColor: isRefund ? C.red : C.green }]}>
                        <Text style={s.txStatusTxt}>{tx.status}</Text>
                      </View>
                    </View>
                  </View>
                  {(tx.processingFee ?? 0) > 0 && (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border }}>
                      <Text style={s.methodSub}>Processing fee: ${tx.processingFee?.toFixed(2)}</Text>
                      <Text style={s.methodSub}>Net: ${tx.netAmount?.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )
      )}

      <MethodModal visible={showModal} initial={editTarget} onSave={saveMethod} onClose={() => setShowModal(false)} />
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
  addBtn: { backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabs: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.blue },
  tabTxt: { fontSize: 14, fontWeight: '600', color: C.muted },
  tabTxtActive: { color: C.blue },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  statLabel: { fontSize: 11, color: C.muted, fontWeight: '600', marginBottom: 4 },
  statVal: { fontSize: 20, fontWeight: '800', color: C.text },

  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  methodIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  methodName: { fontSize: 15, fontWeight: '700', color: C.text },
  methodType: { fontSize: 12, color: C.muted, marginTop: 1 },
  methodSub: { fontSize: 11, color: C.light, marginTop: 2 },
  defaultBadge: { backgroundColor: C.blue + '20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeTxt: { color: C.blue, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  actionBtn: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnTxt: { fontSize: 12, fontWeight: '700', color: C.text },

  txAmount: { fontSize: 16, fontWeight: '800', color: C.green },
  txStatus: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  txStatusTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
