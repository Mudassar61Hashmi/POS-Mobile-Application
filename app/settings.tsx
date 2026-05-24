import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
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

const CURRENCIES = [
  { code: 'USD', symbol: '$',   name: 'US Dollar' },
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'GBP', symbol: '£',   name: 'British Pound' },
  { code: 'PKR', symbol: '₨',   name: 'Pakistani Rupee' },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼',   name: 'Saudi Riyal' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar' },
];

const TIMEZONES = [
  { value: 'UTC',              label: 'UTC' },
  { value: 'Asia/Karachi',     label: 'Pakistan (PKT)' },
  { value: 'Asia/Kolkata',     label: 'India (IST)' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago',  label: 'US Central (CT)' },
  { value: 'America/Denver',   label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Europe/London',    label: 'UK (GMT/BST)' },
  { value: 'Europe/Berlin',    label: 'Central Europe (CET)' },
  { value: 'Asia/Dubai',       label: 'UAE (GST)' },
  { value: 'Asia/Riyadh',      label: 'Saudi Arabia (AST)' },
  { value: 'Asia/Singapore',   label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AEST)' },
];

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU/PK)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
];

type Settings = {
  storeName: string; storeAddress: string; storePhone: string;
  storeEmail: string; taxNumber: string; currency: string;
  currencySymbol: string; receiptFooter: string;
  timezone: string; dateFormat: string;
  country: string; state: string; city: string;
  whatsappNumber: string;
  notifyNewSale: boolean; notifyLowStock: boolean; lowStockThreshold: number;
  showLogo: boolean; showTaxBreakdown: boolean; showCashierName: boolean;
};

