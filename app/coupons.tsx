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

type Coupon = {
  _id: string; code: string; name: string;
  type: 'percentage' | 'fixed'; value: number;
  minOrder: number; maxUses: number; usedCount: number;
  expiresAt: string | null; active: boolean; createdAt: string;
};

type CouponForm = {
  code: string; name: string; type: 'percentage' | 'fixed';
  value: string; minOrder: string; maxUses: string;
  expiresAt: string; active: boolean;
};

const EMPTY: CouponForm = {
  code: '', name: '', type: 'percentage', value: '', minOrder: '0', maxUses: '0', expiresAt: '', active: true,
};

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function CouponsScreen() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validateCode, setValidateCode] = useState('');
  const [validateResult, setValidateResult] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await apiFetch('/api/coupons');
      if (r.ok) setCoupons(await r.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isExpired = (c: Coupon) => c.expiresAt ? new Date(c.expiresAt) < new Date() : false;

  const filtered = coupons.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'expired') return isExpired(c);
    if (filter === 'active') return c.active && !isExpired(c);
    if (filter === 'inactive') return !c.active;
    return true;
  });

  const stats = {
    total: coupons.length,
    active: coupons.filter(c => c.active && !isExpired(c)).length,
    uses: coupons.reduce((s, c) => s + c.usedCount, 0),
    expired: coupons.filter(isExpired).length,
  };

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY, code: generateCode() }); setModalVisible(true); };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code, name: c.name, type: c.type, value: String(c.value),
      minOrder: String(c.minOrder), maxUses: String(c.maxUses),
      expiresAt: c.expiresAt ? c.expiresAt.split('T')[0] : '', active: c.active,
    });
    setModalVisible(true);
  };

  const handleDelete = (c: Coupon) => {
    Alert.alert('Delete Coupon', `Delete coupon "${c.code}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingId(c._id);
          try {
            const r = await apiFetch(`/api/coupons/${c._id}`, { method: 'DELETE' });
            if (r.ok) load(); else Alert.alert('Error', 'Failed to delete');
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setDeletingId(null); }
        },
      },
    ]);
  };

  const handleToggle = async (c: Coupon) => {
    try {
      await apiFetch(`/api/coupons/${c._id}`, {
        method: 'PUT', body: JSON.stringify({ active: !c.active }),
      });
      load();
    } catch {}
  };

  const handleSave = async () => {
    if (!form.code.trim()) { Alert.alert('Validation', 'Coupon code is required'); return; }
    if (!form.name.trim()) { Alert.alert('Validation', 'Coupon name is required'); return; }
    if (!form.value || +form.value <= 0) { Alert.alert('Validation', 'Value must be greater than 0'); return; }
    if (form.type === 'percentage' && +form.value > 100) { Alert.alert('Validation', 'Percentage cannot exceed 100%'); return; }
    setSaving(true);
    try {
      const body: any = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        type: form.type,
        value: +form.value,
        minOrder: +form.minOrder || 0,
        maxUses: +form.maxUses || 0,
        active: form.active,
        expiresAt: form.expiresAt || null,
      };
      const url = editing ? `/api/coupons/${editing._id}` : '/api/coupons';
      const method = editing ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (r.ok) { setModalVisible(false); load(); }
      else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed'); }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleValidate = async () => {
    if (!validateCode.trim()) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const r = await apiFetch('/api/coupons/validate', {
        method: 'POST', body: JSON.stringify({ code: validateCode.trim() }),
      });
      const d = await r.json();
      if (r.ok) setValidateResult(`✅ Valid! ${d.type === 'percentage' ? d.value + '%' : '$' + d.value} off${d.minOrder > 0 ? ` (min $${d.minOrder})` : ''}`);
      else setValidateResult(`❌ ${d.message || 'Invalid coupon'}`);
    } catch (e: any) { setValidateResult(`❌ ${e.message}`); }
    finally { setValidating(false); }
  };

  const renderCoupon = ({ item: c }: { item: Coupon }) => {
    const expired = isExpired(c);
    const statusColor = expired ? C.red : c.active ? C.green : C.muted;
    const statusBg = expired ? '#fef2f2' : c.active ? '#d1fae5' : '#f3f4f6';
    const statusLabel = expired ? 'Expired' : c.active ? 'Active' : 'Inactive';

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={s.codeBox}>
            <Text style={s.codeText}>{c.code}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.couponName}>{c.name}</Text>
            <View style={s.couponMeta}>
              <Text style={s.couponValue}>
                {c.type === 'percentage' ? `${c.value}%` : `$${c.value}`} off
              </Text>
              {c.minOrder > 0 && <Text style={s.minOrder}>min ${c.minOrder}</Text>}
            </View>
            <View style={s.couponFooter}>
              <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
                <Text style={[s.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              <Text style={s.usageText}>{c.usedCount}{c.maxUses > 0 ? `/${c.maxUses}` : ''} uses</Text>
              {c.expiresAt && <Text style={s.expiresText}>Exp {new Date(c.expiresAt).toLocaleDateString()}</Text>}
            </View>
          </View>
          <Switch
            value={c.active && !expired}
            onValueChange={() => { if (!expired) handleToggle(c); }}
            disabled={expired}
            trackColor={{ false: C.border, true: '#86efac' }}
            thumbColor={c.active && !expired ? C.green : C.light}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(c)}>
            <Text style={s.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.delBtn, deletingId === c._id && { opacity: 0.5 }]}
            onPress={() => handleDelete(c)}
            disabled={deletingId === c._id}
          >
            {deletingId === c._id ? <ActivityIndicator size="small" color={C.red} /> : <Text style={s.delBtnText}>Delete</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Coupons</Text>
          <Text style={s.headerSub}>{coupons.length} total</Text>
        </View>
        <TouchableOpacity style={s.validateBtn} onPress={() => { setValidateCode(''); setValidateResult(null); setValidateModalVisible(true); }}>
          <Text style={s.validateBtnText}>Test</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',   value: stats.total,   color: C.text  },
          { label: 'Active',  value: stats.active,  color: C.green },
          { label: 'Uses',    value: stats.uses,    color: C.blue  },
          { label: 'Expired', value: stats.expired, color: C.red   },
        ].map(item => (
          <View key={item.label} style={s.statCard}>
            <Text style={[s.statVal, { color: item.color }]}>{item.value}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {(['all', 'active', 'inactive', 'expired'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterChip, filter === f && s.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c._id}
          renderItem={renderCoupon}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏷️</Text>
              <Text style={s.emptyText}>No coupons found</Text>
              <TouchableOpacity style={[s.addBtn, { marginTop: 16 }]} onPress={openAdd}>
                <Text style={s.addBtnText}>+ Create First Coupon</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? 'Edit Coupon' : 'New Coupon'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <View style={s.codeInputRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Coupon Code *</Text>
                <TextInput style={s.input} value={form.code} onChangeText={v => setForm(f => ({ ...f, code: v.toUpperCase() }))} placeholder="e.g. SAVE20" placeholderTextColor={C.light} autoCapitalize="characters" />
              </View>
              <TouchableOpacity style={s.genBtn} onPress={() => setForm(f => ({ ...f, code: generateCode() }))}>
                <Text style={s.genBtnText}>Random</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Coupon Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Summer Sale 20%" placeholderTextColor={C.light} />

            <Text style={s.fieldLabel}>Discount Type</Text>
            <View style={s.row2}>
              {(['percentage', 'fixed'] as const).map(t => (
                <TouchableOpacity key={t} style={[s.typeBtn, form.type === t && s.typeBtnActive]} onPress={() => setForm(f => ({ ...f, type: t }))}>
                  <Text style={[s.typeBtnText, form.type === t && s.typeBtnTextActive]}>{t === 'percentage' ? '% Percent' : '$ Fixed'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Value *</Text>
                <TextInput style={s.input} value={form.value} onChangeText={v => setForm(f => ({ ...f, value: v }))} keyboardType="decimal-pad" placeholder={form.type === 'percentage' ? '0–100' : '0.00'} placeholderTextColor={C.light} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Min Order ($)</Text>
                <TextInput style={s.input} value={form.minOrder} onChangeText={v => setForm(f => ({ ...f, minOrder: v }))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.light} />
              </View>
            </View>

            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Max Uses (0 = unlimited)</Text>
                <TextInput style={s.input} value={form.maxUses} onChangeText={v => setForm(f => ({ ...f, maxUses: v }))} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.light} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Expires (YYYY-MM-DD)</Text>
                <TextInput style={s.input} value={form.expiresAt} onChangeText={v => setForm(f => ({ ...f, expiresAt: v }))} placeholder="optional" placeholderTextColor={C.light} />
              </View>
            </View>

            <View style={s.toggleRow}>
              <Switch value={form.active} onValueChange={v => setForm(f => ({ ...f, active: v }))} trackColor={{ false: C.border, true: '#86efac' }} thumbColor={form.active ? C.green : C.light} />
              <Text style={s.toggleLabel}>Active</Text>
            </View>

            <View style={s.row2}>
              <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setModalVisible(false)}>
                <Text style={s.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ width: 12 }} />
              <TouchableOpacity style={[s.btn, s.btnPrimary, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>{editing ? 'Update' : 'Create'}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Validate Modal */}
      <Modal visible={validateModalVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Test Coupon</Text>
            <TouchableOpacity onPress={() => setValidateModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.modalBody}>
            <Text style={s.fieldLabel}>Enter Coupon Code</Text>
            <TextInput style={s.input} value={validateCode} onChangeText={setValidateCode} placeholder="e.g. SAVE20" placeholderTextColor={C.light} autoCapitalize="characters" />
            {validateResult ? (
              <View style={[s.validateResult, { backgroundColor: validateResult.startsWith('✅') ? '#d1fae5' : '#fef2f2' }]}>
                <Text style={[s.validateResultText, { color: validateResult.startsWith('✅') ? C.green : C.red }]}>{validateResult}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={[s.btn, s.btnPrimary, { marginTop: 16 }, validating && { opacity: 0.6 }]} onPress={handleValidate} disabled={validating}>
              {validating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Validate</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { paddingRight: 4 },
  backText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#94a3b8', fontSize: 12 },
  validateBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  validateBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  addBtn: { backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2 },

  filterScroll: { marginBottom: 8 },
  filterChip: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.navy, borderColor: C.navy },
  filterChipText: { fontSize: 12, fontWeight: '600', color: C.muted },
  filterChipTextActive: { color: '#fff' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 15, fontWeight: '500' },

  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  codeBox: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  codeText: { fontSize: 14, fontWeight: '800', color: C.navy, fontFamily: 'monospace', letterSpacing: 1 },
  couponName: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  couponMeta: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  couponValue: { fontSize: 16, fontWeight: '800', color: C.green },
  minOrder: { fontSize: 11, color: C.muted, fontWeight: '500' },
  couponFooter: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  usageText: { fontSize: 11, color: C.muted },
  expiresText: { fontSize: 11, color: C.light },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: C.border },
  editBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#dbeafe' },
  editBtnText: { fontSize: 12, color: C.blue, fontWeight: '700' },
  delBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#fef2f2', marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 30 },
  delBtnText: { fontSize: 12, color: C.red, fontWeight: '700' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalClose: { fontSize: 20, color: C.muted, paddingHorizontal: 4 },
  modalBody: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text },
  row2: { flexDirection: 'row' },

  codeInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  genBtn: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 0 },
  genBtnText: { fontSize: 13, color: C.muted, fontWeight: '700' },

  typeBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  typeBtnActive: { backgroundColor: C.navy },
  typeBtnText: { fontSize: 13, fontWeight: '700', color: C.muted },
  typeBtnTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: C.text },

  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.navy },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline: { backgroundColor: '#f1f5f9' },
  btnOutlineText: { color: C.muted, fontWeight: '700', fontSize: 15 },

  validateResult: { borderRadius: 12, padding: 14, marginTop: 14 },
  validateResultText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
