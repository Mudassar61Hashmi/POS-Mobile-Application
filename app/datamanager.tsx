import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiFetch } from '@/lib/api';

const C = {
  navy: '#0f172a', blue: '#2563eb', green: '#059669', amber: '#d97706',
  red: '#ef4444', bg: '#f0f2f5', card: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', muted: '#64748b', light: '#94a3b8',
};

type DataTab = 'products' | 'customers' | 'sales' | 'payments';
interface ImportResult { created: number; updated: number; failed: number; errors: string[] }

const TABS: { key: DataTab; label: string; icon: string; color: string; bg: string; canImport: boolean }[] = [
  { key: 'products',  label: 'Products',  icon: '📦', color: '#7c3aed', bg: '#ede9fe', canImport: true  },
  { key: 'customers', label: 'Customers', icon: '👥', color: '#ea580c', bg: '#ffedd5', canImport: true  },
  { key: 'sales',     label: 'Sales',     icon: '🧾', color: '#059669', bg: '#d1fae5', canImport: false },
  { key: 'payments',  label: 'Payments',  icon: '💳', color: '#0891b2', bg: '#cffafe', canImport: false },
];

const EXPORT_FIELDS: Record<DataTab, string[]> = {
  products:  ['name', 'barcode', 'category', 'price', 'quantity', 'lowStockThreshold'],
  customers: ['name', 'phone', 'email', 'createdAt'],
  sales:     ['invoiceNumber', 'date', 'cashier', 'customer', 'payment', 'subtotal', 'discount', 'tax', 'total', 'status'],
  payments:  ['date', 'reference', 'method', 'amount', 'fee', 'net', 'customer', 'status', 'note'],
};

const IMPORT_RULES: Record<'products' | 'customers', string[]> = {
  products: [
    'name (required), barcode, category, price, quantity',
    'Matching barcode → updates existing product',
    'Otherwise matches by name → updates or creates',
    'Download template for correct column names',
  ],
  customers: [
    'name and phone are required',
    'Matching phone → updates existing customer',
    'Otherwise creates a new customer',
    'Download template for correct column names',
  ],
};

