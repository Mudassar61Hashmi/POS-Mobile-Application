import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '@/lib/api';

const C = {
  navy: '#0C0A2E', blue: '#6366F1', green: '#10B981', amber: '#F59E0B',
  red: '#EF4444', bg: '#F0F0FA', card: '#ffffff', border: '#E5E7EB',
  text: '#111827', muted: '#6B7280', light: '#9CA3AF',
  primary: '#6366F1', primaryLight: '#EEF2FF',
};

type Product = {
  _id: string; name: string; price: number; cost?: number;
  quantity: number; category: string; barcode?: string;
  lowStockThreshold?: number; image?: string;
};

type FormState = {
  name: string; price: string; cost: string; quantity: string;
  category: string; barcode: string; lowStockThreshold: string;
};

const EMPTY_FORM: FormState = {
  name: '', price: '', cost: '', quantity: '0',
  category: '', barcode: '', lowStockThreshold: '10',
};

function stockStatus(qty: number, thresh = 10): { label: string; bg: string; color: string } {
  if (qty <= 0)      return { label: 'Out of Stock', bg: '#fef2f2', color: C.red };
  if (qty <= thresh) return { label: 'Low Stock',    bg: '#fff7ed', color: C.amber };
  return { label: 'In Stock', bg: '#f0fdf4', color: C.green };
}

