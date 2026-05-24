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

type Customer = {
  _id: string; name: string; phone: string; email?: string; createdAt?: string;
};

type FormState = { name: string; phone: string; email: string };

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await apiFetch('/api/customers');
      if (r.ok) setCustomers(await r.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', phone: '', email: '' });
    setModalVisible(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, email: c.email || '' });
    setModalVisible(true);
  };

  const handleDelete = (c: Customer) => {
    Alert.alert('Delete Customer', `Delete "${c.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingId(c._id);
          try {
            const r = await apiFetch(`/api/customers/${c._id}`, { method: 'DELETE' });
            if (r.ok) setCustomers(prev => prev.filter(x => x._id !== c._id));
            else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed'); }
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setDeletingId(null); }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    if (!form.phone.trim()) { Alert.alert('Validation', 'Phone is required'); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      Alert.alert('Validation', 'Invalid email format'); return;
    }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined };
      const url = editing ? `/api/customers/${editing._id}` : '/api/customers';
      const method = editing ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (r.ok) { setModalVisible(false); load(); }
      else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed to save'); }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const renderItem = ({ item: c }: { item: Customer }) => (
    <View style={s.card}>
      <View style={s.cardAvatar}>
        <Text style={s.cardAvatarText}>{c.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardName}>{c.name}</Text>
        <Text style={s.cardPhone}>📞 {c.phone}</Text>
        {c.email ? <Text style={s.cardEmail}>✉️ {c.email}</Text> : null}
        {c.createdAt ? <Text style={s.cardDate}>Joined {new Date(c.createdAt).toLocaleDateString()}</Text> : null}
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
          {deletingId === c._id
            ? <ActivityIndicator size="small" color={C.red} />
            : <Text style={s.delBtnText}>Del</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Customers</Text>
          <Text style={s.headerSub}>{customers.length} total</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone or email..."
          placeholderTextColor={C.light}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}>
            <Text style={{ color: C.muted, fontWeight: '700' }}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyText}>{search ? 'No customers match search' : 'No customers yet'}</Text>
              {!search && (
                <TouchableOpacity style={[s.addBtn, { marginTop: 16 }]} onPress={openAdd}>
                  <Text style={s.addBtnText}>+ Add First Customer</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? 'Edit Customer' : 'Add Customer'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Full Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. John Doe" placeholderTextColor={C.light} />

            <Text style={s.fieldLabel}>Phone Number *</Text>
            <TextInput style={s.input} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} placeholder="e.g. +1 234 567 890" placeholderTextColor={C.light} keyboardType="phone-pad" />

            <Text style={s.fieldLabel}>Email (optional)</Text>
            <TextInput style={s.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="e.g. john@example.com" placeholderTextColor={C.light} keyboardType="email-address" autoCapitalize="none" />

            <View style={s.row2}>
              <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setModalVisible(false)}>
                <Text style={s.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ width: 12 }} />
              <TouchableOpacity style={[s.btn, s.btnPrimary, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>{editing ? 'Update' : 'Add'}</Text>}
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

  searchWrap: { margin: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: C.text },
  clearBtn: { padding: 4 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 15, fontWeight: '500' },

  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border, flexDirection: 'row', gap: 12, alignItems: 'center',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
  },
  cardAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  cardAvatarText: { fontSize: 18, fontWeight: '800', color: C.blue },
  cardName: { fontSize: 15, fontWeight: '700', color: C.text },
  cardPhone: { fontSize: 12, color: C.muted, marginTop: 2 },
  cardEmail: { fontSize: 12, color: C.muted, marginTop: 1 },
  cardDate: { fontSize: 11, color: C.light, marginTop: 3 },
  cardActions: { gap: 6 },
  editBtn: { backgroundColor: '#dbeafe', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: C.blue, fontSize: 12, fontWeight: '700' },
  delBtn: { backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 30 },
  delBtnText: { color: C.red, fontSize: 12, fontWeight: '700' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalClose: { fontSize: 20, color: C.muted, paddingHorizontal: 4 },
  modalBody: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text },
  row2: { flexDirection: 'row', marginTop: 24 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.navy },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline: { backgroundColor: '#f1f5f9' },
  btnOutlineText: { color: C.muted, fontWeight: '700', fontSize: 15 },
});
