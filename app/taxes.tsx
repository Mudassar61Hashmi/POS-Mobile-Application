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

type Tax = {
  _id: string; name: string; rate: number;
  type: 'inclusive' | 'exclusive';
  appliesTo: 'all' | 'category' | 'product';
  categories: string[]; isDefault: boolean; isActive: boolean; description: string;
};

type TaxForm = {
  name: string; rate: string; type: 'inclusive' | 'exclusive';
  appliesTo: 'all' | 'category' | 'product';
  categories: string; isDefault: boolean; isActive: boolean; description: string;
};

const EMPTY: TaxForm = {
  name: '', rate: '', type: 'exclusive', appliesTo: 'all',
  categories: '', isDefault: false, isActive: true, description: '',
};

export default function TaxesScreen() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [form, setForm] = useState<TaxForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await apiFetch('/api/taxes');
      if (r.ok) setTaxes(await r.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setModalVisible(true); };
  const openEdit = (t: Tax) => {
    setEditing(t);
    setForm({ name: t.name, rate: String(t.rate), type: t.type, appliesTo: t.appliesTo, categories: t.categories.join(', '), isDefault: t.isDefault, isActive: t.isActive, description: t.description });
    setModalVisible(true);
  };

  const handleDelete = (t: Tax) => {
    Alert.alert('Delete Tax', `Delete "${t.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingId(t._id);
          try {
            const r = await apiFetch(`/api/taxes/${t._id}`, { method: 'DELETE' });
            if (r.ok) load();
            else Alert.alert('Error', 'Failed to delete tax');
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setDeletingId(null); }
        },
      },
    ]);
  };

  const handleSetDefault = async (t: Tax) => {
    try {
      const r = await apiFetch(`/api/taxes/${t._id}/set-default`, { method: 'PATCH' });
      if (r.ok) load(); else Alert.alert('Error', 'Failed to set default');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleToggleActive = async (t: Tax) => {
    try {
      const r = await apiFetch(`/api/taxes/${t._id}`, {
        method: 'PUT', body: JSON.stringify({ ...t, isActive: !t.isActive }),
      });
      if (r.ok) load();
    } catch {}
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    const rate = parseFloat(form.rate);
    if (isNaN(rate) || rate < 0 || rate > 100) { Alert.alert('Validation', 'Rate must be between 0 and 100'); return; }
    setSaving(true);
    try {
      const body = {
        ...form, rate,
        categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
      };
      const url = editing ? `/api/taxes/${editing._id}` : '/api/taxes';
      const method = editing ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (r.ok) { setModalVisible(false); load(); }
      else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed'); }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const defaultTax = taxes.find(t => t.isDefault);

  const renderTax = ({ item: t }: { item: Tax }) => (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.cardIcon}>
          <Text style={{ fontSize: 16 }}>%</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.cardNameRow}>
            <Text style={s.cardName}>{t.name}</Text>
            {t.isDefault && <View style={s.defaultBadge}><Text style={s.defaultBadgeText}>Default</Text></View>}
          </View>
          {t.description ? <Text style={s.cardDesc} numberOfLines={1}>{t.description}</Text> : null}
          <View style={s.cardMeta}>
            <Text style={s.cardRate}>{t.rate}%</Text>
            <View style={[s.typeBadge, { backgroundColor: t.type === 'exclusive' ? '#dbeafe' : '#ede9fe' }]}>
              <Text style={[s.typeBadgeText, { color: t.type === 'exclusive' ? C.blue : '#7c3aed' }]}>{t.type}</Text>
            </View>
            <Text style={s.cardApplies}>{t.appliesTo}</Text>
          </View>
        </View>
        <View style={s.cardControls}>
          <Switch
            value={t.isActive}
            onValueChange={() => handleToggleActive(t)}
            trackColor={{ false: C.border, true: '#86efac' }}
            thumbColor={t.isActive ? C.green : C.light}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>
      <View style={s.cardActions}>
        {!t.isDefault && (
          <TouchableOpacity style={s.defaultBtn} onPress={() => handleSetDefault(t)}>
            <Text style={s.defaultBtnText}>Set Default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.editBtn} onPress={() => openEdit(t)}>
          <Text style={s.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.delBtn, deletingId === t._id && { opacity: 0.5 }]}
          onPress={() => handleDelete(t)}
          disabled={deletingId === t._id}
        >
          {deletingId === t._id ? <ActivityIndicator size="small" color={C.red} /> : <Text style={s.delBtnText}>Delete</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Tax Rates</Text>
          <Text style={s.headerSub}>{taxes.length} configured</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',    value: taxes.length,                                       color: C.text  },
          { label: 'Active',   value: taxes.filter(t => t.isActive).length,               color: C.green },
          { label: 'Global',   value: taxes.filter(t => t.appliesTo === 'all').length,    color: C.blue  },
          { label: 'Category', value: taxes.filter(t => t.appliesTo === 'category').length, color: '#7c3aed' },
        ].map(item => (
          <View key={item.label} style={s.statCard}>
            <Text style={[s.statVal, { color: item.color }]}>{item.value}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {defaultTax && (
        <View style={s.defaultBanner}>
          <Text style={s.defaultBannerText}>⭐ Default: {defaultTax.name} ({defaultTax.rate}%) · {defaultTax.type}</Text>
        </View>
      )}

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : (
        <FlatList
          data={taxes}
          keyExtractor={t => t._id}
          renderItem={renderTax}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📊</Text>
              <Text style={s.emptyText}>No tax rates configured</Text>
              <TouchableOpacity style={[s.addBtn, { marginTop: 16 }]} onPress={openAdd}>
                <Text style={s.addBtnText}>+ Add Tax Rate</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? 'Edit Tax Rate' : 'Add Tax Rate'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. GST, VAT, Sales Tax" placeholderTextColor={C.light} />

            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Rate (%) *</Text>
                <TextInput style={s.input} value={form.rate} onChangeText={v => setForm(f => ({ ...f, rate: v }))} keyboardType="decimal-pad" placeholder="e.g. 10" placeholderTextColor={C.light} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Type</Text>
                <View style={s.segmentRow}>
                  {(['exclusive', 'inclusive'] as const).map(t => (
                    <TouchableOpacity key={t} style={[s.segment, form.type === t && s.segmentActive]} onPress={() => setForm(f => ({ ...f, type: t }))}>
                      <Text style={[s.segmentText, form.type === t && s.segmentTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={s.fieldLabel}>Applies To</Text>
            <View style={s.applyRow}>
              {(['all', 'category', 'product'] as const).map(a => (
                <TouchableOpacity key={a} style={[s.applyBtn, form.appliesTo === a && s.applyBtnActive]} onPress={() => setForm(f => ({ ...f, appliesTo: a }))}>
                  <Text style={[s.applyBtnText, form.appliesTo === a && s.applyBtnTextActive]}>
                    {a === 'all' ? 'All Products' : a === 'category' ? 'Category' : 'Per Product'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.appliesTo === 'category' && (
              <>
                <Text style={s.fieldLabel}>Categories (comma separated)</Text>
                <TextInput style={s.input} value={form.categories} onChangeText={v => setForm(f => ({ ...f, categories: v }))} placeholder="e.g. Dairy, Bakery" placeholderTextColor={C.light} />
              </>
            )}

            <Text style={s.fieldLabel}>Description (optional)</Text>
            <TextInput style={s.input} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Brief description..." placeholderTextColor={C.light} />

            <View style={s.toggleRow}>
              <View style={s.toggleItem}>
                <Switch value={form.isDefault} onValueChange={v => setForm(f => ({ ...f, isDefault: v }))} trackColor={{ false: C.border, true: '#fcd34d' }} thumbColor={form.isDefault ? C.amber : C.light} />
                <Text style={s.toggleLabel}>Set as Default</Text>
              </View>
              <View style={s.toggleItem}>
                <Switch value={form.isActive} onValueChange={v => setForm(f => ({ ...f, isActive: v }))} trackColor={{ false: C.border, true: '#86efac' }} thumbColor={form.isActive ? C.green : C.light} />
                <Text style={s.toggleLabel}>Active</Text>
              </View>
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
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2 },

  defaultBanner: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#bbf7d0' },
  defaultBannerText: { fontSize: 13, color: C.green, fontWeight: '600' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 15, fontWeight: '500' },

  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '700', color: C.text },
  cardDesc: { fontSize: 12, color: C.muted, marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  cardRate: { fontSize: 18, fontWeight: '800', color: C.navy },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardApplies: { fontSize: 11, color: C.muted, textTransform: 'capitalize', fontWeight: '600' },
  cardControls: { alignItems: 'center' },
  defaultBadge: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 10, color: C.amber, fontWeight: '700' },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: C.border },
  defaultBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fef3c7' },
  defaultBtnText: { fontSize: 12, color: C.amber, fontWeight: '700' },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#dbeafe' },
  editBtnText: { fontSize: 12, color: C.blue, fontWeight: '700' },
  delBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fef2f2', marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 30 },
  delBtnText: { fontSize: 12, color: C.red, fontWeight: '700' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalClose: { fontSize: 20, color: C.muted, paddingHorizontal: 4 },
  modalBody: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text },
  row2: { flexDirection: 'row' },

  segmentRow: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  segmentActive: { backgroundColor: C.navy },
  segmentText: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'capitalize' },
  segmentTextActive: { color: '#fff' },

  applyRow: { flexDirection: 'row', gap: 8 },
  applyBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  applyBtnActive: { backgroundColor: C.navy },
  applyBtnText: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center' },
  applyBtnTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', gap: 20, marginTop: 20 },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: C.text },

  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  btnPrimary: { backgroundColor: C.navy },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline: { backgroundColor: '#f1f5f9' },
  btnOutlineText: { color: C.muted, fontWeight: '700', fontSize: 15 },
});