export default function InventoryScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [catInput, setCatInput] = useState('');
  const [catDropOpen, setCatDropOpen] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await apiFetch('/api/products');
      if (r.ok) setProducts(await r.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || '').includes(search);
    const matchCat = catFilter === 'All' || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const stats = {
    total: products.length,
    inStock: products.filter(p => p.quantity > (p.lowStockThreshold ?? 10)).length,
    lowStock: products.filter(p => p.quantity > 0 && p.quantity <= (p.lowStockThreshold ?? 10)).length,
    outOfStock: products.filter(p => p.quantity <= 0).length,
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCatInput('');
    setCatDropOpen(false);
    setModalVisible(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, price: String(p.price), cost: String(p.cost ?? ''),
      quantity: String(p.quantity), category: p.category,
      barcode: p.barcode ?? '', lowStockThreshold: String(p.lowStockThreshold ?? 10),
    });
    setCatInput(p.category);
    setCatDropOpen(false);
    setModalVisible(true);
  };

  const handleDelete = (p: Product) => {
    Alert.alert('Delete Product', `Delete "${p.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const r = await apiFetch(`/api/products/${p._id}`, { method: 'DELETE' });
            if (r.ok) setProducts(prev => prev.filter(x => x._id !== p._id));
            else Alert.alert('Error', 'Failed to delete product');
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Product name is required'); return; }
    if (!form.price || +form.price <= 0) { Alert.alert('Validation', 'Price must be greater than 0'); return; }
    if (!form.category.trim()) { Alert.alert('Validation', 'Category is required'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        price: +form.price,
        cost: form.cost ? +form.cost : undefined,
        quantity: +form.quantity,
        category: form.category.trim(),
        barcode: form.barcode.trim() || undefined,
        lowStockThreshold: +form.lowStockThreshold,
      };
      const url = editing ? `/api/products/${editing._id}` : '/api/products';
      const method = editing ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (r.ok) {
        setModalVisible(false);
        load();
      } else {
        const d = await r.json().catch(() => ({}));
        Alert.alert('Error', d.message || 'Failed to save product');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const existingCats = categories.filter(c => c !== 'All' && c.toLowerCase().includes(catInput.toLowerCase()));

  const renderProduct = ({ item: p }: { item: Product }) => {
    const st = stockStatus(p.quantity, p.lowStockThreshold);
    return (
      <View style={s.card}>
        <View style={s.cardLeft}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
            <Text style={s.cardSub}>{p.category}{p.barcode ? ` · ${p.barcode}` : ''}</Text>
            <View style={s.cardMeta}>
              <Text style={s.cardPrice}>${p.price.toFixed(2)}</Text>
              {p.cost ? <Text style={s.cardCost}>cost ${p.cost.toFixed(2)}</Text> : null}
            </View>
          </View>
        </View>
        <View style={s.cardRight}>
          <View style={[s.badge, { backgroundColor: st.bg }]}>
            <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={[s.qty, { color: st.color }]}>Qty: {p.quantity}</Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.editBtn} onPress={() => openEdit(p)}>
              <Text style={s.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(p)}>
              <Text style={s.delBtnText}>Del</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <LinearGradient colors={['#0C0A2E', '#17105C']} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.headerBlob} />
        <View>
          <Text style={s.headerTitle}>Inventory</Text>
          <Text style={s.headerSub}>{products.length} products</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',     value: stats.total,      color: C.text  },
          { label: 'In Stock',  value: stats.inStock,    color: C.green },
          { label: 'Low',       value: stats.lowStock,   color: C.amber },
          { label: 'Out',       value: stats.outOfStock, color: C.red   },
        ].map(item => (
          <View key={item.label} style={s.statCard}>
            <Text style={[s.statVal, { color: item.color }]}>{item.value}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or barcode..."
          placeholderTextColor={C.light}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}>
            <Text style={{ color: C.muted, fontWeight: '700' }}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.catChip, catFilter === cat && s.catChipActive]}
            onPress={() => setCatFilter(cat)}
          >
            <Text style={[s.catChipText, catFilter === cat && s.catChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p._id}
          renderItem={renderProduct}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📦</Text>
              <Text style={s.emptyText}>{search ? 'No products match your search' : 'No products yet'}</Text>
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? 'Edit Product' : 'Add Product'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={s.fieldLabel}>Product Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Whole Milk 1L" placeholderTextColor={C.light} />

            {/* Price + Cost */}
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Sale Price *</Text>
                <TextInput style={s.input} value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.light} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Cost Price</Text>
                <TextInput style={s.input} value={form.cost} onChangeText={v => setForm(f => ({ ...f, cost: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.light} />
              </View>
            </View>

            {/* Qty + Threshold */}
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Quantity *</Text>
                <TextInput style={s.input} value={form.quantity} onChangeText={v => setForm(f => ({ ...f, quantity: v }))} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.light} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Low Stock Alert</Text>
                <TextInput style={s.input} value={form.lowStockThreshold} onChangeText={v => setForm(f => ({ ...f, lowStockThreshold: v }))} keyboardType="number-pad" placeholder="10" placeholderTextColor={C.light} />
              </View>
            </View>

            {/* Category */}
            <Text style={s.fieldLabel}>Category *</Text>
            <TextInput
              style={s.input}
              value={form.category}
              onChangeText={v => { setForm(f => ({ ...f, category: v })); setCatInput(v); setCatDropOpen(true); }}
              placeholder="e.g. Dairy"
              placeholderTextColor={C.light}
              onFocus={() => setCatDropOpen(true)}
            />
            {catDropOpen && existingCats.filter(c => c !== 'All').length > 0 && (
              <View style={s.catDrop}>
                {existingCats.filter(c => c !== 'All').map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={s.catDropItem}
                    onPress={() => { setForm(f => ({ ...f, category: cat })); setCatInput(cat); setCatDropOpen(false); }}
                  >
                    <Text style={s.catDropText}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Barcode */}
            <Text style={s.fieldLabel}>Barcode</Text>
            <TextInput style={s.input} value={form.barcode} onChangeText={v => setForm(f => ({ ...f, barcode: v }))} placeholder="e.g. 1234567890" placeholderTextColor={C.light} keyboardType="number-pad" />

            {/* Buttons */}
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
  header: { paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
  headerBlob: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(99,102,241,0.13)', top: -70, right: -50 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  addBtn: { backgroundColor: 'rgba(99,102,241,0.85)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2 },

  searchWrap: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  search: { flex: 1, paddingVertical: 11, fontSize: 14, color: C.text },
  clearBtn: { padding: 4 },

  catScroll: { marginBottom: 8 },
  catChip: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  catChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  catChipText: { fontSize: 12, fontWeight: '600', color: C.muted },
  catChipTextActive: { color: '#fff' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 15, fontWeight: '500' },

  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10,
    flexDirection: 'row', gap: 10,
    shadowColor: '#6366F1', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardLeft: { flex: 1, flexDirection: 'row', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 18, fontWeight: '800', color: C.primary },
  cardName: { fontSize: 14, fontWeight: '700', color: C.text },
  cardSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
  cardPrice: { fontSize: 14, fontWeight: '800', color: C.text },
  cardCost: { fontSize: 11, color: C.light },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  qty: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  editBtn: { backgroundColor: '#dbeafe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText: { color: C.blue, fontSize: 11, fontWeight: '700' },
  delBtn: { backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  delBtnText: { color: C.red, fontSize: 11, fontWeight: '700' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalClose: { fontSize: 20, color: C.muted, paddingHorizontal: 4 },
  modalBody: { padding: 20, gap: 4, paddingBottom: 40 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, borderWidth: 1, borderColor: 'transparent' },
  row2: { flexDirection: 'row', marginTop: 0 },

  catDrop: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 4, overflow: 'hidden' },
  catDropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border },
  catDropText: { fontSize: 14, color: C.text, fontWeight: '500' },

  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  btnPrimary: { backgroundColor: C.navy },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline: { backgroundColor: '#f1f5f9' },
  btnOutlineText: { color: C.muted, fontWeight: '700', fontSize: 15 },
});
