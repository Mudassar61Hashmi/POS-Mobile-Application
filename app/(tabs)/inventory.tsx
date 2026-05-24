import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch } from '@/lib/api';

/* ── Design tokens ─────────────────────────────── */
const C = {
  navy: '#0C0A2E', bg: '#F0F0FA', card: '#ffffff',
  border: '#E5E7EB', text: '#111827', muted: '#6B7280', light: '#9CA3AF',
  primary: '#6366F1', primaryLight: '#EEF2FF',
  green: '#10B981', amber: '#F59E0B', red: '#EF4444',
};

const CAT_PALETTE = [
  '#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#06B6D4','#F97316','#EC4899','#14B8A6','#84CC16',
];
function catColor(cat: string) {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = cat.charCodeAt(i) + ((h << 5) - h);
  return CAT_PALETTE[Math.abs(h) % CAT_PALETTE.length];
}

/* ── Types ─────────────────────────────────────── */
type Tax = { _id: string; name: string; rate: number };

type Product = {
  _id: string; name: string; price: number; cost?: number;
  quantity: number; category: string; barcode?: string;
  lowStockThreshold?: number; image?: string | null;
  tax?: string | null; taxOverride?: boolean;
};

type FormState = {
  name: string; price: string; cost: string; quantity: string;
  category: string; barcode: string; lowStockThreshold: string;
  tax: string; taxOverride: boolean; image: string;
};

const EMPTY_FORM: FormState = {
  name: '', price: '', cost: '', quantity: '0',
  category: '', barcode: '', lowStockThreshold: '10',
  tax: '', taxOverride: false, image: '',
};

/* ── Helpers ────────────────────────────────────── */
function stockBadge(qty: number, thresh = 10) {
  if (qty <= 0)      return { label: 'Out of Stock', bg: '#FEF2F2', color: C.red,   icon: 'close-circle'      as const, accent: C.red   };
  if (qty <= thresh) return { label: 'Low Stock',    bg: '#FFF7ED', color: C.amber, icon: 'alert-circle'      as const, accent: C.amber };
  return                    { label: 'In Stock',     bg: '#F0FDF4', color: C.green, icon: 'checkmark-circle'  as const, accent: C.green };
}

function calcMargin(price: string | number, cost: string | number): number | null {
  const p = +price, c = +cost;
  if (!c || !p || p <= 0) return null;
  return Math.round(((p - c) / p) * 100);
}

