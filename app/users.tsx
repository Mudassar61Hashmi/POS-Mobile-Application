import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const C = {
  navy: '#0f172a', blue: '#2563eb', green: '#059669', amber: '#d97706',
  red: '#ef4444', bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', muted: '#64748b', light: '#94a3b8',
};

type Role = 'superadmin' | 'admin' | 'manager' | 'cashier';
type Status = 'active' | 'inactive';

type AppUser = {
  _id: string; name: string; email: string; username: string;
  role: Role; status: Status; createdAt: string; lastLogin: string | null;
};

const ROLE_META: Record<Role, { color: string; bg: string }> = {
  superadmin: { color: '#f59e0b', bg: '#fef3c7' },
  admin:      { color: '#22d3ee', bg: '#cffafe' },
  manager:    { color: '#34d399', bg: '#d1fae5' },
  cashier:    { color: '#a78bfa', bg: '#ede9fe' },
};

const CAN_CREATE: Record<Role, Role[]> = {
  superadmin: ['admin', 'manager', 'cashier'],
  admin:      ['manager', 'cashier'],
  manager:    ['cashier'],
  cashier:    [],
};

const ROLES: Role[] = ['superadmin', 'admin', 'manager', 'cashier'];

type UserForm = { name: string; email: string; username: string; password: string; role: Role; status: Status };