const EMPTY: Settings = {
  storeName: '', storeAddress: '', storePhone: '', storeEmail: '',
  taxNumber: '', currency: 'USD', currencySymbol: '$', receiptFooter: '',
  timezone: 'UTC', dateFormat: 'MM/DD/YYYY',
  country: '', state: '', city: '', whatsappNumber: '',
  notifyNewSale: true, notifyLowStock: true, lowStockThreshold: 10,
  showLogo: true, showTaxBreakdown: true, showCashierName: true,
};

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [dateFormatOpen, setDateFormatOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/store-config');
      if (r.ok) {
        const d = await r.json();
        setSettings({
          storeName:        d.storeName        || '',
          storeAddress:     d.storeAddress     || '',
          storePhone:       d.storePhone       || '',
          storeEmail:       d.storeEmail       || '',
          taxNumber:        d.taxNumber        || '',
          currency:         d.currency         || 'USD',
          currencySymbol:   d.currencySymbol   || '$',
          receiptFooter:    d.receiptFooter    || '',
          timezone:         d.timezone         || 'UTC',
          dateFormat:       d.dateFormat       || 'MM/DD/YYYY',
          country:          d.country          || '',
          state:            d.state            || '',
          city:             d.city             || '',
          whatsappNumber:   d.whatsappNumber   || '',
          notifyNewSale:    d.notifyNewSale    ?? true,
          notifyLowStock:   d.notifyLowStock   ?? true,
          lowStockThreshold:d.lowStockThreshold ?? 10,
          showLogo:         d.showLogo         ?? true,
          showTaxBreakdown: d.showTaxBreakdown ?? true,
          showCashierName:  d.showCashierName  ?? true,
        });
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!settings.storeName.trim()) { Alert.alert('Validation', 'Store name is required'); return; }
    setSaving(true);
    try {
      const r = await apiFetch('/api/store-config', { method: 'PUT', body: JSON.stringify(settings) });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const d = await r.json().catch(() => ({}));
        Alert.alert('Error', d.message || 'Failed to save settings');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const set = (k: keyof Settings, v: any) => setSettings(s => ({ ...s, [k]: v }));

  const selectCurrency = (c: typeof CURRENCIES[0]) => {
    setSettings(s => ({ ...s, currency: c.code, currencySymbol: c.symbol }));
    setCurrencyOpen(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}><Text style={st.backText}>‹</Text></TouchableOpacity>
          <Text style={st.headerTitle}>Settings</Text>
        </View>
        <View style={st.centered}><ActivityIndicator size="large" color={C.blue} /></View>
      </SafeAreaView>
    );
  }

  const selectedCurrency = CURRENCIES.find(c => c.code === settings.currency);
  const selectedTimezone = TIMEZONES.find(t => t.value === settings.timezone);
  const selectedDateFormat = DATE_FORMATS.find(f => f.value === settings.dateFormat);

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}><Text style={st.backText}>‹</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Settings</Text>
          <Text style={st.headerSub}>Store configuration</Text>
        </View>
        <TouchableOpacity style={[st.saveBtn, saved && st.saveBtnSuccess, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>{saved ? '✓ Saved' : 'Save'}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">

        {/* ── Store Information ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Store Information</Text>
          <View style={st.card}>
            <Text style={st.fieldLabel}>Store Name *</Text>
            <TextInput style={st.input} value={settings.storeName} onChangeText={v => set('storeName', v)} placeholder="e.g. My Store" placeholderTextColor={C.light} />

            <Text style={st.fieldLabel}>Address</Text>
            <TextInput style={[st.input, st.inputMulti]} value={settings.storeAddress} onChangeText={v => set('storeAddress', v)} placeholder="Store address" placeholderTextColor={C.light} multiline numberOfLines={2} />

            <Text style={st.fieldLabel}>Phone</Text>
            <TextInput style={st.input} value={settings.storePhone} onChangeText={v => set('storePhone', v)} placeholder="+1 234 567 890" placeholderTextColor={C.light} keyboardType="phone-pad" />

            <Text style={st.fieldLabel}>WhatsApp Number</Text>
            <TextInput style={st.input} value={settings.whatsappNumber} onChangeText={v => set('whatsappNumber', v)} placeholder="+92 300 1234567" placeholderTextColor={C.light} keyboardType="phone-pad" />

            <Text style={st.fieldLabel}>Email</Text>
            <TextInput style={st.input} value={settings.storeEmail} onChangeText={v => set('storeEmail', v)} placeholder="store@example.com" placeholderTextColor={C.light} keyboardType="email-address" autoCapitalize="none" />

            <Text style={st.fieldLabel}>Tax / VAT Number</Text>
            <TextInput style={st.input} value={settings.taxNumber} onChangeText={v => set('taxNumber', v)} placeholder="e.g. TAX-123456" placeholderTextColor={C.light} />
          </View>
        </View>

        {/* ── Location ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Location</Text>
          <View style={st.card}>
            <Text style={st.fieldLabel}>Country</Text>
            <TextInput style={st.input} value={settings.country} onChangeText={v => set('country', v)} placeholder="e.g. Pakistan" placeholderTextColor={C.light} />
            <Text style={st.fieldLabel}>State / Province</Text>
            <TextInput style={st.input} value={settings.state} onChangeText={v => set('state', v)} placeholder="e.g. Punjab" placeholderTextColor={C.light} />
            <Text style={st.fieldLabel}>City</Text>
            <TextInput style={st.input} value={settings.city} onChangeText={v => set('city', v)} placeholder="e.g. Lahore" placeholderTextColor={C.light} />
          </View>
        </View>

        {/* ── Currency ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Currency</Text>
          <View style={st.card}>
            <Text style={st.fieldLabel}>Currency</Text>
            <TouchableOpacity style={st.pickerBtn} onPress={() => { setCurrencyOpen(!currencyOpen); setTimezoneOpen(false); setDateFormatOpen(false); }}>
              <Text style={st.pickerBtnText}>
                {selectedCurrency ? `${selectedCurrency.symbol} ${selectedCurrency.name} (${selectedCurrency.code})` : 'Select Currency'}
              </Text>
              <Text style={st.pickerChevron}>{currencyOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {currencyOpen && (
              <View style={st.dropdown}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity key={c.code} style={[st.dropdownItem, settings.currency === c.code && st.dropdownItemActive]} onPress={() => selectCurrency(c)}>
                    <Text style={[st.dropdownItemText, settings.currency === c.code && st.dropdownItemTextActive]}>
                      {c.symbol}  {c.name} ({c.code})
                    </Text>
                    {settings.currency === c.code && <Text style={{ color: C.green, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Date & Time ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Date & Time</Text>
          <View style={st.card}>
            <Text style={st.fieldLabel}>Timezone</Text>
            <TouchableOpacity style={st.pickerBtn} onPress={() => { setTimezoneOpen(!timezoneOpen); setCurrencyOpen(false); setDateFormatOpen(false); }}>
              <Text style={st.pickerBtnText}>{selectedTimezone?.label || settings.timezone}</Text>
              <Text style={st.pickerChevron}>{timezoneOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {timezoneOpen && (
              <View style={st.dropdown}>
                {TIMEZONES.map(tz => (
                  <TouchableOpacity key={tz.value} style={[st.dropdownItem, settings.timezone === tz.value && st.dropdownItemActive]} onPress={() => { set('timezone', tz.value); setTimezoneOpen(false); }}>
                    <Text style={[st.dropdownItemText, settings.timezone === tz.value && st.dropdownItemTextActive]}>{tz.label}</Text>
                    {settings.timezone === tz.value && <Text style={{ color: C.green, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={st.fieldLabel}>Date Format</Text>
            <TouchableOpacity style={st.pickerBtn} onPress={() => { setDateFormatOpen(!dateFormatOpen); setCurrencyOpen(false); setTimezoneOpen(false); }}>
              <Text style={st.pickerBtnText}>{selectedDateFormat?.label || settings.dateFormat}</Text>
              <Text style={st.pickerChevron}>{dateFormatOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {dateFormatOpen && (
              <View style={st.dropdown}>
                {DATE_FORMATS.map(f => (
                  <TouchableOpacity key={f.value} style={[st.dropdownItem, settings.dateFormat === f.value && st.dropdownItemActive]} onPress={() => { set('dateFormat', f.value); setDateFormatOpen(false); }}>
                    <Text style={[st.dropdownItemText, settings.dateFormat === f.value && st.dropdownItemTextActive]}>{f.label}</Text>
                    {settings.dateFormat === f.value && <Text style={{ color: C.green, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Notifications ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Notifications</Text>
          <View style={st.card}>
            <View style={st.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.toggleLabel}>New Sale Alert</Text>
                <Text style={st.toggleHint}>Notify when a new sale is completed</Text>
              </View>
              <Switch value={settings.notifyNewSale} onValueChange={v => set('notifyNewSale', v)} trackColor={{ true: C.green }} />
            </View>
            <View style={st.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.toggleLabel}>Low Stock Alert</Text>
                <Text style={st.toggleHint}>Notify when product stock is low</Text>
              </View>
              <Switch value={settings.notifyLowStock} onValueChange={v => set('notifyLowStock', v)} trackColor={{ true: C.green }} />
            </View>
            {settings.notifyLowStock && (
              <>
                <Text style={st.fieldLabel}>Low Stock Threshold</Text>
                <TextInput style={st.input} value={String(settings.lowStockThreshold)}
                  onChangeText={v => set('lowStockThreshold', parseInt(v) || 0)}
                  keyboardType="number-pad" placeholder="10" placeholderTextColor={C.light} />
                <Text style={st.fieldHint}>Alert when stock falls at or below this number</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Receipt ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Receipt</Text>
          <View style={st.card}>
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>Show Store Logo</Text>
              <Switch value={settings.showLogo} onValueChange={v => set('showLogo', v)} trackColor={{ true: C.green }} />
            </View>
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>Show Tax Breakdown</Text>
              <Switch value={settings.showTaxBreakdown} onValueChange={v => set('showTaxBreakdown', v)} trackColor={{ true: C.green }} />
            </View>
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>Show Cashier Name</Text>
              <Switch value={settings.showCashierName} onValueChange={v => set('showCashierName', v)} trackColor={{ true: C.green }} />
            </View>

            <Text style={st.fieldLabel}>Receipt Footer Message</Text>
            <TextInput style={[st.input, st.inputMulti]} value={settings.receiptFooter}
              onChangeText={v => set('receiptFooter', v)}
              placeholder="e.g. Thank you for shopping with us!"
              placeholderTextColor={C.light} multiline numberOfLines={3} />
            <Text style={st.fieldHint}>This message appears at the bottom of every receipt.</Text>
          </View>
        </View>

        {/* Save button at bottom */}
        <TouchableOpacity style={[st.saveBottomBtn, saved && st.saveBtnSuccess, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>{saved ? '✓ Settings Saved!' : 'Save Settings'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { paddingRight: 4 },
  backText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#94a3b8', fontSize: 12 },
  saveBtn: { backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  saveBtnSuccess: { backgroundColor: C.green },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  body: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 14 },
  fieldHint: { fontSize: 12, color: C.light, marginTop: 6 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  toggleHint: { fontSize: 12, color: C.muted, marginTop: 2 },

  pickerBtn: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerBtnText: { fontSize: 14, color: C.text, flex: 1 },
  pickerChevron: { fontSize: 10, color: C.muted },
  dropdown: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 6, overflow: 'hidden', maxHeight: 280 },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: C.border },
  dropdownItemActive: { backgroundColor: '#f0fdf4' },
  dropdownItemText: { fontSize: 14, color: C.text },
  dropdownItemTextActive: { color: C.green, fontWeight: '600' },

  saveBottomBtn: { backgroundColor: C.navy, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