/* ── CSV helpers ── */
function toCSV(headers: string[], rows: (string | number | undefined | null)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (l: string) => {
    const r: string[] = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { q && l[i + 1] === '"' ? (cur += '"', i++) : (q = !q); }
      else if (c === ',' && !q) { r.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    r.push(cur.trim()); return r;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.replace(/,/g, '').trim())
    .map(l => {
      const vals = parseLine(l);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
}

function fmtDate(iso: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export default function DataManagerScreen() {
  const [tab, setTab] = useState<DataTab>('products');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importFile, setImportFile] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const tabMeta = TABS.find(t => t.key === tab)!;

  const showMsg = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const switchTab = (t: DataTab) => {
    setTab(t);
    setImportRows([]);
    setImportFile('');
    setImportResult(null);
    setShowPreview(false);
  };

  /* ── EXPORT ── */
  const handleExport = async () => {
    setExporting(true);
    try {
      let csv = '';
      let filename = '';

      if (tab === 'products') {
        const res = await apiFetch('/api/products');
        const data: any[] = await res.json();
        csv = toCSV(
          ['name', 'barcode', 'category', 'price', 'quantity', 'lowStockThreshold'],
          data.map(p => [p.name, p.barcode || '', p.category || '', p.price, p.quantity, p.lowStockThreshold ?? 10])
        );
        filename = `products_${new Date().toISOString().slice(0, 10)}.csv`;
        showMsg(`Exporting ${data.length} products…`);

      } else if (tab === 'customers') {
        const res = await apiFetch('/api/customers?limit=5000');
        const raw = await res.json();
        const rows = Array.isArray(raw) ? raw : (raw.customers || []);
        csv = toCSV(
          ['name', 'phone', 'email', 'createdAt'],
          rows.map((c: any) => [c.name, c.phone || '', c.email || '', fmtDate(c.createdAt)])
        );
        filename = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
        showMsg(`Exporting ${rows.length} customers…`);

      } else if (tab === 'sales') {
        const res = await apiFetch('/api/sales?limit=5000');
        const raw = await res.json();
        const rows = Array.isArray(raw) ? raw : [];
        csv = toCSV(
          ['invoiceNumber', 'date', 'cashier', 'customerName', 'paymentMethod', 'subtotal', 'discount', 'tax', 'total', 'status', 'itemCount'],
          rows.map((s: any) => [
            s.invoiceNumber || s._id?.slice(-8) || '',
            fmtDate(s.createdAt || s.timestamp),
            s.cashier || '',
            s.customerName || 'Walk-in',
            s.paymentMethod || 'cash',
            s.subtotal ?? s.total,
            s.discount ?? 0,
            s.tax ?? 0,
            s.total,
            s.status || 'completed',
            s.items?.length ?? s.itemCount ?? 0,
          ])
        );
        filename = `sales_${new Date().toISOString().slice(0, 10)}.csv`;
        showMsg(`Exporting ${rows.length} sales…`);

      } else {
        const res = await apiFetch('/api/payments?limit=5000');
        const raw = await res.json();
        const rows = Array.isArray(raw) ? raw : [];
        csv = toCSV(
          ['date', 'transactionRef', 'methodName', 'methodType', 'amount', 'processingFee', 'netAmount', 'customerName', 'status', 'note'],
          rows.map((p: any) => [
            fmtDate(p.createdAt),
            p.transactionRef || '',
            p.methodName || '',
            p.methodType || '',
            p.amount,
            p.processingFee ?? 0,
            p.netAmount ?? p.amount,
            p.customerName || 'Walk-in',
            p.status || 'completed',
            p.note || '',
          ])
        );
        filename = `payments_${new Date().toISOString().slice(0, 10)}.csv`;
        showMsg(`Exporting payments…`);
      }

      /* Write CSV to temp file and share */
      const file = new File(Paths.cache, filename);
      file.write('﻿' + csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: `Export ${filename}` });
      } else {
        Alert.alert('Exported', `File saved to cache: ${filename}`);
      }
      showMsg('Export complete');
    } catch (e: any) {
      showMsg(e?.message || 'Export failed', false);
    } finally {
      setExporting(false);
    }
  };

  /* ── TEMPLATE download ── */
  const handleTemplate = async () => {
    try {
      let csv = '';
      let filename = '';
      if (tab === 'products') {
        csv = toCSV(
          ['name', 'barcode', 'category', 'price', 'cost', 'quantity', 'lowStockThreshold'],
          [
            ['Sample Product', '1234567890', 'General', '9.99', '0.00', '50', '5'],
            ['Another Item',   '0987654321', 'Electronics', '49.99', '30.00', '10', '3'],
          ]
        );
        filename = 'products_template.csv';
      } else {
        csv = toCSV(
          ['name', 'phone', 'email'],
          [
            ['Ahmed Khan',  '+92-300-0000000', 'ahmed@example.com'],
            ['Sara Malik',  '+92-321-1111111', ''],
          ]
        );
        filename = 'customers_template.csv';
      }
      const file = new File(Paths.cache, filename);
      file.write('﻿' + csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: `Template: ${filename}` });
      }
    } catch (e: any) {
      showMsg('Failed to generate template', false);
    }
  };

  /* ── PICK CSV FILE ── */
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.name.endsWith('.csv') && !asset.mimeType?.includes('csv')) {
        showMsg('Please pick a .csv file', false);
        return;
      }
      const text = await new File(asset.uri).text();
      const rows = parseCSV(text);
      if (!rows.length) {
        showMsg('File is empty or has no valid rows', false);
        return;
      }
      setImportRows(rows);
      setImportFile(asset.name);
      setImportResult(null);
      setShowPreview(true);
    } catch (e: any) {
      showMsg(e?.message || 'Failed to read file', false);
    }
  };

  /* ── IMPORT ── */
  const handleImport = async () => {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const endpoint = tab === 'products' ? '/api/import/products' : '/api/import/customers';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: importRows }),
      });
      const data = await res.json() as ImportResult;
      if (!res.ok) throw new Error((data as any).message || 'Import failed');
      setImportResult(data);
      showMsg(
        `Import done: ${data.created} created, ${data.updated} updated${data.failed ? `, ${data.failed} failed` : ''}`,
        data.failed === 0
      );
    } catch (e: any) {
      showMsg(e?.message || 'Import failed', false);
    } finally {
      setImporting(false);
    }
  };

  const clearImport = () => {
    setImportRows([]);
    setImportFile('');
    setImportResult(null);
    setShowPreview(false);
  };

  const previewHeaders = importRows.length > 0 ? Object.keys(importRows[0]) : [];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Data Manager</Text>
          <Text style={s.headerSub}>Export CSV or bulk-import records</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Tab chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => switchTab(t.key)}
                  style={[s.tabChip, active && { backgroundColor: t.bg, borderColor: t.color }]}
                >
                  <Text style={{ fontSize: 14, marginRight: 4 }}>{t.icon}</Text>
                  <Text style={[s.tabChipLabel, active && { color: t.color }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* ── EXPORT CARD ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconBox, { backgroundColor: tabMeta.bg }]}>
              <Text style={{ fontSize: 18 }}>⬇️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Export {tabMeta.label}</Text>
              <Text style={s.cardSub}>Download all records as a CSV file</Text>
            </View>
          </View>

          {/* Fields included */}
          <View style={s.fieldsBox}>
            <Text style={s.fieldsLabel}>FIELDS INCLUDED</Text>
            <View style={s.fieldsPills}>
              {EXPORT_FIELDS[tab].map(f => (
                <View key={f} style={[s.fieldPill, { backgroundColor: tabMeta.bg }]}>
                  <Text style={[s.fieldPillText, { color: tabMeta.color }]}>{f}</Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: tabMeta.color }, exporting && s.btnDisabled]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.primaryBtnText}>⬇ Download CSV</Text>}
          </TouchableOpacity>

          {tabMeta.canImport && (
            <TouchableOpacity style={s.outlineBtn} onPress={handleTemplate}>
              <Text style={s.outlineBtnText}>📄 Download Import Template</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── IMPORT CARD ── */}
        {tabMeta.canImport && (
          <View style={[s.card, { marginTop: 14 }]}>
            <View style={s.cardHeader}>
              <View style={[s.cardIconBox, { backgroundColor: tabMeta.bg }]}>
                <Text style={{ fontSize: 18 }}>⬆️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Import {tabMeta.label}</Text>
                <Text style={s.cardSub}>Upload CSV to create or update records</Text>
              </View>
            </View>

            {!importRows.length ? (
              /* Pick file zone */
              <TouchableOpacity style={s.dropZone} onPress={handlePickFile}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📂</Text>
                <Text style={s.dropZoneTitle}>Tap to choose CSV file</Text>
                <Text style={s.dropZoneSub}>UTF-8 encoded .csv • Products or Customers</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 10 }}>
                {/* File info */}
                <View style={[s.fileInfo, { borderColor: tabMeta.color + '44', backgroundColor: tabMeta.bg }]}>
                  <Text style={{ fontSize: 16, marginRight: 8 }}>📊</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fileName} numberOfLines={1}>{importFile}</Text>
                    <Text style={s.fileRows}>{importRows.length} rows detected</Text>
                  </View>
                  <TouchableOpacity onPress={clearImport}>
                    <Text style={s.clearBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Preview toggle */}
                <TouchableOpacity style={s.previewToggle} onPress={() => setShowPreview(v => !v)}>
                  <Text style={s.previewToggleText}>{showPreview ? '▲ Hide' : '▼ Show'} preview (first 5 rows)</Text>
                </TouchableOpacity>

                {/* Preview table */}
                {showPreview && importRows.length > 0 && (
                  <View style={s.previewTable}>
                    <ScrollView horizontal showsHorizontalScrollIndicator>
                      <View>
                        {/* Header row */}
                        <View style={[s.tableRow, s.tableHeaderRow]}>
                          {previewHeaders.map(h => (
                            <Text key={h} style={s.tableHeaderCell}>{h}</Text>
                          ))}
                        </View>
                        {/* Data rows */}
                        {importRows.slice(0, 5).map((row, i) => (
                          <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                            {previewHeaders.map(h => (
                              <Text key={h} style={s.tableCell} numberOfLines={1}>{row[h] || '—'}</Text>
                            ))}
                          </View>
                        ))}
                        {importRows.length > 5 && (
                          <View style={s.tableMore}>
                            <Text style={s.tableMoreText}>+{importRows.length - 5} more rows not shown</Text>
                          </View>
                        )}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* Import result */}
                {importResult && (
                  <View style={[s.resultBox, {
                    borderColor: importResult.failed > 0 ? '#f59e0b44' : '#34d39944',
                    backgroundColor: importResult.failed > 0 ? '#fef3c7' : '#ecfdf5',
                  }]}>
                    <View style={s.resultRow}>
                      {[
                        { label: 'Created', val: importResult.created, color: '#059669' },
                        { label: 'Updated', val: importResult.updated, color: '#2563eb' },
                        { label: 'Failed',  val: importResult.failed,  color: '#ef4444' },
                      ].map(stat => (
                        <View key={stat.label} style={s.resultStat}>
                          <Text style={[s.resultVal, { color: stat.color }]}>{stat.val}</Text>
                          <Text style={s.resultLabel}>{stat.label}</Text>
                        </View>
                      ))}
                    </View>
                    {importResult.errors.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        {importResult.errors.slice(0, 3).map((err, i) => (
                          <Text key={i} style={s.errorLine}>• {err}</Text>
                        ))}
                        {importResult.errors.length > 3 && (
                          <Text style={s.errorLine}>…and {importResult.errors.length - 3} more</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Import / Reset buttons */}
                {!importResult ? (
                  <TouchableOpacity
                    style={[s.primaryBtn, { backgroundColor: tabMeta.color }, importing && s.btnDisabled]}
                    onPress={handleImport}
                    disabled={importing}
                  >
                    {importing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.primaryBtnText}>⬆ Import {importRows.length} {tabMeta.label}</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.outlineBtn} onPress={clearImport}>
                    <Text style={s.outlineBtnText}>🔄 Import another file</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Import rules */}
            <View style={[s.rulesBox, { marginTop: 12 }]}>
              <Text style={s.rulesTitle}>IMPORT RULES</Text>
              {IMPORT_RULES[tab as 'products' | 'customers'].map((rule, i) => (
                <Text key={i} style={s.ruleItem}>• {rule}</Text>
              ))}
            </View>
          </View>
        )}

        {/* ── TIPS ── */}
        <View style={[s.card, { marginTop: 14 }]}>
          <Text style={[s.cardTitle, { marginBottom: 12 }]}>Tips for CSV import</Text>
          <View style={{ gap: 10 }}>
            {[
              { icon: '📥', title: 'Use the template', desc: 'Download the template first — it has the exact column names needed' },
              { icon: '💾', title: 'Save as CSV', desc: 'Export from Excel/Google Sheets as CSV (UTF-8 if available)' },
              { icon: '🔄', title: 'Safe to re-import', desc: 'Records are matched by barcode/phone and updated, not duplicated' },
            ].map((tip, i) => (
              <View key={i} style={s.tipCard}>
                <Text style={{ fontSize: 22, marginBottom: 6 }}>{tip.icon}</Text>
                <Text style={s.tipTitle}>{tip.title}</Text>
                <Text style={s.tipDesc}>{tip.desc}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Toast */}
      {toast && (
        <View style={[s.toast, { backgroundColor: toast.ok ? '#059669' : '#ef4444' }]}>
          <Text style={s.toastText}>{toast.ok ? '✓ ' : '✕ '}{toast.msg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    backgroundColor: C.navy, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  backBtn:    { padding: 4 },
  backArrow:  { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 28 },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub:  { color: '#94a3b8', fontSize: 11, marginTop: 1 },

  tabChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.card,
  },
  tabChipLabel: { fontSize: 13, fontWeight: '700', color: C.muted },

  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  cardIconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardTitle:   { fontSize: 15, fontWeight: '800', color: C.text },
  cardSub:     { fontSize: 11, color: C.muted, marginTop: 1 },

  fieldsBox:   { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  fieldsLabel: { fontSize: 9, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
  fieldsPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fieldPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fieldPillText:{ fontSize: 10, fontWeight: '700' },

  primaryBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  btnDisabled: { opacity: 0.65 },
  outlineBtn: {
    marginTop: 10, borderRadius: 12, paddingVertical: 11, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
  },
  outlineBtnText: { color: C.muted, fontSize: 12, fontWeight: '700' },

  dropZone: {
    borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', borderRadius: 16,
    paddingVertical: 36, alignItems: 'center', backgroundColor: '#f8fafc',
  },
  dropZoneTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  dropZoneSub:   { fontSize: 11, color: C.muted },

  fileInfo: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderRadius: 12, borderWidth: 1,
  },
  fileName:  { fontSize: 12, fontWeight: '700', color: C.text },
  fileRows:  { fontSize: 10, color: C.muted, marginTop: 1 },
  clearBtn:  { color: C.red, fontSize: 16, fontWeight: '700', padding: 4 },

  previewToggle: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  previewToggleText: { fontSize: 11, fontWeight: '700', color: C.muted },

  previewTable: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden',
  },
  tableRow:       { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.border },
  tableHeaderRow: { backgroundColor: '#f8fafc' },
  tableRowAlt:    { backgroundColor: '#f8fafc' },
  tableHeaderCell:{ paddingHorizontal: 10, paddingVertical: 8, fontSize: 10, fontWeight: '700', color: C.muted, minWidth: 90 },
  tableCell:      { paddingHorizontal: 10, paddingVertical: 7, fontSize: 11, color: C.text, minWidth: 90 },
  tableMore:      { padding: 8, backgroundColor: '#f8fafc' },
  tableMoreText:  { fontSize: 10, color: C.muted },

  resultBox:  { borderWidth: 1, borderRadius: 14, padding: 14 },
  resultRow:  { flexDirection: 'row', gap: 24 },
  resultStat: { alignItems: 'center' },
  resultVal:  { fontSize: 26, fontWeight: '900' },
  resultLabel:{ fontSize: 9, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  errorLine:  { fontSize: 11, color: '#d97706', marginTop: 2 },

  rulesBox:  { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  rulesTitle:{ fontSize: 9, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
  ruleItem:  { fontSize: 11, color: C.muted, lineHeight: 18, marginBottom: 2 },

  tipCard:  { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  tipTitle: { fontSize: 12, fontWeight: '800', color: C.text, marginBottom: 2 },
  tipDesc:  { fontSize: 11, color: C.muted, lineHeight: 16 },

  toast: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