/* ══════════════════════════════════════════════════
   Category dropdown modal
══════════════════════════════════════════════════ */
function CatDropdown({
  value, options, onSelect, placeholder,
}: { value: string; options: string[]; onSelect(v: string): void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <TouchableOpacity style={dd.trigger} onPress={() => { setSearch(''); setOpen(true); }} activeOpacity={0.7}>
        <Text style={[dd.triggerText, !value && { color: C.light }]} numberOfLines={1}>
          {value || placeholder || 'Select…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={C.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={dd.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={dd.sheet} onStartShouldSetResponder={() => true}>
            <View style={dd.sheetHandle} />
            <Text style={dd.sheetTitle}>Select Category</Text>

            <View style={dd.searchWrap}>
              <Ionicons name="search" size={15} color={C.light} />
              <TextInput
                style={dd.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search or type new…"
                placeholderTextColor={C.light}
                autoFocus
              />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300 }}>
              {search.trim() && !options.includes(search.trim()) && (
                <TouchableOpacity
                  style={[dd.item, dd.itemNew]}
                  onPress={() => { onSelect(search.trim()); setOpen(false); }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={C.primary} />
                  <Text style={dd.itemNewText}>Create "{search.trim()}"</Text>
                </TouchableOpacity>
              )}
              {filtered.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[dd.item, opt === value && dd.itemActive]}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                >
                  <View style={[dd.dot, { backgroundColor: catColor(opt) }]} />
                  <Text style={[dd.itemText, opt === value && dd.itemTextActive]}>{opt}</Text>
                  {opt === value && <Ionicons name="checkmark" size={16} color={C.primary} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
              {filtered.length === 0 && !search.trim() && (
                <Text style={dd.emptyHint}>No categories yet. Type a name above to create one.</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/* ══════════════════════════════════════════════════
   Tax picker modal
══════════════════════════════════════════════════ */
function TaxPicker({
  value, taxes, onSelect,
}: { value: string; taxes: Tax[]; onSelect(id: string): void }) {
  const [open, setOpen] = useState(false);
  const selected = taxes.find(t => t._id === value);

  return (
    <>
      <TouchableOpacity style={dd.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[dd.triggerText, !value && { color: C.light }]}>
          {selected ? `${selected.name} (${selected.rate}%)` : 'No Tax'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={C.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={dd.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[dd.sheet, { maxHeight: 360 }]} onStartShouldSetResponder={() => true}>
            <View style={dd.sheetHandle} />
            <Text style={dd.sheetTitle}>Select Tax Rate</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[dd.item, !value && dd.itemActive]}
                onPress={() => { onSelect(''); setOpen(false); }}
              >
                <Ionicons name="ban-outline" size={16} color={C.muted} />
                <Text style={[dd.itemText, !value && dd.itemTextActive]}>No Tax</Text>
                {!value && <Ionicons name="checkmark" size={16} color={C.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {taxes.map(t => (
                <TouchableOpacity
                  key={t._id}
                  style={[dd.item, t._id === value && dd.itemActive]}
                  onPress={() => { onSelect(t._id); setOpen(false); }}
                >
                  <Ionicons name="receipt-outline" size={16} color={C.muted} />
                  <Text style={[dd.itemText, t._id === value && dd.itemTextActive]}>
                    {t.name} — {t.rate}%
                  </Text>
                  {t._id === value && <Ionicons name="checkmark" size={16} color={C.primary} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/* ══════════════════════════════════════════════════
   Product Card
══════════════════════════════════════════════════ */
function ProductCard({ p, onEdit, onDelete }: { p: Product; onEdit(): void; onDelete(): void }) {
  const st = stockBadge(p.quantity, p.lowStockThreshold);
  const mg = calcMargin(p.price, p.cost ?? 0);
  const color = catColor(p.category || 'x');

  return (
    <View style={pc.card}>
      {/* Left accent stripe */}
      <View style={[pc.accent, { backgroundColor: st.accent }]} />

      <View style={pc.body}>
        {/* Row 1: Avatar + Info + Stock badge */}
        <View style={pc.topRow}>
          {p.image ? (
            <Image source={{ uri: p.image }} style={pc.avatarImg} contentFit="cover" />
          ) : (
            <View style={[pc.avatar, { backgroundColor: color + '1A' }]}>
              <Text style={[pc.avatarText, { color }]}>{p.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={pc.name} numberOfLines={1}>{p.name}</Text>
            <View style={pc.subRow}>
              {p.category ? (
                <View style={[pc.catBadge, { backgroundColor: color + '18' }]}>
                  <Text style={[pc.catBadgeText, { color }]}>{p.category}</Text>
                </View>
              ) : null}
              {p.barcode ? (
                <Text style={pc.barcode} numberOfLines={1}>· {p.barcode}</Text>
              ) : null}
            </View>
          </View>

          <View style={[pc.stockBadge, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={10} color={st.color} />
            <Text style={[pc.stockText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={pc.divider} />

        {/* Row 2: Pricing + Qty + Actions */}
        <View style={pc.bottomRow}>
          <View style={pc.priceBlock}>
            <Text style={pc.price}>PKR {p.price.toFixed(2)}</Text>
            {(p.cost ?? 0) > 0 && (
              <Text style={pc.cost}>cost PKR {(p.cost!).toFixed(2)}</Text>
            )}
          </View>

          {mg !== null && (
            <View style={pc.marginBadge}>
              <Ionicons name="trending-up" size={10} color={C.primary} />
              <Text style={pc.marginText}>{mg}%</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={pc.qtyBlock}>
            <Text style={[pc.qtyNum, { color: st.color }]}>{p.quantity}</Text>
            <Text style={pc.qtyLabel}>units</Text>
          </View>

          <View style={pc.actions}>
            <TouchableOpacity style={pc.editBtn} onPress={onEdit} activeOpacity={0.75}>
              <Ionicons name="pencil" size={14} color={C.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={pc.delBtn} onPress={onDelete} activeOpacity={0.75}>
              <Ionicons name="trash-outline" size={14} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ══════════════════════════════════════════════════
   Main Screen
══════════════════════════════════════════════════ */
export default function InventoryScreen() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [taxes, setTaxes]               = useState<Tax[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const [catFilter, setCatFilter]       = useState('All');
  const [catDropOpen, setCatDropOpen]   = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]           = useState<Product | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [sortBy, setSortBy]             = useState<'name' | 'qty' | 'price'>('name');

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [rp, rt] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/taxes'),
      ]);
      if (rp.ok) setProducts(await rp.json());
      if (rt.ok) setTaxes(await rt.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q) || p.category.toLowerCase().includes(q);
      const matchCat = catFilter === 'All' || p.category === catFilter;
      return matchSearch && matchCat;
    });
    if (sortBy === 'name')  list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'qty')   list = [...list].sort((a, b) => a.quantity - b.quantity);
    if (sortBy === 'price') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, search, catFilter, sortBy]);

  const stats = useMemo(() => ({
    total:      products.length,
    inStock:    products.filter(p => p.quantity > (p.lowStockThreshold ?? 10)).length,
    lowStock:   products.filter(p => p.quantity > 0 && p.quantity <= (p.lowStockThreshold ?? 10)).length,
    outOfStock: products.filter(p => p.quantity <= 0).length,
  }), [products]);

  /* ── Open add/edit ── */
  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, price: String(p.price), cost: String(p.cost ?? ''),
      quantity: String(p.quantity), category: p.category,
      barcode: p.barcode ?? '', lowStockThreshold: String(p.lowStockThreshold ?? 10),
      tax: p.tax ?? '', taxOverride: p.taxOverride ?? false,
      image: p.image ?? '',
    });
    setModalVisible(true);
  };

  /* ── Delete ── */
  const handleDelete = (p: Product) => {
    Alert.alert(
      'Delete Product',
      `Delete "${p.name}"? This cannot be undone.`,
      [
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
      ]
    );
  };

  /* ── Save ── */
  const handleSave = async () => {
    const errs: string[] = [];
    if (!form.name.trim())     errs.push('Product name is required');
    if (!form.price || +form.price <= 0) errs.push('Sale price must be greater than 0');
    if (!form.category.trim()) errs.push('Category is required');
    if (errs.length) { Alert.alert('Validation', errs.join('\n')); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name:              form.name.trim(),
        price:             +form.price,
        cost:              form.cost ? +form.cost : 0,
        quantity:          +form.quantity,
        category:          form.category.trim(),
        barcode:           form.barcode.trim() || undefined,
        lowStockThreshold: +form.lowStockThreshold,
        tax:               form.tax || null,
        taxOverride:       form.taxOverride,
        image:             form.image || null,
      };
      const url    = editing ? `/api/products/${editing._id}` : '/api/products';
      const method = editing ? 'PUT' : 'POST';
      const r      = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (r.ok) { setModalVisible(false); load(); }
      else {
        const d = await r.json().catch(() => ({}));
        Alert.alert('Error', d.message || 'Failed to save product');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const f = (key: keyof FormState, val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to select a product image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      f('image', `data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take a product photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      f('image', `data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const previewMargin = calcMargin(form.price, form.cost);

  /* ── Render ── */
  return (
    <SafeAreaView style={s.container}>

      {/* ── Header ── */}
      <LinearGradient colors={['#0C0A2E', '#17105C']} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.headerBlob} />
        <View>
          <Text style={s.headerTitle}>Inventory</Text>
          <Text style={s.headerSub}>{products.length} products · {categories.length} categories</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add Product</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Stats row ── */}
      <View style={s.statsRow}>
        {([
          { label: 'Total',     value: stats.total,      color: C.primary, icon: 'cube-outline'           },
          { label: 'In Stock',  value: stats.inStock,    color: C.green,   icon: 'checkmark-circle-outline'},
          { label: 'Low Stock', value: stats.lowStock,   color: C.amber,   icon: 'alert-circle-outline'   },
          { label: 'Out',       value: stats.outOfStock, color: C.red,     icon: 'close-circle-outline'   },
        ] as const).map(item => (
          <View key={item.label} style={s.statCard}>
            <Ionicons name={item.icon as any} size={18} color={item.color} style={{ marginBottom: 4 }} />
            <Text style={[s.statVal, { color: item.color }]}>{item.value}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Search + Sort row ── */}
      <View style={s.toolRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.light} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, barcode, category…"
            placeholderTextColor={C.light}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={C.light} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Sort button */}
        <TouchableOpacity
          style={s.sortBtn}
          onPress={() => setSortBy(prev => prev === 'name' ? 'qty' : prev === 'qty' ? 'price' : 'name')}
          activeOpacity={0.75}
        >
          <Ionicons name="swap-vertical-outline" size={15} color={C.primary} />
          <Text style={s.sortBtnText}>{sortBy === 'name' ? 'A–Z' : sortBy === 'qty' ? 'Qty' : 'Price'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Category dropdown filter ── */}
      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.catDropBtn, catFilter !== 'All' && s.catDropBtnActive]}
          onPress={() => setCatDropOpen(true)}
          activeOpacity={0.75}
        >
          <Ionicons
            name="pricetag-outline"
            size={14}
            color={catFilter !== 'All' ? '#fff' : C.primary}
          />
          <Text style={[s.catDropText, catFilter !== 'All' && s.catDropTextActive]} numberOfLines={1}>
            {catFilter === 'All' ? 'All Categories' : catFilter}
          </Text>
          <Ionicons name="chevron-down" size={14} color={catFilter !== 'All' ? '#fff' : C.primary} />
        </TouchableOpacity>

        <Text style={s.resultCount}>
          {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
        </Text>
      </View>

      {/* ── Category filter modal ── */}
      <Modal visible={catDropOpen} transparent animationType="fade" onRequestClose={() => setCatDropOpen(false)}>
        <TouchableOpacity style={dd.backdrop} activeOpacity={1} onPress={() => setCatDropOpen(false)}>
          <View style={[dd.sheet, { maxHeight: 420 }]} onStartShouldSetResponder={() => true}>
            <View style={dd.sheetHandle} />
            <Text style={dd.sheetTitle}>Filter by Category</Text>
            <ScrollView>
              {['All', ...categories].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[dd.item, cat === catFilter && dd.itemActive]}
                  onPress={() => { setCatFilter(cat); setCatDropOpen(false); }}
                >
                  {cat !== 'All' && <View style={[dd.dot, { backgroundColor: catColor(cat) }]} />}
                  {cat === 'All' && <Ionicons name="apps-outline" size={14} color={C.muted} style={{ marginRight: 4 }} />}
                  <Text style={[dd.itemText, cat === catFilter && dd.itemTextActive]}>
                    {cat === 'All' ? 'All Categories' : cat}
                  </Text>
                  {cat === catFilter && (
                    <Ionicons name="checkmark" size={16} color={C.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Product list ── */}
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p._id}
          renderItem={({ item }) => (
            <ProductCard
              p={item}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="cube-outline" size={36} color={C.light} />
              </View>
              <Text style={s.emptyTitle}>{search ? 'No products found' : 'No products yet'}</Text>
              <Text style={s.emptySub}>{search ? 'Try a different search term' : 'Tap "Add Product" to get started'}</Text>
            </View>
          }
        />
      )}

      {/* ══════════════════════════════════════════
           Add / Edit Modal
      ══════════════════════════════════════════ */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>

          {/* Modal Header */}
          <LinearGradient colors={['#0C0A2E', '#17105C']} style={fm.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View>
              <Text style={fm.headerTitle}>{editing ? 'Edit Product' : 'New Product'}</Text>
              <Text style={fm.headerSub}>{editing ? `Updating ${editing.name}` : 'Fill in the product details'}</Text>
            </View>
            <TouchableOpacity style={fm.closeBtn} onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body} keyboardShouldPersistTaps="handled">

            {/* ── Section: Basic Info ── */}
            <View style={fm.section}>
              <View style={fm.sectionHeader}>
                <Ionicons name="information-circle-outline" size={16} color={C.primary} />
                <Text style={fm.sectionTitle}>Basic Info</Text>
              </View>

              {/* Image picker */}
              <View style={fm.imgRow}>
                {/* Preview */}
                <View style={fm.imgPreviewWrap}>
                  {form.image ? (
                    <Image source={{ uri: form.image }} style={fm.imgPreview} contentFit="cover" />
                  ) : (
                    <View style={fm.imgPlaceholder}>
                      <Ionicons name="image-outline" size={32} color={C.light} />
                      <Text style={fm.imgPlaceholderText}>No image</Text>
                    </View>
                  )}
                  {form.image ? (
                    <TouchableOpacity style={fm.imgRemoveBtn} onPress={() => f('image', '')} activeOpacity={0.8}>
                      <Ionicons name="close" size={13} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Picker buttons */}
                <View style={fm.imgBtns}>
                  <TouchableOpacity style={fm.imgBtn} onPress={pickFromGallery} activeOpacity={0.75}>
                    <Ionicons name="images-outline" size={16} color={C.primary} />
                    <Text style={fm.imgBtnText}>Browse Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={fm.imgBtn} onPress={pickFromCamera} activeOpacity={0.75}>
                    <Ionicons name="camera-outline" size={16} color={C.primary} />
                    <Text style={fm.imgBtnText}>Take Photo</Text>
                  </TouchableOpacity>
                  <Text style={fm.imgHint}>Square crop · JPEG · max 1 MB recommended</Text>
                </View>
              </View>

              <Text style={[fm.label, { marginTop: 14 }]}>Product Name *</Text>
              <TextInput
                style={fm.input}
                value={form.name}
                onChangeText={v => f('name', v)}
                placeholder="e.g. Whole Milk 1L"
                placeholderTextColor={C.light}
              />
            </View>

            {/* ── Section: Pricing ── */}
            <View style={fm.section}>
              <View style={fm.sectionHeader}>
                <Ionicons name="cash-outline" size={16} color={C.primary} />
                <Text style={fm.sectionTitle}>Pricing</Text>
              </View>

              <View style={fm.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={fm.label}>Sale Price *</Text>
                  <TextInput
                    style={fm.input}
                    value={form.price}
                    onChangeText={v => f('price', v)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={C.light}
                  />
                </View>
                <View style={fm.gap} />
                <View style={{ flex: 1 }}>
                  <Text style={fm.label}>Cost Price</Text>
                  <TextInput
                    style={fm.input}
                    value={form.cost}
                    onChangeText={v => f('cost', v)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={C.light}
                  />
                </View>
              </View>

              {/* Margin preview */}
              {previewMargin !== null && (
                <View style={fm.marginPreview}>
                  <Ionicons name="trending-up" size={14} color={previewMargin >= 0 ? C.green : C.red} />
                  <Text style={[fm.marginText, { color: previewMargin >= 0 ? C.green : C.red }]}>
                    {previewMargin}% margin
                  </Text>
                  <Text style={fm.marginHint}>
                    (PKR {(+form.price - +(form.cost || 0)).toFixed(2)} profit per unit)
                  </Text>
                </View>
              )}
            </View>

            {/* ── Section: Stock ── */}
            <View style={fm.section}>
              <View style={fm.sectionHeader}>
                <Ionicons name="cube-outline" size={16} color={C.primary} />
                <Text style={fm.sectionTitle}>Stock</Text>
              </View>

              <View style={fm.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={fm.label}>Quantity</Text>
                  <TextInput
                    style={fm.input}
                    value={form.quantity}
                    onChangeText={v => f('quantity', v)}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={C.light}
                  />
                </View>
                <View style={fm.gap} />
                <View style={{ flex: 1 }}>
                  <Text style={fm.label}>Low Stock Alert</Text>
                  <TextInput
                    style={fm.input}
                    value={form.lowStockThreshold}
                    onChangeText={v => f('lowStockThreshold', v)}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={C.light}
                  />
                </View>
              </View>

              {/* Stock preview badge */}
              {form.quantity !== '' && (
                <View style={fm.stockPreview}>
                  {(() => {
                    const st = stockBadge(+form.quantity, +form.lowStockThreshold || 10);
                    return (
                      <View style={[fm.stockBadge, { backgroundColor: st.bg }]}>
                        <Ionicons name={st.icon} size={12} color={st.color} />
                        <Text style={[fm.stockBadgeText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>

            {/* ── Section: Category & Barcode ── */}
            <View style={fm.section}>
              <View style={fm.sectionHeader}>
                <Ionicons name="pricetag-outline" size={16} color={C.primary} />
                <Text style={fm.sectionTitle}>Category & Barcode</Text>
              </View>

              <Text style={fm.label}>Category *</Text>
              <CatDropdown
                value={form.category}
                options={categories}
                onSelect={v => f('category', v)}
                placeholder="Select or create category"
              />

              <Text style={[fm.label, { marginTop: 14 }]}>Barcode / SKU</Text>
              <TextInput
                style={fm.input}
                value={form.barcode}
                onChangeText={v => f('barcode', v)}
                placeholder="e.g. 1234567890128"
                placeholderTextColor={C.light}
                keyboardType="number-pad"
              />
            </View>

            {/* ── Section: Tax ── */}
            <View style={fm.section}>
              <View style={fm.sectionHeader}>
                <Ionicons name="receipt-outline" size={16} color={C.primary} />
                <Text style={fm.sectionTitle}>Tax</Text>
              </View>

              <Text style={fm.label}>Tax Rate</Text>
              <TaxPicker value={form.tax} taxes={taxes} onSelect={v => f('tax', v)} />

              <View style={fm.toggleRow}>
                <View>
                  <Text style={fm.toggleLabel}>Override Default Tax</Text>
                  <Text style={fm.toggleSub}>Apply this tax instead of the store default</Text>
                </View>
                <Switch
                  value={form.taxOverride}
                  onValueChange={v => f('taxOverride', v)}
                  trackColor={{ false: C.border, true: C.primary + '80' }}
                  thumbColor={form.taxOverride ? C.primary : '#fff'}
                />
              </View>
            </View>

            {/* ── Action buttons ── */}
            <View style={fm.btnRow}>
              <TouchableOpacity style={fm.btnCancel} onPress={() => setModalVisible(false)}>
                <Text style={fm.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[fm.btnSave, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name={editing ? 'checkmark-done' : 'add-circle'} size={18} color="#fff" />
                      <Text style={fm.btnSaveText}>{editing ? 'Save Changes' : 'Create Product'}</Text>
                    </>
                }
              </TouchableOpacity>
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════
   Styles
══════════════════════════════════════════════════ */

/* Dropdown shared styles */
const dd = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: C.border,
  },
  triggerText: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 32, paddingHorizontal: 0,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: C.text, paddingHorizontal: 20, marginBottom: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  itemActive: { backgroundColor: C.primaryLight },
  itemNew: { borderBottomWidth: 1, borderColor: C.border },
  itemNewText: { fontSize: 14, fontWeight: '600', color: C.primary },
  itemText: { fontSize: 14, color: C.text, fontWeight: '500' },
  itemTextActive: { color: C.primary, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  emptyHint: { paddingHorizontal: 20, paddingVertical: 20, color: C.muted, fontSize: 13, textAlign: 'center' },
});

/* Product card styles */
const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    overflow: 'hidden',
  },
  accent: { width: 4, flexShrink: 0 },
  body: { flex: 1, padding: 14 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarImg: { width: 46, height: 46, borderRadius: 14, flexShrink: 0 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  catBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  barcode: { fontSize: 11, color: C.light, fontStyle: 'italic' },
  name: { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 20 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 6 },
  stockText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 10 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceBlock: { gap: 1 },
  price: { fontSize: 14, fontWeight: '800', color: C.text },
  cost: { fontSize: 11, color: C.light },
  marginBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.primaryLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  marginText: { fontSize: 10, fontWeight: '800', color: C.primary },
  qtyBlock: { alignItems: 'center' },
  qtyNum: { fontSize: 16, fontWeight: '800' },
  qtyLabel: { fontSize: 9, color: C.light, fontWeight: '600', textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: 6 },
  editBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  delBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2',      justifyContent: 'center', alignItems: 'center' },
});

/* Screen & form styles */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
  headerBlob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(99,102,241,0.12)', top: -80, right: -60 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  addBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 1 },
  statVal: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  statLabel: { fontSize: 9, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  toolRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  searchInput: { flex: 1, fontSize: 13, color: C.text },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  sortBtnText: { fontSize: 12, fontWeight: '700', color: C.primary },

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10 },
  catDropBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: C.primary, maxWidth: '65%' },
  catDropBtnActive: { backgroundColor: C.primary },
  catDropText: { fontSize: 13, fontWeight: '700', color: C.primary, flexShrink: 1 },
  catDropTextActive: { color: '#fff' },
  resultCount: { fontSize: 12, color: C.muted, fontWeight: '600' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.muted },
});

const fm = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },

  body: { padding: 16, gap: 0, paddingBottom: 50 },

  section: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.text, textTransform: 'uppercase', letterSpacing: 0.5 },

  label: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border },
  row2: { flexDirection: 'row' },
  gap: { width: 10 },

  marginPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  marginText: { fontSize: 13, fontWeight: '800' },
  marginHint: { fontSize: 12, color: C.muted },

  stockPreview: { marginTop: 10 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  stockBadgeText: { fontSize: 12, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  toggleSub: { fontSize: 11, color: C.muted, marginTop: 2, maxWidth: 220 },

  imgRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 4 },
  imgPreviewWrap: { position: 'relative' },
  imgPreview: { width: 90, height: 90, borderRadius: 14 },
  imgPlaceholder: { width: 90, height: 90, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  imgPlaceholderText: { fontSize: 10, color: C.light, fontWeight: '600' },
  imgRemoveBtn: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
  imgBtns: { flex: 1, gap: 8, justifyContent: 'center' },
  imgBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  imgBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },
  imgHint: { fontSize: 10, color: C.light, lineHeight: 14 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnCancel: { flex: 1, paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: '#F1F5F9' },
  btnCancelText: { color: C.muted, fontWeight: '700', fontSize: 14 },
  btnSave: { flex: 2, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, flexDirection: 'row', gap: 8, shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  btnSaveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