export default function UsersScreen() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState<UserForm>({ name: '', email: '', username: '', password: '', role: 'cashier', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);

  const myRole = (me?.role || 'cashier') as Role;
  const allowedRoles = CAN_CREATE[myRole] || [];

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await apiFetch('/api/users');
      if (r.ok) setUsers(await r.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', email: '', username: '', password: '', role: allowedRoles[0] || 'cashier', status: 'active' });
    setModalVisible(true);
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, username: u.username, password: '', role: u.role, status: u.status });
    setModalVisible(true);
  };

  const handleDelete = (u: AppUser) => {
    if (u._id === me?.id) { Alert.alert('Error', 'Cannot delete your own account'); return; }
    Alert.alert('Delete User', `Delete "${u.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingId(u._id);
          try {
            const r = await apiFetch(`/api/users/${u._id}`, { method: 'DELETE' });
            if (r.ok) load();
            else Alert.alert('Error', 'Failed to delete user');
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setDeletingId(null); }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    if (!form.username.trim()) { Alert.alert('Validation', 'Username is required'); return; }
    if (!editing && !form.password) { Alert.alert('Validation', 'Password is required for new users'); return; }
    setSaving(true);
    try {
      const body: any = { name: form.name.trim(), email: form.email.trim(), username: form.username.trim(), role: form.role, status: form.status };
      if (!editing || form.password) body.password = form.password;
      const url = editing ? `/api/users/${editing._id}` : '/api/users';
      const method = editing ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (r.ok) { setModalVisible(false); load(); }
      else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed'); }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { Alert.alert('Validation', 'Password must be at least 6 characters'); return; }
    setResetting(true);
    try {
      const r = await apiFetch(`/api/users/${resetUser!._id}/reset-password`, {
        method: 'PATCH', body: JSON.stringify({ newPassword }),
      });
      if (r.ok) { setResetModalVisible(false); setNewPassword(''); Alert.alert('Success', 'Password reset successfully'); }
      else { const d = await r.json().catch(() => ({})); Alert.alert('Error', d.message || 'Failed'); }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setResetting(false); }
  };

  const renderUser = ({ item: u }: { item: AppUser }) => {
    const rm = ROLE_META[u.role] || ROLE_META.cashier;
    const canManage = allowedRoles.includes(u.role) || u._id === me?.id;
    return (
      <View style={s.card}>
        <View style={s.cardLeft}>
          <View style={[s.avatar, { backgroundColor: rm.bg }]}>
            <Text style={[s.avatarText, { color: rm.color }]}>{u.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{u.name}</Text>
            <Text style={s.userUsername}>@{u.username}</Text>
            {u.email ? <Text style={s.userEmail}>{u.email}</Text> : null}
            <View style={s.userMeta}>
              <View style={[s.roleBadge, { backgroundColor: rm.bg }]}>
                <Text style={[s.roleBadgeText, { color: rm.color }]}>{u.role}</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: u.status === 'active' ? '#d1fae5' : '#f3f4f6' }]}>
                <Text style={[s.statusBadgeText, { color: u.status === 'active' ? C.green : C.muted }]}>
                  {u.status}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {canManage && (
          <View style={s.cardActions}>
            <TouchableOpacity style={s.editBtn} onPress={() => openEdit(u)}>
              <Text style={s.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.resetBtn} onPress={() => { setResetUser(u); setNewPassword(''); setResetModalVisible(true); }}>
              <Text style={s.resetBtnText}>Reset</Text>
            </TouchableOpacity>
            {u._id !== me?.id && (
              <TouchableOpacity
                style={[s.delBtn, deletingId === u._id && { opacity: 0.5 }]}
                onPress={() => handleDelete(u)}
                disabled={deletingId === u._id}
              >
                {deletingId === u._id ? <ActivityIndicator size="small" color={C.red} /> : <Text style={s.delBtnText}>Del</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
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
          <Text style={s.headerTitle}>User Management</Text>
          <Text style={s.headerSub}>{users.length} users</Text>
        </View>
        {allowedRoles.length > 0 && (
          <TouchableOpacity style={s.addBtn} onPress={openAdd}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput style={s.search} value={search} onChangeText={setSearch} placeholder="Search by name or username..." placeholderTextColor={C.light} />
        {search ? <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}><Text style={{ color: C.muted, fontWeight: '700' }}>×</Text></TouchableOpacity> : null}
      </View>

      {/* Role filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {(['all', ...ROLES] as const).map(role => (
          <TouchableOpacity key={role} style={[s.filterChip, roleFilter === role && s.filterChipActive]} onPress={() => setRoleFilter(role)}>
            <Text style={[s.filterChipText, roleFilter === role && s.filterChipTextActive]}>
              {role === 'all' ? 'All' : role}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={u => u._id}
          renderItem={renderUser}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>👤</Text>
              <Text style={s.emptyText}>No users found</Text>
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? 'Edit User' : 'Add User'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Full Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. John Doe" placeholderTextColor={C.light} />

            <Text style={s.fieldLabel}>Username *</Text>
            <TextInput style={s.input} value={form.username} onChangeText={v => setForm(f => ({ ...f, username: v }))} placeholder="e.g. johndoe" placeholderTextColor={C.light} autoCapitalize="none" />

            <Text style={s.fieldLabel}>Email</Text>
            <TextInput style={s.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="e.g. john@example.com" placeholderTextColor={C.light} keyboardType="email-address" autoCapitalize="none" />

            <Text style={s.fieldLabel}>{editing ? 'New Password (leave blank to keep)' : 'Password *'}</Text>
            <TextInput style={s.input} value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))} placeholder="Min 6 characters" placeholderTextColor={C.light} secureTextEntry />

            <Text style={s.fieldLabel}>Role</Text>
            <View style={s.roleGrid}>
              {allowedRoles.map(role => {
                const rm = ROLE_META[role];
                return (
                  <TouchableOpacity key={role} style={[s.roleBtn, form.role === role && { backgroundColor: rm.bg, borderColor: rm.color }]} onPress={() => setForm(f => ({ ...f, role }))}>
                    <Text style={[s.roleBtnText, form.role === role && { color: rm.color }]}>{role}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Status</Text>
            <View style={s.row2}>
              {(['active', 'inactive'] as Status[]).map(st => (
                <TouchableOpacity key={st} style={[s.statusBtn, form.status === st && s.statusBtnActive]} onPress={() => setForm(f => ({ ...f, status: st }))}>
                  <Text style={[s.statusBtnText, form.status === st && s.statusBtnTextActive]}>{st}</Text>
                </TouchableOpacity>
              ))}
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

      {/* Reset Password Modal */}
      <Modal visible={resetModalVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Reset Password</Text>
            <TouchableOpacity onPress={() => setResetModalVisible(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.modalBody}>
            <Text style={s.resetFor}>Reset password for {resetUser?.name}</Text>
            <Text style={s.fieldLabel}>New Password</Text>
            <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} placeholder="Min 6 characters" placeholderTextColor={C.light} secureTextEntry />
            <View style={[s.row2, { marginTop: 24 }]}>
              <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setResetModalVisible(false)}>
                <Text style={s.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ width: 12 }} />
              <TouchableOpacity style={[s.btn, s.btnPrimary, resetting && { opacity: 0.6 }]} onPress={handleResetPassword} disabled={resetting}>
                {resetting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Reset</Text>}
              </TouchableOpacity>
            </View>
          </View>
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

  filterScroll: { marginBottom: 8 },
  filterChip: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.navy, borderColor: C.navy },
  filterChipText: { fontSize: 12, fontWeight: '600', color: C.muted, textTransform: 'capitalize' },
  filterChipTextActive: { color: '#fff' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 15, fontWeight: '500' },

  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  cardLeft: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 18, fontWeight: '800' },
  userName: { fontSize: 15, fontWeight: '700', color: C.text },
  userUsername: { fontSize: 12, color: C.muted, marginTop: 1 },
  userEmail: { fontSize: 12, color: C.light, marginTop: 1 },
  userMeta: { flexDirection: 'row', gap: 6, marginTop: 6 },
  roleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: C.border, paddingTop: 12 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#dbeafe' },
  editBtnText: { fontSize: 12, color: C.blue, fontWeight: '700' },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fef3c7' },
  resetBtnText: { fontSize: 12, color: C.amber, fontWeight: '700' },
  delBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fef2f2', marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 30 },
  delBtnText: { fontSize: 12, color: C.red, fontWeight: '700' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalClose: { fontSize: 20, color: C.muted, paddingHorizontal: 4 },
  modalBody: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text },
  row2: { flexDirection: 'row' },

  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: C.border },
  roleBtnText: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'capitalize' },

  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  statusBtnActive: { backgroundColor: C.navy },
  statusBtnText: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'capitalize' },
  statusBtnTextActive: { color: '#fff' },

  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  btnPrimary: { backgroundColor: C.navy },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline: { backgroundColor: '#f1f5f9' },
  btnOutlineText: { color: C.muted, fontWeight: '700', fontSize: 15 },

  resetFor: { fontSize: 15, color: C.text, fontWeight: '600', marginBottom: 4 },
});
