import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { apiFetch } from '@/lib/api';

const C = {
  navy: '#0C0A2E', blue: '#6366F1', green: '#10B981', amber: '#F59E0B',
  red: '#EF4444', purple: '#8B5CF6', bg: '#F0F0FA', card: '#ffffff',
  border: '#E5E7EB', text: '#111827', muted: '#6B7280', light: '#9CA3AF',
  primary: '#6366F1', primaryLight: '#EEF2FF',
};

type SaleRow = {
  id: string; invoiceNumber: string; cashier: string; customerName: string;
  total: number; paymentMethod: string; status: string; itemCount: number; timestamp: string;
};

type SaleDetail = SaleRow & {
  subtotal: number; discount: number; couponCode?: string; couponDiscount?: number;
  flatDiscount?: number; tax: number; taxName: string; taxRate?: number;
  cashReceived?: number; change?: number; note: string;
  items: { name: string; quantity: number; price: number; lineTotal: number }[];
};

const STATUS_COLORS: Record<string, string> = {
  completed: C.green, refunded: C.amber, cancelled: C.red,
  pending: C.purple, processing: C.blue,
};

const ALL_STATUSES = ['all', 'completed', 'pending', 'processing', 'cancelled', 'refunded'];

const TRANSITIONS: Record<string, string[]> = {
  pending:    ['processing', 'completed', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed:  ['refunded', 'cancelled'],
  refunded:   [],
  cancelled:  ['pending'],
};

const DESTRUCTIVE_STATUSES = new Set(['cancelled', 'refunded']);

function normalizePayMethod(m?: string): string {
  if (!m || m === 'cash') return 'Cash';
  if (m === 'card' || m === 'card_credit' || m === 'card_debit') return 'Card';
  if (['mobile_wallet', 'jazzcash', 'easypaisa', 'sadapay', 'nayapay'].includes(m)) return 'Mobile Wallet';
  if (m === 'bank_transfer') return 'Bank Transfer';
  return m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ');
}

/* ════════════════════════════════════════
   QR / Barcode Scanner Modal
════════════════════════════════════════ */
function QRScannerModal({ onScanned, onClose }: {
  onScanned(value: string): void;
  onClose(): void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScanned(data);
  }, [scanned, onScanned]);

  if (!permission) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={qs.container}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={qs.permContainer}>
          <View style={qs.permIconWrap}>
            <Ionicons name="camera-outline" size={48} color={C.primary} />
          </View>
          <Text style={qs.permTitle}>Camera Permission</Text>
          <Text style={qs.permDesc}>
            Allow camera access to scan customer QR codes and invoice barcodes for instant lookup
          </Text>
          <TouchableOpacity style={qs.permBtn} onPress={requestPermission}>
            <Text style={qs.permBtnTxt}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={qs.permCancelBtn} onPress={onClose}>
            <Text style={qs.permCancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={qs.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code93', 'itf14', 'datamatrix'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        >
          {/* Header */}
          <SafeAreaView style={qs.headerWrap} edges={['top']}>
            <View style={qs.scanHeader}>
              <TouchableOpacity style={qs.closeCircle} onPress={onClose}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={qs.scanTitle}>Scan Customer QR</Text>
              <View style={{ width: 42 }} />
            </View>
          </SafeAreaView>

          {/* Viewfinder frame */}
          <View style={qs.viewfinder}>
            <View style={qs.frame}>
              <View style={[qs.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
              <View style={[qs.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
              <View style={[qs.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
              <View style={[qs.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
            </View>
          </View>

          {/* Bottom hint */}
          <SafeAreaView edges={['bottom']}>
            <View style={qs.bottomWrap}>
              <Ionicons name="qr-code-outline" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={qs.scanHint}>Point camera at customer QR code or invoice barcode</Text>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    </Modal>
  );
}

const qs = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#000' },
  permContainer: {
    flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center',
    gap: 14, paddingHorizontal: 36,
  },
  permIconWrap: {
    width: 88, height: 88, borderRadius: 24, backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  permTitle:     { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  permDesc:      { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  permBtn:       { backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 36, paddingVertical: 14, marginTop: 6 },
  permBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 15 },
  permCancelBtn: { padding: 12 },
  permCancelTxt: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
  headerWrap:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  scanHeader:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  scanTitle:  { color: '#fff', fontSize: 17, fontWeight: '800' },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame:      {
    width: 260, height: 260,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  corner:     { position: 'absolute', width: 28, height: 28, borderColor: C.primary, borderRadius: 3 },
  bottomWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 32, paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', flex: 1 },
});

/* ════════════════════════════════════════
   Receipt Modal (with QR Code)
════════════════════════════════════════ */
function ReceiptModal({ sale, onClose, onStatusChange }: {
  sale: SaleDetail | null; onClose(): void;
  onStatusChange(id: string, status: string): void;
}) {
  const [changing, setChanging] = useState(false);
  if (!sale) return null;

  const actions = TRANSITIONS[sale.status] || [];
  const cashAmt = sale.cashReceived ?? 0;
  const changeAmt = sale.change ?? (cashAmt > sale.total ? cashAmt - sale.total : 0);
  const statusColor = STATUS_COLORS[sale.status] || '#888';
  const qrValue = sale.invoiceNumber || String(sale.id);

  const doStatusChange = (newStatus: string) => {
    Alert.alert(
      `Mark as ${newStatus}?`,
      `Change order ${sale.invoiceNumber} to ${newStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: newStatus === 'cancelled' || newStatus === 'refunded' ? 'destructive' : 'default',
          onPress: async () => {
            setChanging(true);
            try {
              await onStatusChange(String(sale.id), newStatus);
              onClose();
            } finally { setChanging(false); }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={!!sale} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={rm.container}>
        {/* Gradient header */}
        <LinearGradient colors={['#0C0A2E', '#17105C']} style={rm.header}>
          <View style={{ flex: 1 }}>
            <Text style={rm.headerTitle}>Order Receipt</Text>
            <Text style={rm.headerSub}>#{sale.invoiceNumber}</Text>
          </View>
          <View style={[rm.statusPill, { backgroundColor: statusColor }]}>
            <Text style={rm.statusPillTxt}>{sale.status.toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={rm.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </LinearGradient>

        {changing && (
          <View style={rm.overlay}><ActivityIndicator color="#fff" size="large" /></View>
        )}

        <ScrollView contentContainerStyle={rm.scroll} showsVerticalScrollIndicator={false}>

          {/* ── QR Code Card ── */}
          <View style={rm.qrCard}>
            <View style={rm.qrLeft}>
              <View style={rm.qrBox}>
                <QRCode
                  value={qrValue}
                  size={120}
                  color="#111827"
                  backgroundColor="#ffffff"
                />
              </View>
            </View>
            <View style={rm.qrRight}>
              <Text style={rm.qrLabel}>INVOICE QR</Text>
              <Text style={rm.qrInvoiceTxt} numberOfLines={2}>{sale.invoiceNumber}</Text>
              <Text style={rm.qrScanHint}>Scan to search{'\n'}this invoice</Text>
              <View style={[rm.qrStatusChip, { backgroundColor: `${statusColor}18` }]}>
                <View style={[rm.qrStatusDot, { backgroundColor: statusColor }]} />
                <Text style={[rm.qrStatusTxt, { color: statusColor }]}>
                  {sale.status.toUpperCase()}
                </Text>
              </View>
              <Text style={rm.qrTotal}>${sale.total.toFixed(2)}</Text>
            </View>
          </View>

          {/* ── Order Info ── */}
          <View style={rm.card}>
            <Text style={rm.cardTitle}>ORDER INFO</Text>
            <RmRow label="Cashier"  value={sale.cashier} />
            <RmRow label="Customer" value={sale.customerName} />
            <RmRow label="Payment"  value={normalizePayMethod(sale.paymentMethod)} />
            <RmRow label="Date"     value={new Date(sale.timestamp).toLocaleString()} last />
            {sale.note ? (
              <View style={rm.noteBox}>
                <Ionicons name="document-text-outline" size={13} color={C.muted} />
                <Text style={rm.noteTxt}>{sale.note}</Text>
              </View>
            ) : null}
          </View>

          {/* ── Items ── */}
          <View style={rm.card}>
            <Text style={rm.cardTitle}>ITEMS ({sale.items.length})</Text>
            {sale.items.map((item, i) => (
              <View key={i} style={[rm.itemRow, i === sale.items.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={rm.itemQtyBadge}>
                  <Text style={rm.itemQtyTxt}>{item.quantity}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={rm.itemName}>{item.name}</Text>
                  <Text style={rm.itemSub}>${item.price.toFixed(2)} each</Text>
                </View>
                <Text style={rm.itemTotal}>${item.lineTotal.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* ── Summary ── */}
          <View style={rm.card}>
            <Text style={rm.cardTitle}>SUMMARY</Text>
            <RmTotal label="Subtotal" value={`$${(sale.subtotal ?? 0).toFixed(2)}`} />
            {(sale.discount ?? 0) > 0 && (
              <RmTotal label="Discount" value={`−$${sale.discount.toFixed(2)}`} valueColor={C.green} />
            )}
            {(sale.flatDiscount ?? 0) > 0 && (
              <RmTotal label="Flat Discount" value={`−$${(sale.flatDiscount ?? 0).toFixed(2)}`} valueColor={C.green} />
            )}
            {sale.couponCode && (sale.couponDiscount ?? 0) > 0 && (
              <RmTotal
                label={`Coupon (${sale.couponCode})`}
                value={`−$${(sale.couponDiscount ?? 0).toFixed(2)}`}
                valueColor={C.green}
              />
            )}
            {(sale.tax ?? 0) > 0 && (
              <RmTotal
                label={`${sale.taxName || 'Tax'}${sale.taxRate ? ` (${sale.taxRate}%)` : ''}`}
                value={`$${sale.tax.toFixed(2)}`}
              />
            )}
            <View style={rm.grandRow}>
              <Text style={rm.grandLabel}>Total</Text>
              <Text style={rm.grandVal}>${sale.total.toFixed(2)}</Text>
            </View>
            {cashAmt > 0 && sale.paymentMethod === 'cash' && (
              <>
                <RmTotal label="Cash Received" value={`$${cashAmt.toFixed(2)}`} />
                {changeAmt > 0 && (
                  <RmTotal label="Change" value={`$${changeAmt.toFixed(2)}`} valueColor={C.amber} bold />
                )}
              </>
            )}
          </View>

          {/* ── Status actions ── */}
          {actions.length > 0 && (() => {
            const positive     = actions.filter(st => !DESTRUCTIVE_STATUSES.has(st));
            const destructive  = actions.filter(st => DESTRUCTIVE_STATUSES.has(st));
            const isRestore    = sale.status === 'cancelled';
            return (
              <>
                {positive.length > 0 && (
                  <View style={rm.card}>
                    <Text style={rm.cardTitle}>{isRestore ? 'RESTORE INVOICE' : 'ADVANCE STATUS'}</Text>
                    <View style={rm.actionRow}>
                      {positive.map(st => (
                        <TouchableOpacity
                          key={st}
                          style={[rm.actionBtn, { backgroundColor: STATUS_COLORS[st] || C.green }]}
                          onPress={() => doStatusChange(st)}
                        >
                          <Ionicons
                            name={isRestore ? 'refresh-circle-outline' : 'checkmark-circle-outline'}
                            size={15} color="#fff"
                          />
                          <Text style={rm.actionBtnTxt}>
                            {isRestore ? `Restore to ${st}` : `Mark ${st}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {destructive.length > 0 && (
                  <View style={[rm.card, rm.dangerCard]}>
                    <View style={rm.dangerHeader}>
                      <Ionicons name="warning-outline" size={13} color={C.red} />
                      <Text style={[rm.cardTitle, { color: C.red, marginBottom: 0 }]}>DANGER ZONE</Text>
                    </View>
                    <View style={rm.actionRow}>
                      {destructive.map(st => (
                        <TouchableOpacity
                          key={st}
                          style={[rm.actionBtnOutline, { borderColor: STATUS_COLORS[st] || C.red }]}
                          onPress={() => doStatusChange(st)}
                        >
                          <Ionicons
                            name={st === 'cancelled' ? 'ban-outline' : 'arrow-undo-circle-outline'}
                            size={15} color={STATUS_COLORS[st] || C.red}
                          />
                          <Text style={[rm.actionBtnOutlineTxt, { color: STATUS_COLORS[st] || C.red }]}>
                            {st === 'cancelled' ? 'Cancel Invoice' : `Mark ${st}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </>
            );
          })()}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function RmRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[rm.metaRow, last && { borderBottomWidth: 0 }]}>
      <Text style={rm.metaLabel}>{label}</Text>
      <Text style={rm.metaVal}>{value}</Text>
    </View>
  );
}

function RmTotal({ label, value, valueColor, bold }: {
  label: string; value: string; valueColor?: string; bold?: boolean;
}) {
  return (
    <View style={rm.totalRow}>
      <Text style={rm.totalLabel}>{label}</Text>
      <Text style={[rm.totalVal, valueColor ? { color: valueColor } : undefined, bold ? { fontWeight: '700' } : undefined]}>
        {value}
      </Text>
    </View>
  );
}

const rm = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle:  { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub:    { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  statusPill:   { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillTxt:{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  closeBtn:     { padding: 4 },
  overlay:      { position: 'absolute', inset: 0, zIndex: 99, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  scroll:       { paddingBottom: 40 },

  /* QR card */
  qrCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: C.border,
  },
  qrLeft:      { alignItems: 'center' },
  qrBox:       { padding: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.border },
  qrRight:     { flex: 1, gap: 4 },
  qrLabel:     { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 0.8 },
  qrInvoiceTxt:{ fontSize: 15, fontWeight: '800', color: C.text },
  qrScanHint:  { fontSize: 10, color: C.muted, lineHeight: 14 },
  qrStatusChip:{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  qrStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  qrStatusTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  qrTotal:     { fontSize: 18, fontWeight: '900', color: C.primary, marginTop: 2 },

  card:        { backgroundColor: C.card, borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: C.border },
  cardTitle:   { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginBottom: 10 },

  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  metaLabel:   { fontSize: 12, color: C.muted },
  metaVal:     { fontSize: 12, fontWeight: '600', color: C.text, maxWidth: '60%', textAlign: 'right' },

  noteBox:     { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: C.amber },
  noteTxt:     { flex: 1, fontSize: 12, color: '#92400E' },

  itemRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  itemQtyBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  itemQtyTxt:   { fontSize: 12, fontWeight: '700', color: C.blue },
  itemName:     { fontSize: 13, fontWeight: '600', color: C.text },
  itemSub:      { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal:    { fontSize: 13, fontWeight: '700', color: C.text },

  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  totalLabel:  { fontSize: 13, color: C.muted },
  totalVal:    { fontSize: 13, fontWeight: '600', color: C.text },
  grandRow:    { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 4 },
  grandLabel:  { fontSize: 15, fontWeight: '800', color: C.text },
  grandVal:    { fontSize: 22, fontWeight: '900', color: C.blue },

  actionRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  actionBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtnOutline:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1.5, backgroundColor: '#FFF5F5' },
  actionBtnOutlineTxt: { fontWeight: '700', fontSize: 13 },
  dangerCard:    { borderColor: '#FECACA', borderWidth: 1, backgroundColor: '#FFFAFA' },
  dangerHeader:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
});

/* ════════════════════════════════════════
   Stat Card helper
════════════════════════════════════════ */
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={h.statCard}>
      <Text style={h.statLabel}>{label}</Text>
      <Text style={[h.statVal, { color }]}>{value}</Text>
    </View>
  );
}

/* ════════════════════════════════════════
   Sales History Screen
════════════════════════════════════════ */
export default function SalesScreen() {
  const [sales, setSales]               = useState<SaleRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter, setPayFilter]       = useState('all');
  const [search, setSearch]             = useState('');
  const [showQRScanner, setShowQRScanner]     = useState(false);
  const [showPayDropdown, setShowPayDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const r = await apiFetch('/api/sales?limit=200');
      const d = await r.json();
      setSales(Array.isArray(d) ? d : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReceipt = async (id: string) => {
    setDetailLoading(true);
    try {
      const r = await apiFetch(`/api/sales/${id}`);
      if (r.ok) setSelectedSale(await r.json());
    } catch {}
    finally { setDetailLoading(false); }
  };

  const changeStatus = async (id: string, status: string) => {
    const r = await apiFetch(`/api/sales/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    });
    if (r.ok) {
      setSales(prev => prev.map(s => String(s.id) === id ? { ...s, status } : s));
    } else {
      const d = await r.json().catch(() => ({}));
      Alert.alert('Error', d.message || 'Failed to update status');
    }
  };

  /* Payment method counts from all sales */
  const methodCounts: Record<string, number> = {};
  sales.forEach(s => {
    const m = normalizePayMethod(s.paymentMethod);
    methodCounts[m] = (methodCounts[m] || 0) + 1;
  });
  const payMethods = [
    'all',
    ...Object.keys(methodCounts).sort((a, b) => (methodCounts[b] ?? 0) - (methodCounts[a] ?? 0)),
  ];

  /* Filtered + searched */
  const filtered = sales.filter(s => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchPay    = payFilter === 'all' || normalizePayMethod(s.paymentMethod) === payFilter;
    const q           = search.toLowerCase();
    const matchSearch = !q ||
      s.invoiceNumber.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.cashier.toLowerCase().includes(q);
    return matchStatus && matchPay && matchSearch;
  });

  const totalRevenue    = filtered.reduce((sum, s) => sum + (s.status !== 'cancelled' ? s.total : 0), 0);
  const completedCount  = filtered.filter(s => s.status === 'completed').length;
  const pendingCount    = filtered.filter(s => s.status === 'pending' || s.status === 'processing').length;
  const revenueStr      = totalRevenue >= 1000
    ? `$${(totalRevenue / 1000).toFixed(1)}k`
    : `$${totalRevenue.toFixed(0)}`;

  /* Loading skeleton */
  if (loading) {
    return (
      <SafeAreaView style={h.container}>
        <LinearGradient colors={['#0C0A2E', '#17105C']} style={h.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={h.headerBlob} />
          <Text style={h.headerTitle}>Sales History</Text>
        </LinearGradient>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={h.container}>

      {/* ── Header ── */}
      <LinearGradient
        colors={['#0C0A2E', '#17105C']}
        style={h.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={h.headerBlob} />
        <View style={{ flex: 1 }}>
          <Text style={h.headerTitle}>Sales History</Text>
          <Text style={h.headerSub}>{filtered.length} records</Text>
        </View>
        <TouchableOpacity style={h.headerQrBtn} onPress={() => setShowQRScanner(true)} activeOpacity={0.8}>
          <Ionicons name="qr-code-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {detailLoading && (
        <View style={h.loadingOverlay}><ActivityIndicator color="#fff" size="large" /></View>
      )}

      {/* ── Search bar with scan button ── */}
      <View style={h.searchWrap}>
        <View style={h.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginLeft: 12 }} />
          <TextInput
            style={h.searchInput}
            placeholder="Search invoice, customer, cashier…"
            placeholderTextColor="#aaa"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 12 }}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={h.scanBtn}
          onPress={() => setShowQRScanner(true)}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#6366F1', '#8B5CF6']} style={h.scanGrad}>
            <Ionicons name="scan-outline" size={19} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Stats row ── */}
      <View style={h.statsRow}>
        <StatCard label="Revenue"  value={revenueStr}              color={C.green} />
        <StatCard label="Done"     value={String(completedCount)}  color={C.blue} />
        <StatCard label="Pending"  value={String(pendingCount)}    color={C.amber} />
        <StatCard label="Total"    value={String(filtered.length)} color={C.text} />
      </View>

      {/* ── Filter dropdowns row ── */}
      <View style={h.filterRow}>
        {/* Payment method dropdown */}
        <TouchableOpacity
          style={h.filterDropBtn}
          onPress={() => setShowPayDropdown(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="card-outline" size={14} color={C.primary} />
          <Text style={h.filterDropLabel} numberOfLines={1}>
            {payFilter === 'all' ? 'All Methods' : payFilter}
          </Text>
          <Ionicons name="chevron-down" size={13} color={C.muted} />
        </TouchableOpacity>

        {/* Status dropdown */}
        <TouchableOpacity
          style={h.filterDropBtn}
          onPress={() => setShowStatusDropdown(true)}
          activeOpacity={0.8}
        >
          {statusFilter !== 'all' && (
            <View style={[h.statusDotInline, { backgroundColor: STATUS_COLORS[statusFilter] || C.navy }]} />
          )}
          {statusFilter === 'all' && <Ionicons name="funnel-outline" size={14} color={C.primary} />}
          <Text style={h.filterDropLabel} numberOfLines={1}>
            {statusFilter === 'all' ? 'All Status' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
          </Text>
          <Ionicons name="chevron-down" size={13} color={C.muted} />
        </TouchableOpacity>
      </View>

      {/* ── Sales list ── */}
      <FlatList
        data={filtered}
        keyExtractor={s => String(s.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 64, gap: 10 }}>
            <Ionicons name="receipt-outline" size={52} color="#D1D5DB" />
            <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700' }}>No sales found</Text>
            <Text style={{ color: C.light, fontSize: 12 }}>Try adjusting your filters</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status] || '#888';
          const payLabel    = normalizePayMethod(item.paymentMethod);
          return (
            <TouchableOpacity
              style={h.card}
              onPress={() => openReceipt(String(item.id))}
              activeOpacity={0.75}
            >
              {/* Left status bar */}
              <View style={[h.cardBar, { backgroundColor: statusColor }]} />

              <View style={h.cardBody}>
                {/* Top row: invoice + amount */}
                <View style={h.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={h.invoice}>{item.invoiceNumber}</Text>
                    <Text style={h.cashier} numberOfLines={1}>
                      {item.cashier}  ·  {item.customerName}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={h.total}>${item.total.toFixed(2)}</Text>
                    <View style={[
                      h.statusBadge,
                      { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}35`, borderWidth: 1 },
                    ]}>
                      <View style={[h.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[h.statusTxt, { color: statusColor }]}>{item.status}</Text>
                    </View>
                  </View>
                </View>

                {/* Footer row: payment, items, date */}
                <View style={h.cardFooter}>
                  <View style={h.payBadge}>
                    <Ionicons name="card-outline" size={10} color={C.blue} />
                    <Text style={h.payBadgeTxt}>{payLabel}</Text>
                  </View>
                  <View style={h.itemsBadge}>
                    <Ionicons name="bag-outline" size={10} color={C.muted} />
                    <Text style={h.itemsBadgeTxt}>
                      {item.itemCount} item{item.itemCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={h.dateText}>
                    {new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' · '}
                    {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={h.tapHint}>View ›</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Receipt modal ── */}
      <ReceiptModal
        sale={selectedSale}
        onClose={() => setSelectedSale(null)}
        onStatusChange={changeStatus}
      />

      {/* ── QR Scanner modal ── */}
      {showQRScanner && (
        <QRScannerModal
          onScanned={async (value) => {
            setShowQRScanner(false);
            const match = sales.find(
              s => s.invoiceNumber === value || String(s.id) === value
            );
            if (match) {
              await openReceipt(String(match.id));
            } else {
              setSearch(value);
            }
          }}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* ── Payment method dropdown modal ── */}
      <Modal
        visible={showPayDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPayDropdown(false)}
      >
        <TouchableOpacity
          style={h.payModalOverlay}
          activeOpacity={1}
          onPress={() => setShowPayDropdown(false)}
        >
          <View style={h.payModalSheet}>
            <View style={h.payModalHeader}>
              <Text style={h.payModalTitle}>Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPayDropdown(false)}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {payMethods.map(method => {
                const isActive = payFilter === method;
                const count    = method === 'all' ? sales.length : (methodCounts[method] ?? 0);
                return (
                  <TouchableOpacity
                    key={method}
                    style={[h.payModalRow, isActive && h.payModalRowActive]}
                    onPress={() => { setPayFilter(method); setShowPayDropdown(false); }}
                  >
                    <View style={[h.payModalDot, { backgroundColor: isActive ? C.primary : '#E5E7EB' }]} />
                    <Text style={[h.payModalTxt, isActive && h.payModalTxtActive]}>
                      {method === 'all' ? 'All Methods' : method}
                    </Text>
                    <View style={h.payModalCount}>
                      <Text style={[h.payModalCountTxt, isActive && { color: C.primary }]}>{count}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark" size={16} color={C.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Status dropdown modal ── */}
      <Modal
        visible={showStatusDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusDropdown(false)}
      >
        <TouchableOpacity
          style={h.payModalOverlay}
          activeOpacity={1}
          onPress={() => setShowStatusDropdown(false)}
        >
          <View style={h.payModalSheet}>
            <View style={h.payModalHeader}>
              <Text style={h.payModalTitle}>Filter by Status</Text>
              <TouchableOpacity onPress={() => setShowStatusDropdown(false)}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ALL_STATUSES.map(st => {
                const isActive  = statusFilter === st;
                const dotColor  = st === 'all' ? C.primary : (STATUS_COLORS[st] || '#888');
                const count     = st === 'all' ? sales.length : sales.filter(s => s.status === st).length;
                const label     = st === 'all' ? 'All Statuses' : st.charAt(0).toUpperCase() + st.slice(1);
                return (
                  <TouchableOpacity
                    key={st}
                    style={[h.payModalRow, isActive && h.payModalRowActive]}
                    onPress={() => { setStatusFilter(st); setShowStatusDropdown(false); }}
                  >
                    <View style={[h.payModalDot, { backgroundColor: isActive ? dotColor : '#E5E7EB' }]} />
                    <Text style={[h.payModalTxt, isActive && { color: dotColor, fontWeight: '700' }]}>{label}</Text>
                    <View style={h.payModalCount}>
                      <Text style={[h.payModalCountTxt, isActive && { color: dotColor }]}>{count}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark" size={16} color={dotColor} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const h = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  header:          { paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  headerBlob:      { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(99,102,241,0.13)', top: -60, right: -40 },
  headerTitle:     { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:       { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  headerQrBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  loadingOverlay:  { position: 'absolute', inset: 0, zIndex: 99, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },

  /* Search */
  searchWrap:  { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 11, fontSize: 14, color: C.text },
  scanBtn:     { borderRadius: 14, overflow: 'hidden' },
  scanGrad:    { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },

  /* Stats */
  statsRow:  { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  statCard:  { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginBottom: 3 },
  statVal:   { fontSize: 16, fontWeight: '800' },

  /* Filter row (payment + status side by side) */
  filterRow:        { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 6, marginBottom: 2 },
  filterDropBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  filterDropLabel:  { flex: 1, fontSize: 12, fontWeight: '600', color: C.text },
  statusDotInline:  { width: 9, height: 9, borderRadius: 4.5 },

  /* Sale cards */
  card:       { backgroundColor: C.card, borderRadius: 16, flexDirection: 'row', overflow: 'hidden', shadowColor: '#6366F1', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  cardBar:    { width: 4 },
  cardBody:   { flex: 1, padding: 14 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  invoice:    { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 3 },
  cashier:    { fontSize: 12, color: C.muted },
  total:      { fontSize: 18, fontWeight: '800', color: C.primary, marginBottom: 2 },
  statusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusDot:  { width: 5, height: 5, borderRadius: 2.5 },
  statusTxt:  { fontSize: 10, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  payBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  payBadgeTxt:{ fontSize: 10, fontWeight: '700', color: C.blue },
  itemsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  itemsBadgeTxt: { fontSize: 11, color: C.muted, fontWeight: '600' },
  dateText:   { flex: 1, fontSize: 10, color: C.light, textAlign: 'right' },
  tapHint:    { fontSize: 11, color: C.primary, fontWeight: '700' },

  /* Payment method modal */
  payModalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  payModalSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, maxHeight: '70%' },
  payModalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  payModalTitle:     { fontSize: 15, fontWeight: '800', color: C.text },
  payModalRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  payModalRowActive: { backgroundColor: C.primaryLight },
  payModalDot:       { width: 10, height: 10, borderRadius: 5 },
  payModalTxt:       { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  payModalTxtActive: { color: C.primary, fontWeight: '700' },
  payModalCount:     { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minWidth: 30, alignItems: 'center' },
  payModalCountTxt:  { fontSize: 12, fontWeight: '700', color: C.muted },
});
