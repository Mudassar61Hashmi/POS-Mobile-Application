import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/* ── Types ─────────────────────────────────────── */
type Product = {
  _id: string; name: string; price: number; cost?: number;
  quantity: number; category: string; barcode?: string; image?: string | null;
  lowStockThreshold?: number;
};
type CartItem = Product & { qty: number };
type Customer = { _id: string; name: string; phone: string };
type TaxConfig = { name: string; rate: number; type: 'inclusive' | 'exclusive' };
type PaymentMethod = { _id: string; name: string; type: string; isDefault?: boolean; notes?: string; accountNumber?: string; accountTitle?: string; provider?: string };
type AppliedCoupon = { code: string; discount: number };

type SaleDetail = {
  _id: string; invoiceNumber: string; cashier: string; customerName: string;
  customerPhone?: string; paymentMethod: string; status: string;
  subtotal: number; discount: number; couponCode?: string; couponDiscount?: number;
  flatDiscount?: number; tax: number; taxName?: string; taxRate?: number;
  total: number; cashReceived?: number; change?: number; note?: string;
  timestamp: string;
  items: { name: string; quantity: number; price: number; lineTotal: number }[];
};

const WALKIN: Customer = { _id: 'walkin', name: 'Walk-in Customer', phone: '' };

const C = {
  navy: '#0C0A2E', blue: '#6366F1', green: '#10B981', amber: '#F59E0B',
  red: '#EF4444', bg: '#F0F0FA', card: '#ffffff', border: '#E5E7EB',
  text: '#111827', muted: '#6B7280', light: '#9CA3AF',
  primary: '#6366F1', primaryLight: '#EEF2FF',
};

function normalizePaymentType(type?: string): string {
  if (!type || type === 'cash') return 'cash';
  if (type === 'card_credit' || type === 'card_debit') return 'card';
  return type;
}

/* ══════════════════════════════════════════════
   Scan Flash Toast
══════════════════════════════════════════════ */
function ScanFlash({ flash }: { flash: { name: string; found: boolean } | null }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (flash) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [flash]);
  if (!flash) return null;
  return (
    <Animated.View style={[sf.container, { opacity, backgroundColor: flash.found ? C.navy : C.red }]}>
      <View style={[sf.icon, { backgroundColor: flash.found ? C.green : '#dc2626' }]}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{flash.found ? '✓' : '!'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={sf.title}>{flash.found ? `Added: ${flash.name}` : 'Product not found'}</Text>
        {!flash.found && <Text style={sf.sub}>{flash.name}</Text>}
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>⬛</Text>
    </Animated.View>
  );
}
const sf = StyleSheet.create({
  container: { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 999, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 10 },
  icon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontWeight: '800', fontSize: 13 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'monospace', marginTop: 1 },
});

/* ══════════════════════════════════════════════
   Camera Barcode Scanner Modal
══════════════════════════════════════════════ */
function CameraScanner({ products, onFound, onNotFound, onClose }: {
  products: Product[];
  onFound(p: Product): void;
  onNotFound(code: string): void;
  onClose(): void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    const product = products.find(p => p.barcode === data);
    if (product) onFound(product);
    else onNotFound(data);
    setTimeout(() => setScanned(false), 1400);
  }, [scanned, products, onFound, onNotFound]);

  if (!permission) {
    return (
      <View style={cs.center}>
        <ActivityIndicator color={C.blue} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={cs.center}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📷</Text>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8, textAlign: 'center' }}>Camera Permission Required</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32 }}>
          Allow camera access to scan barcodes
        </Text>
        <TouchableOpacity style={cs.permBtn} onPress={requestPermission}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cs.permBtn, { backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 8 }]} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code93', 'itf14', 'datamatrix'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      >
        {/* Header */}
        <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={cs.header}>
            <View style={cs.headerIcon}>
              <Text style={{ fontSize: 18 }}>⬛</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.headerTitle}>Camera Scanner</Text>
              <Text style={cs.headerSub}>Point at a barcode or QR code</Text>
            </View>
            <TouchableOpacity style={cs.closeBtn} onPress={onClose}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Viewfinder */}
        <View style={cs.viewfinder}>
          <View style={cs.frame}>
            <View style={[cs.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
            <View style={[cs.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
            <View style={[cs.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
            <View style={[cs.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
            <View style={cs.scanLine} />
          </View>
        </View>

        {/* Footer */}
        <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', gap: 14 }}>
          <View style={cs.scanStatus}>
            <View style={[cs.scanDot, { backgroundColor: scanned ? C.amber : C.green }]} />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {scanned ? 'Item scanned — scanning next…' : 'Ready to scan'}
            </Text>
          </View>
          <TouchableOpacity style={cs.doneBtn} onPress={onClose}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Done Scanning</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const cs = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  headerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  viewfinder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { width: 240, height: 240, position: 'relative' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#4ade80' },
  scanLine: { position: 'absolute', left: 8, right: 8, height: 2, top: '50%', backgroundColor: '#4ade80', shadowColor: '#4ade80', shadowOpacity: 1, shadowRadius: 8, elevation: 4 },
  permBtn: { backgroundColor: C.blue, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  scanStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  scanDot: { width: 8, height: 8, borderRadius: 4 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, shadowColor: C.blue, shadowOpacity: 0.5, shadowRadius: 12, elevation: 6 },
});

/* ══════════════════════════════════════════════
   Wallet Payment Modal
══════════════════════════════════════════════ */
function WalletPaymentModal({ methodName, amount, instructions, loading, onConfirm, onCancel }: {
  methodName: string; amount: number; instructions: string;
  loading: boolean; onConfirm(): void; onCancel(): void;
}) {
  const name = methodName.toLowerCase();
  const color = name.includes('jazzcash') ? '#d0021b'
    : name.includes('easypaisa') ? '#00a651'
    : '#6366f1';

  const steps = [
    `Open ${methodName} on your phone`,
    "Send payment to merchant's number",
    "Click 'Payment Received' below",
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        {/* Provider header */}
        <View style={[wp.providerHeader, { backgroundColor: color }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={wp.providerIcon}><Text style={{ fontSize: 22 }}>📱</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={wp.providerName}>{methodName}</Text>
              <Text style={wp.providerSub}>Mobile Wallet Payment</Text>
            </View>
            <TouchableOpacity style={wp.closeBtn} onPress={onCancel} disabled={loading}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={wp.amountBox}>
            <Text style={wp.amountLabel}>Amount Due</Text>
            <Text style={wp.amountVal}>${amount.toFixed(2)}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Instructions */}
          <Text style={wp.sectionLabel}>Payment Instructions</Text>
          <View style={[wp.instructionsBox, { backgroundColor: color + '12', borderColor: color + '30' }]}>
            <Text style={{ fontSize: 13, color: C.text, lineHeight: 22 }}>
              {instructions || `Send the exact amount to the merchant's ${methodName} account and click "Payment Received" once done.`}
            </Text>
          </View>

          {/* Steps */}
          {steps.map((step, i) => (
            <View key={i} style={wp.stepRow}>
              <View style={[wp.stepNum, { backgroundColor: color }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{i + 1}</Text>
              </View>
              <Text style={{ fontSize: 13, color: C.text, flex: 1 }}>{step}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Actions */}
        <View style={wp.footer}>
          <TouchableOpacity style={wp.cancelBtn} onPress={onCancel} disabled={loading}>
            <Text style={{ color: C.muted, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[wp.confirmBtn, { backgroundColor: color }, loading && { opacity: 0.7 }]}
            onPress={onConfirm} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Text style={{ color: '#fff', fontSize: 16 }}>✓</Text>
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>Payment Received</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const wp = StyleSheet.create({
  providerHeader: { padding: 20 },
  providerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center' },
  providerName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  providerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  amountBox: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 14 },
  amountLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginBottom: 4 },
  amountVal: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  instructionsBox: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stepNum: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  confirmBtn: { flex: 2, padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});

/* ══════════════════════════════════════════════
   Receipt Modal (post-checkout)
══════════════════════════════════════════════ */
function ReceiptModal({ sale, onClose, onNewSale, onPrint }: {
  sale: SaleDetail | null; onClose(): void; onNewSale(): void; onPrint(sale: SaleDetail): void;
}) {
  if (!sale) return null;
  const cashAmt = sale.cashReceived ?? 0;
  const changeAmt = sale.change ?? (cashAmt > sale.total ? cashAmt - sale.total : 0);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&bgcolor=ffffff&color=0C0A2E&data=${encodeURIComponent(sale.invoiceNumber)}`;

  return (
    <Modal visible={!!sale} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={rc.container}>
        {/* Header */}
        <LinearGradient colors={['#0C0A2E', '#17105C']} style={rc.header}>
          <View style={{ flex: 1 }}>
            <Text style={rc.headerTitle}>Receipt</Text>
            <Text style={rc.headerSub}>#{sale.invoiceNumber}</Text>
          </View>
          <TouchableOpacity style={rc.printBtn} onPress={() => onPrint(sale)}>
            <Ionicons name="print-outline" size={15} color="#fff" />
            <Text style={rc.printTxt}>Print</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={rc.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView contentContainerStyle={rc.scroll} showsVerticalScrollIndicator={false}>
          {/* Success banner */}
          <View style={rc.successBanner}>
            <View style={rc.successIconWrap}>
              <Ionicons name="checkmark" size={22} color="#fff" />
            </View>
            <View>
              <Text style={rc.successTitle}>Payment Successful!</Text>
              <Text style={rc.successSub}>{new Date(sale.timestamp).toLocaleString()}</Text>
            </View>
          </View>

          {/* Store header */}
          <View style={rc.storeCard}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} style={rc.storeLogo}>
              <Text style={rc.storeLogoText}>POS</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={rc.storeName}>POS Terminal</Text>
              <Text style={rc.storeTagline}>Thank you for your purchase!</Text>
            </View>
          </View>

          {/* QR code + invoice details */}
          <View style={rc.qrCard}>
            <View style={rc.qrLeft}>
              <Image source={{ uri: qrUrl }} style={rc.qrImage} contentFit="contain" />
              <Text style={rc.qrLabel}>SCAN TO VERIFY</Text>
            </View>
            <View style={rc.qrRight}>
              <Text style={rc.invoiceNum}>{sale.invoiceNumber}</Text>
              <View style={rc.divider} />
              <RcInfoRow label="Cashier" value={sale.cashier} />
              <RcInfoRow label="Customer" value={sale.customerName} />
              {sale.customerPhone ? <RcInfoRow label="Phone" value={sale.customerPhone} /> : null}
              <RcInfoRow label="Payment" value={sale.paymentMethod} />
            </View>
          </View>

          {/* Items */}
          <View style={rc.card}>
            <Text style={rc.cardTitle}>ITEMS</Text>
            {sale.items.map((item, i) => (
              <View key={i} style={[rc.itemRow, i === sale.items.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={rc.itemQtyBadge}>
                  <Text style={rc.itemQtyText}>{item.quantity}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={rc.itemName}>{item.name}</Text>
                  <Text style={rc.itemSub}>${item.price.toFixed(2)} each</Text>
                </View>
                <Text style={rc.itemTotal}>${item.lineTotal.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={rc.card}>
            <Text style={rc.cardTitle}>SUMMARY</Text>
            <RcTotalRow label="Subtotal" value={`$${(sale.subtotal ?? 0).toFixed(2)}`} />
            {(sale.discount ?? 0) > 0 && (
              <RcTotalRow label="Discount" value={`−$${sale.discount.toFixed(2)}`} valueColor={C.green} />
            )}
            {sale.couponCode && (sale.couponDiscount ?? 0) > 0 && (
              <RcTotalRow label={`Coupon (${sale.couponCode})`} value={`−$${(sale.couponDiscount ?? 0).toFixed(2)}`} valueColor={C.green} />
            )}
            {(sale.flatDiscount ?? 0) > 0 && (
              <RcTotalRow label="Flat Discount" value={`−$${(sale.flatDiscount ?? 0).toFixed(2)}`} valueColor={C.green} />
            )}
            {(sale.tax ?? 0) > 0 && (
              <RcTotalRow label={`${sale.taxName || 'Tax'}${sale.taxRate ? ` (${sale.taxRate}%)` : ''}`} value={`$${sale.tax.toFixed(2)}`} />
            )}
            <View style={rc.grandRow}>
              <Text style={rc.grandLabel}>Total Paid</Text>
              <Text style={rc.grandVal}>${sale.total.toFixed(2)}</Text>
            </View>
            {cashAmt > 0 && sale.paymentMethod === 'cash' && (
              <>
                <RcTotalRow label="Cash Received" value={`$${cashAmt.toFixed(2)}`} />
                {changeAmt > 0 && (
                  <RcTotalRow label="Change" value={`$${changeAmt.toFixed(2)}`} valueColor={C.amber} bold />
                )}
              </>
            )}
          </View>

          {/* Note */}
          {sale.note ? (
            <View style={rc.noteCard}>
              <Ionicons name="document-text-outline" size={14} color={C.muted} />
              <Text style={rc.noteText}>{sale.note}</Text>
            </View>
          ) : null}

          <Text style={rc.footerText}>Generated by POS Terminal · {new Date().toLocaleDateString()}</Text>
        </ScrollView>

        <View style={rc.actionBar}>
          <TouchableOpacity style={rc.newSaleBtn} onPress={onNewSale}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={rc.newSaleTxt}>New Sale</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function RcInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rc.infoRow}>
      <Text style={rc.infoLabel}>{label}</Text>
      <Text style={rc.infoVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function RcTotalRow({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <View style={rc.totalRow}>
      <Text style={rc.totalLabel}>{label}</Text>
      <Text style={[rc.totalVal, valueColor ? { color: valueColor } : undefined, bold ? { fontWeight: '700' } : undefined]}>{value}</Text>
    </View>
  );
}

const rc = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 24 },

  header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  printTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  closeBtn: { padding: 4 },

  successBanner: { backgroundColor: C.green, margin: 16, marginBottom: 10, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  successIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  successSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  storeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  storeLogo: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  storeLogoText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  storeName: { fontSize: 15, fontWeight: '800', color: C.text },
  storeTagline: { fontSize: 11, color: C.muted, marginTop: 2 },

  qrCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  qrLeft: { alignItems: 'center', gap: 6 },
  qrImage: { width: 90, height: 90 },
  qrLabel: { fontSize: 9, color: C.light, fontWeight: '600', letterSpacing: 0.5 },
  qrRight: { flex: 1 },
  invoiceNum: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 8 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  infoLabel: { fontSize: 11, color: C.muted },
  infoVal: { fontSize: 11, fontWeight: '600', color: C.text, maxWidth: '55%', textAlign: 'right' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginBottom: 10 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  itemQtyBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  itemQtyText: { fontSize: 12, fontWeight: '700', color: C.blue },
  itemName: { fontSize: 13, fontWeight: '600', color: C.text },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: C.text },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  totalLabel: { fontSize: 13, color: C.muted },
  totalVal: { fontSize: 13, fontWeight: '600', color: C.text },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 4, marginBottom: 0 },
  grandLabel: { fontSize: 15, fontWeight: '800', color: C.text },
  grandVal: { fontSize: 22, fontWeight: '900', color: C.blue },

  noteCard: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: C.amber },
  noteText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  footerText: { textAlign: 'center', fontSize: 10, color: C.light, marginVertical: 16 },

  actionBar: { padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: '#fff' },
  newSaleBtn: { backgroundColor: C.navy, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  newSaleTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

/* ══════════════════════════════════════════════
   Customer Picker Modal
══════════════════════════════════════════════ */
function CustomerPickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: Customer; onSelect(c: Customer): void; onClose(): void;
}) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchCustomers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      const d = await r.json();
      setCustomers(Array.isArray(d) ? d : []);
    } catch { setCustomers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (visible) { setSearch(''); setShowAdd(false); setNewName(''); setNewPhone(''); fetchCustomers(); }
  }, [visible, fetchCustomers]);

  const addCustomer = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setAdding(true);
    try {
      const r = await apiFetch('/api/customers', { method: 'POST', body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() }) });
      const d = await r.json();
      if (!r.ok) { Alert.alert('Error', d.message || 'Failed'); return; }
      onSelect(d); onClose();
    } catch { Alert.alert('Error', 'Network error'); }
    finally { setAdding(false); }
  };

  const list = [WALKIN, ...customers].filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={cp.container}>
        <View style={cp.header}>
          <Text style={cp.title}>Select Customer</Text>
          <TouchableOpacity onPress={onClose}><Text style={cp.closeTxt}>Done</Text></TouchableOpacity>
        </View>
        <View style={cp.searchWrap}>
          <TextInput style={cp.searchInput} placeholder="Search by name or phone…" placeholderTextColor="#aaa"
            value={search} onChangeText={t => { setSearch(t); fetchCustomers(t); }} autoFocus />
        </View>
        {loading ? <ActivityIndicator style={{ margin: 20 }} /> : (
          <FlatList data={list} keyExtractor={i => i._id}
            renderItem={({ item }) => (
              <TouchableOpacity style={[cp.row, selected._id === item._id && cp.rowActive]} onPress={() => { onSelect(item); onClose(); }}>
                <View style={cp.avatar}><Text style={cp.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={cp.rowName}>{item.name}</Text>
                  {item.phone ? <Text style={cp.rowPhone}>{item.phone}</Text> : null}
                </View>
                {selected._id === item._id && <Text style={cp.check}>✓</Text>}
              </TouchableOpacity>
            )} />
        )}
        {!showAdd ? (
          <TouchableOpacity style={cp.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={cp.addBtnTxt}>+ Add New Customer</Text>
          </TouchableOpacity>
        ) : (
          <View style={cp.addForm}>
            <Text style={cp.addFormTitle}>New Customer</Text>
            <TextInput style={cp.addInput} placeholder="Full name *" placeholderTextColor="#aaa" value={newName} onChangeText={setNewName} />
            <TextInput style={cp.addInput} placeholder="Phone *" placeholderTextColor="#aaa" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[cp.addFormBtn, { backgroundColor: '#f0f0f0' }]} onPress={() => setShowAdd(false)}>
                <Text style={{ color: '#666', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cp.addFormBtn, { backgroundColor: C.navy, flex: 2 }, (adding || !newName || !newPhone) && { opacity: 0.5 }]}
                onPress={addCustomer} disabled={adding || !newName.trim() || !newPhone.trim()}>
                {adding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Add & Select</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const cp = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  title: { fontSize: 17, fontWeight: '700', color: C.navy },
  closeTxt: { color: C.blue, fontWeight: '600', fontSize: 15 },
  searchWrap: { padding: 12 },
  searchInput: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 14, color: '#333' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  rowActive: { backgroundColor: '#f0f8ff' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowName: { fontSize: 14, fontWeight: '600', color: C.navy },
  rowPhone: { fontSize: 12, color: '#888', marginTop: 1 },
  check: { color: C.blue, fontWeight: '700', fontSize: 16 },
  addBtn: { margin: 16, padding: 14, backgroundColor: '#f0f0f0', borderRadius: 12, alignItems: 'center' },
  addBtnTxt: { color: '#333', fontWeight: '600', fontSize: 14 },
  addForm: { margin: 16, padding: 16, backgroundColor: '#f9f9f9', borderRadius: 14 },
  addFormTitle: { fontSize: 13, fontWeight: '700', color: '#666', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  addInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: '#333' },
  addFormBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

/* ══════════════════════════════════════════════
   Checkout Modal
══════════════════════════════════════════════ */
function CheckoutModal({
  visible, cart, customer, subtotal, discountAmt, couponDiscount, taxAmt, total,
  taxConfig, paymentMethods, selectedMethodId, cashReceived, appliedCoupon,
  onMethodChange, onCashChange, loading, onConfirm, onClose,
}: {
  visible: boolean; cart: CartItem[]; customer: Customer;
  subtotal: number; discountAmt: number; couponDiscount: number; taxAmt: number; total: number;
  taxConfig: TaxConfig | null; paymentMethods: PaymentMethod[];
  selectedMethodId: string; cashReceived: number | ''; appliedCoupon: AppliedCoupon | null;
  onMethodChange(id: string): void; onCashChange(v: number | ''): void;
  loading: boolean; onConfirm(): void; onClose(): void;
}) {
  const selectedMethod = paymentMethods.find(m => m._id === selectedMethodId);
  const isCash = !selectedMethod || selectedMethod.type === 'cash';
  const cashAmt = Number(cashReceived) || 0;
  const change = isCash && cashAmt > total ? parseFloat((cashAmt - total).toFixed(2)) : 0;
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={co.container}>
        {/* Gradient header */}
        <LinearGradient colors={['#0C0A2E', '#17105C']} style={co.header}>
          <TouchableOpacity onPress={onClose} disabled={loading} style={co.backBtn}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
            <Text style={co.backTxt}>Edit</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={co.title}>Order Preview</Text>
            <Text style={co.headerSub}>{itemCount} item{itemCount !== 1 ? 's' : ''} · ${total.toFixed(2)}</Text>
          </View>
          <View style={{ width: 68 }} />
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Customer card */}
          <View style={co.card}>
            <Text style={co.sectionLabel}>Customer</Text>
            <View style={co.customerRow}>
              <View style={co.customerAvatar}>
                <Text style={co.customerAvatarTxt}>{customer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={co.customerName}>{customer.name}</Text>
                {customer.phone ? <Text style={co.customerPhone}>{customer.phone}</Text> : null}
              </View>
              <View style={co.itemCountBadge}>
                <Text style={co.itemCountTxt}>{itemCount} items</Text>
              </View>
            </View>
          </View>

          {/* Items card */}
          <View style={co.card}>
            <Text style={co.sectionLabel}>Items</Text>
            {cart.map((item, idx) => (
              <View key={item._id} style={[co.itemRow, idx === cart.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={co.itemQtyBadge}>
                  <Text style={co.itemQtyTxt}>{item.qty}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={co.itemName}>{item.name}</Text>
                  <Text style={co.itemSub}>${item.price.toFixed(2)} each</Text>
                </View>
                <Text style={co.itemTotal}>${(item.price * item.qty).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Payment method card */}
          <View style={co.card}>
            <Text style={co.sectionLabel}>Payment Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {paymentMethods.map(m => {
                const isSelected = selectedMethodId === m._id;
                const icon = m.type === 'cash' ? 'cash-outline' : m.type === 'card_credit' || m.type === 'card_debit' ? 'card-outline' : 'phone-portrait-outline';
                return (
                  <TouchableOpacity key={m._id}
                    style={[co.methodChip, isSelected && co.methodChipActive]}
                    onPress={() => onMethodChange(m._id)}>
                    <Ionicons name={icon as any} size={16} color={isSelected ? '#fff' : C.muted} />
                    <Text style={[co.methodChipTxt, isSelected && co.methodChipTxtActive]}>{m.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {isCash && (
            <View style={co.card}>
              <Text style={co.sectionLabel}>Cash Received</Text>
              <TextInput style={co.cashInput} keyboardType="decimal-pad"
                value={cashReceived === '' ? '' : String(cashReceived)}
                onChangeText={t => onCashChange(t === '' ? '' : Math.max(0, parseFloat(t) || 0))}
                placeholder={`$${total.toFixed(2)}`} placeholderTextColor="#aaa" />
              {change > 0 && (
                <View style={co.changeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={co.changeLabel}>Change Due</Text>
                    <Text style={co.changeSub}>Return to customer</Text>
                  </View>
                  <Text style={co.changeAmount}>${change.toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Totals card */}
          <View style={co.card}>
            <Text style={co.sectionLabel}>Order Summary</Text>
            <View style={co.totalRow}><Text style={co.totalLabel}>Subtotal</Text><Text style={co.totalValue}>${subtotal.toFixed(2)}</Text></View>
            {discountAmt > 0 && (
              <View style={co.totalRow}>
                <Text style={[co.totalLabel, { color: C.green }]}>Discount</Text>
                <Text style={[co.totalValue, { color: C.green }]}>−${discountAmt.toFixed(2)}</Text>
              </View>
            )}
            {appliedCoupon && couponDiscount > 0 && (
              <View style={co.totalRow}>
                <Text style={[co.totalLabel, { color: C.green }]}>Coupon ({appliedCoupon.code})</Text>
                <Text style={[co.totalValue, { color: C.green }]}>−${couponDiscount.toFixed(2)}</Text>
              </View>
            )}
            {taxAmt > 0 && (
              <View style={co.totalRow}>
                <Text style={co.totalLabel}>{taxConfig ? `${taxConfig.name} (${taxConfig.rate}%)` : 'Tax'}</Text>
                <Text style={co.totalValue}>${taxAmt.toFixed(2)}</Text>
              </View>
            )}
            <View style={co.grandRow}>
              <Text style={co.totalLabelFinal}>Total Due</Text>
              <Text style={co.totalValueFinal}>${total.toFixed(2)}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={co.footer}>
          <TouchableOpacity style={[co.confirmBtn, loading && co.confirmBtnDisabled]} onPress={onConfirm} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={co.confirmBtnTxt}>Confirm & Pay  ${total.toFixed(2)}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const co = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 68 },
  backTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2, textAlign: 'center' },
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, borderRadius: 16, padding: 14, shadowColor: '#6366F1', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  customerAvatarTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  customerName: { fontSize: 15, fontWeight: '700', color: C.text },
  customerPhone: { fontSize: 12, color: C.muted, marginTop: 2 },
  itemCountBadge: { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  itemCountTxt: { fontSize: 11, fontWeight: '700', color: C.primary },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  itemQtyBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  itemQtyTxt: { fontSize: 12, fontWeight: '700', color: C.primary },
  itemName: { fontSize: 13, fontWeight: '600', color: C.text },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: C.text },
  methodChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F3F4F6', marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  methodChipActive: { backgroundColor: C.navy, borderColor: C.primary },
  methodChipTxt: { fontSize: 13, fontWeight: '600', color: C.muted },
  methodChipTxtActive: { color: '#fff' },
  cashInput: { backgroundColor: '#F8F8FF', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 22, fontWeight: '800', color: C.navy, marginTop: 8, textAlign: 'center', letterSpacing: 1 },
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12 },
  changeLabel: { fontSize: 13, fontWeight: '700', color: C.green },
  changeSub: { fontSize: 11, color: '#16a34a', marginTop: 1 },
  changeAmount: { fontSize: 24, fontWeight: '900', color: C.green },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.5, borderTopColor: '#eee', paddingTop: 12, marginTop: 4 },
  totalLabel: { fontSize: 13, color: C.muted },
  totalValue: { fontSize: 13, fontWeight: '600', color: C.text },
  totalLabelFinal: { fontSize: 16, fontWeight: '800', color: C.text },
  totalValueFinal: { fontSize: 24, fontWeight: '900', color: C.primary },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0', backgroundColor: '#fff' },
  confirmBtn: { backgroundColor: C.primary, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 12, elevation: 5 },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

/* ══════════════════════════════════════════════
   Main POS Screen
══════════════════════════════════════════════ */
export default function POSScreen() {
  const { user, logout } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [defaultTax, setDefaultTax] = useState<TaxConfig | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { _id: 'cash-default', name: 'Cash', type: 'cash' },
  ]);

  const [view, setView] = useState<'products' | 'cart'>('products');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleDetail | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scanFlash, setScanFlash] = useState<{ name: string; found: boolean } | null>(null);
  const [showCatDropdown, setShowCatDropdown] = useState(false);

  /* Wallet payment state */
  const [showWallet, setShowWallet] = useState(false);
  const [walletPaymentId, setWalletPaymentId] = useState<string | null>(null);
  const [walletInstructions, setWalletInstructions] = useState('');
  const [walletMethodName, setWalletMethodName] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer>(WALKIN);
  const [note, setNote] = useState('');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [flatDiscount, setFlatDiscount] = useState<number | ''>('');
  const [selectedMethodId, setSelectedMethodId] = useState('cash-default');
  const [cashReceived, setCashReceived] = useState<number | ''>('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    loadProducts();
    loadTax();
    loadPaymentMethods();
  }, []);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const r = await apiFetch('/api/products');
      const d = await r.json();
      setProducts(Array.isArray(d) ? d : []);
    } catch { Alert.alert('Error', 'Could not load products.'); }
    finally { setLoadingProducts(false); }
  };

  const loadTax = async () => {
    try {
      const r = await apiFetch('/api/taxes/meta/default');
      if (r.ok) { const d = await r.json(); if (d) setDefaultTax(d); }
    } catch {}
  };

  const loadPaymentMethods = async () => {
    try {
      const r = await apiFetch('/api/payment-methods');
      if (r.ok) {
        const d: PaymentMethod[] = await r.json();
        if (Array.isArray(d) && d.length > 0) {
          setPaymentMethods(d);
          const def = d.find(m => m.isDefault) || d.find(m => m.type === 'cash') || d[0];
          setSelectedMethodId(def._id);
        }
      }
    } catch {}
  };

  const showScanFlash = (name: string, found: boolean) => {
    setScanFlash({ name, found });
    Haptics.notificationAsync(found ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setTimeout(() => setScanFlash(null), 2200);
  };

  const handleCameraFound = useCallback((product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i._id === product._id);
      if (ex) {
        if (ex.qty >= product.quantity) return prev;
        return prev.map(i => i._id === product._id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showScanFlash(product.name, true);
  }, []);

  const handleCameraNotFound = useCallback((code: string) => {
    showScanFlash(code, false);
  }, []);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const r = await apiFetch('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponCode.trim(), orderTotal: subtotal }),
      });
      const d = await r.json();
      if (r.ok && d.coupon) {
        setAppliedCoupon({ code: d.coupon.code, discount: d.discount });
        Alert.alert('Coupon Applied!', `Saved $${d.discount.toFixed(2)}`);
      } else {
        Alert.alert('Invalid Coupon', d.message || 'Coupon not valid');
      }
    } catch { Alert.alert('Error', 'Could not validate coupon'); }
    finally { setCouponLoading(false); }
  };

  const removeCoupon = () => { setAppliedCoupon(null); setCouponCode(''); };

  /* Derived */
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    return ['All', ...cats];
  }, [products]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { All: products.length };
    products.forEach(p => { if (p.category) c[p.category] = (c[p.category] || 0) + 1; });
    return c;
  }, [products]);

  const filtered = useMemo(() => products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
    const matchCat = activeCategory === 'All' || p.category === activeCategory;
    return matchSearch && matchCat;
  }), [products, search, activeCategory]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [products, search]);

  const itemCount = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const discountAmt = useMemo(() => {
    const v = Number(discountValue) || 0;
    return discountType === 'percent' ? Math.min((subtotal * v) / 100, subtotal) : Math.min(v, subtotal);
  }, [discountValue, discountType, subtotal]);

  const flatDiscountAmt = useMemo(() =>
    Math.min(Number(flatDiscount) || 0, Math.max(0, subtotal - discountAmt)),
    [flatDiscount, subtotal, discountAmt]);

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    return Math.min(appliedCoupon.discount, Math.max(0, subtotal - discountAmt - flatDiscountAmt));
  }, [appliedCoupon, subtotal, discountAmt, flatDiscountAmt]);

  const taxableAmount = subtotal - discountAmt - flatDiscountAmt - couponDiscount;
  const taxAmt = useMemo(() => {
    if (!defaultTax || defaultTax.rate === 0 || defaultTax.type === 'inclusive') return 0;
    return (taxableAmount * defaultTax.rate) / 100;
  }, [defaultTax, taxableAmount]);
  const inclusiveTaxAmt = useMemo(() => {
    if (!defaultTax || defaultTax.rate === 0 || defaultTax.type !== 'inclusive') return 0;
    return parseFloat((taxableAmount * defaultTax.rate / (100 + defaultTax.rate)).toFixed(2));
  }, [defaultTax, taxableAmount]);
  const total = Math.max(0, taxableAmount + taxAmt);

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) return;
    setCart(prev => {
      const ex = prev.find(i => i._id === product._id);
      if (ex) {
        if (ex.qty >= product.quantity) return prev;
        return prev.map(i => i._id === product._id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateQty = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i._id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i._id !== id));

  const clearCart = () => {
    setCart([]); setCustomer(WALKIN); setNote('');
    setDiscountValue(''); setFlatDiscount(''); setCashReceived('');
    setDiscountType('fixed'); setAppliedCoupon(null); setCouponCode('');
  };

  /* Print receipt */
  const handlePrint = async (sale: SaleDetail) => {
    try {
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const items = sale.items.map(i =>
        `<tr><td>${i.name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">$${i.price.toFixed(2)}</td><td style="text-align:right">$${i.lineTotal.toFixed(2)}</td></tr>`
      ).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        body{font-family:monospace;font-size:12px;max-width:300px;margin:0 auto;padding:10px;}
        h2{text-align:center;font-size:16px;margin:0 0 4px;}
        p{text-align:center;font-size:10px;color:#555;margin:2px 0;}
        table{width:100%;border-collapse:collapse;margin:8px 0;}
        th{font-size:9px;text-transform:uppercase;border-bottom:1px solid #ccc;padding:4px 2px;}
        td{padding:4px 2px;font-size:11px;vertical-align:top;}
        .row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px;}
        .total{font-weight:bold;font-size:14px;border-top:2px solid #000;margin-top:4px;padding-top:4px;}
        .footer{text-align:center;font-size:10px;color:#666;margin-top:12px;border-top:1px dashed #ccc;padding-top:8px;}
      </style></head><body>
        <h2>Receipt</h2>
        <p>${sale.invoiceNumber}</p>
        <p>${new Date(sale.timestamp).toLocaleString()}</p>
        <p>Customer: ${sale.customerName} | Cashier: ${sale.cashier}</p>
        <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${items}</tbody></table>
        <div class="row"><span>Subtotal</span><span>$${(sale.subtotal ?? 0).toFixed(2)}</span></div>
        ${(sale.discount ?? 0) > 0 ? `<div class="row"><span>Discount</span><span>-$${sale.discount.toFixed(2)}</span></div>` : ''}
        ${(sale.tax ?? 0) > 0 ? `<div class="row"><span>${sale.taxName || 'Tax'}</span><span>$${sale.tax.toFixed(2)}</span></div>` : ''}
        <div class="row total"><span>TOTAL</span><span>$${sale.total.toFixed(2)}</span></div>
        ${sale.cashReceived ? `<div class="row"><span>Cash</span><span>$${sale.cashReceived.toFixed(2)}</span></div>` : ''}
        ${sale.change ? `<div class="row"><span>Change</span><span>$${sale.change.toFixed(2)}</span></div>` : ''}
        <div class="footer">Thank you for your business!</div>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Receipt ${sale.invoiceNumber}` });
    } catch (e: any) { Alert.alert('Print Error', e.message); }
  };

  /* Checkout */
  const handleCheckout = async () => {
    if (!user) return;
    const selectedMethod = paymentMethods.find(m => m._id === selectedMethodId) || paymentMethods[0];

    /* Mobile wallet → show wallet modal */
    if (selectedMethod?.type === 'mobile_wallet') {
      setCheckoutLoading(true);
      try {
        const r = await apiFetch('/api/payments/init', {
          method: 'POST',
          body: JSON.stringify({
            amount: parseFloat(total.toFixed(2)),
            customerName: customer.name,
            customerPhone: customer.phone || '',
            methodName: selectedMethod.name,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          setWalletPaymentId(d.payment?._id || null);
          setWalletInstructions(d.instructions || '');
          setWalletMethodName(selectedMethod.name);
          setShowCheckout(false);
          setShowWallet(true);
        } else {
          const d = await r.json().catch(() => ({}));
          Alert.alert('Error', d.message || 'Could not start wallet payment');
        }
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setCheckoutLoading(false); }
      return;
    }

    await submitCheckout(selectedMethod);
  };

  const submitCheckout = async (selectedMethod: PaymentMethod, fromWallet = false) => {
    if (!user) return;
    setCheckoutLoading(true);
    try {
      const payload = {
        userId: String(user.id), cashier: user.username,
        customerId: customer._id !== 'walkin' ? customer._id : null,
        customerName: customer.name, customerPhone: customer.phone || '',
        subtotal: parseFloat(subtotal.toFixed(2)),
        discount: parseFloat(discountAmt.toFixed(2)),
        discountType, discountInput: Number(discountValue) || 0,
        flatDiscount: parseFloat(flatDiscountAmt.toFixed(2)),
        couponCode: appliedCoupon?.code || '',
        couponDiscount: parseFloat(couponDiscount.toFixed(2)),
        tax: defaultTax?.type === 'inclusive' ? parseFloat(inclusiveTaxAmt.toFixed(2)) : parseFloat(taxAmt.toFixed(2)),
        taxName: defaultTax?.name || '', taxRate: defaultTax?.rate || 0, taxType: defaultTax?.type || 'exclusive',
        paymentMethod: fromWallet ? 'mobile_wallet' : normalizePaymentType(selectedMethod?.type),
        cashReceived: Number(cashReceived) || 0,
        total: parseFloat(total.toFixed(2)), note,
        items: cart.map(item => ({ id: String(item._id), name: item.name, quantity: item.qty, price: item.price })),
      };
      const r = await apiFetch('/api/checkout', { method: 'POST', body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { Alert.alert('Checkout Failed', d.message || 'Unknown error'); return; }

      setShowCheckout(false);
      const saleId = d.saleId || d._id;
      if (saleId) {
        const sr = await apiFetch(`/api/sales/${saleId}`);
        if (sr.ok) {
          const saleData: SaleDetail = await sr.json();
          clearCart(); setView('products'); setReceiptSale(saleData);
        } else {
          clearCart(); setView('products');
          Alert.alert('Success', `Order placed!\nTotal: $${total.toFixed(2)}`);
        }
      } else {
        clearCart(); setView('products');
        Alert.alert('Success', `Order placed!\nTotal: $${total.toFixed(2)}`);
      }
      loadProducts();
    } catch (e: any) { Alert.alert('Error', e.message || 'Checkout failed'); }
    finally { setCheckoutLoading(false); }
  };

  const confirmWalletPayment = async () => {
    if (walletPaymentId) {
      await apiFetch(`/api/payments/${walletPaymentId}/confirm`, { method: 'PATCH' }).catch(() => {});
    }
    const selectedMethod = paymentMethods.find(m => m._id === selectedMethodId) || paymentMethods[0];
    setShowWallet(false);
    await submitCheckout(selectedMethod, true);
  };

  const cancelWalletPayment = () => {
    if (walletPaymentId) {
      apiFetch(`/api/payments/${walletPaymentId}/cancel`, { method: 'PATCH' }).catch(() => {});
    }
    setShowWallet(false); setWalletPaymentId(null);
  };

  /* ── Camera view ── */
  if (showCamera) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setShowCamera(false)}>
        <View style={{ flex: 1 }}>
          <CameraScanner
            products={products}
            onFound={handleCameraFound}
            onNotFound={handleCameraNotFound}
            onClose={() => setShowCamera(false)}
          />
          <ScanFlash flash={scanFlash} />
        </View>
      </Modal>
    );
  }

  /* ── Products view ── */
  if (view === 'products') {
    return (
      <SafeAreaView style={s.container}>
        <LinearGradient colors={['#0C0A2E', '#17105C']} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={s.headerBlob} />
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>POS Terminal</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={s.headerSub}>{user?.name || user?.username}</Text>
              {defaultTax && defaultTax.rate > 0 && (
                <View style={s.taxPill}>
                  <Text style={s.taxPillTxt}>{defaultTax.name} {defaultTax.rate}%</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity style={s.logoutBtn}
            onPress={() => Alert.alert('Logout', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
            ])}>
            <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Search + category row ── */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={18} color={C.muted} style={{ marginLeft: 12 }} />
            <TextInput style={s.searchInput} placeholder="Search products or scan barcode…"
              placeholderTextColor="#aaa" value={search} onChangeText={setSearch} />
            {search ? (
              <TouchableOpacity style={s.searchClear} onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={C.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={s.scanBtn} onPress={() => setShowCamera(true)}>
            <Ionicons name="barcode-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Category dropdown button ── */}
        <TouchableOpacity style={s.catDropBtn} onPress={() => setShowCatDropdown(true)} activeOpacity={0.8}>
          <Ionicons name="layers-outline" size={15} color={C.primary} />
          <Text style={s.catDropLabel} numberOfLines={1}>
            {activeCategory === 'All' ? 'All Categories' : activeCategory}
          </Text>
          {activeCategory !== 'All' && (
            <View style={s.catDropBadge}>
              <Text style={s.catDropBadgeTxt}>{categoryCounts[activeCategory] ?? 0}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-down" size={14} color={C.muted} />
        </TouchableOpacity>

        {/* ── Product grid ── */}
        {loadingProducts ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={C.navy} />
            <Text style={{ color: '#888', marginTop: 10 }}>Loading products…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={p => p._id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
            contentContainerStyle={{ paddingVertical: 10, gap: 10, paddingBottom: itemCount > 0 ? 90 : 10 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                <Text style={{ color: '#aaa', fontSize: 14, marginTop: 8 }}>No products found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const inCart = cart.find(c => c._id === item._id);
              const outOfStock = item.quantity <= 0;
              const lowStock = !outOfStock && item.lowStockThreshold && item.quantity <= item.lowStockThreshold;
              return (
                <TouchableOpacity
                  style={[s.productCard, outOfStock && s.productCardDisabled, inCart && s.productCardActive]}
                  onPress={() => addToCart(item)}
                  disabled={outOfStock}
                  activeOpacity={0.85}
                >
                  {inCart && (
                    <View style={s.badge}>
                      <Text style={s.badgeTxt}>{inCart.qty}</Text>
                    </View>
                  )}
                  <View style={[s.productIcon, inCart && { backgroundColor: C.navy }]}>
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />
                    ) : (
                      <Ionicons name="cube-outline" size={32} color={inCart ? '#fff' : C.primary} />
                    )}
                  </View>
                  <Text style={s.productName} numberOfLines={2}>{item.name}</Text>
                  <Text style={s.productCat} numberOfLines={1}>{item.category}</Text>
                  <View style={s.productFooter}>
                    <Text style={s.productPrice}>${item.price.toFixed(2)}</Text>
                    {!outOfStock && (
                      <View style={[s.addBtn, inCart && { backgroundColor: C.primaryLight }]}>
                        <Ionicons name={inCart ? 'checkmark' : 'add'} size={16} color={inCart ? C.primary : '#fff'} />
                      </View>
                    )}
                  </View>
                  <View style={[s.stockBadge, { backgroundColor: outOfStock ? '#fff0f0' : lowStock ? '#fffbeb' : '#f0fff4' }]}>
                    <Text style={[s.stockTxt, { color: outOfStock ? C.red : lowStock ? C.amber : C.green }]}>
                      {outOfStock ? 'Out of stock' : `${item.quantity} left`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {itemCount > 0 && (
          <TouchableOpacity style={s.cartFab} onPress={() => setView('cart')} activeOpacity={0.85}>
            <View style={s.cartFabLeft}>
              <Ionicons name="cart" size={20} color="#fff" />
              <View style={s.cartFabBadge}><Text style={s.cartFabBadgeTxt}>{itemCount}</Text></View>
            </View>
            <Text style={s.cartFabTxt}>View Cart</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.cartFabPrice}>${total.toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Search suggestions overlay ── */}
        {search.trim().length > 0 && suggestions.length > 0 && (
          <View style={s.suggestBox}>
            <View style={s.suggestHeader}>
              <Text style={s.suggestHeaderTxt}>{suggestions.length} result{suggestions.length !== 1 ? 's' : ''}</Text>
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
              {suggestions.map(p => {
                const inCart = cart.find(c => c._id === p._id);
                const outOfStock = p.quantity <= 0;
                return (
                  <TouchableOpacity key={p._id} style={[s.suggestRow, outOfStock && { opacity: 0.5 }]}
                    onPress={() => { if (!outOfStock) { addToCart(p); setSearch(''); } }}
                    activeOpacity={0.7}>
                    <View style={s.suggestIconWrap}>
                      {p.image
                        ? <Image source={{ uri: p.image }} style={{ width: 38, height: 38, borderRadius: 8 }} contentFit="cover" />
                        : <Ionicons name="cube-outline" size={22} color={C.primary} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.suggestName} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.suggestMeta}>{p.category}  ·  {outOfStock ? 'Out of stock' : `${p.quantity} left`}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={s.suggestPrice}>${p.price.toFixed(2)}</Text>
                      {inCart && (
                        <View style={s.suggestInCart}>
                          <Text style={s.suggestInCartTxt}>In cart: {inCart.qty}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <ScanFlash flash={scanFlash} />
        <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} onNewSale={() => setReceiptSale(null)} onPrint={handlePrint} />

        {/* ── Category dropdown modal ── */}
        <Modal visible={showCatDropdown} transparent animationType="fade" onRequestClose={() => setShowCatDropdown(false)}>
          <TouchableOpacity style={s.catModalOverlay} activeOpacity={1} onPress={() => setShowCatDropdown(false)}>
            <View style={s.catModalSheet}>
              <View style={s.catModalHeader}>
                <Text style={s.catModalTitle}>Select Category</Text>
                <TouchableOpacity onPress={() => setShowCatDropdown(false)}>
                  <Ionicons name="close" size={20} color={C.muted} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {categories.map(cat => {
                  const isActive = activeCategory === cat;
                  return (
                    <TouchableOpacity key={cat} style={[s.catModalRow, isActive && s.catModalRowActive]}
                      onPress={() => { setActiveCategory(cat); setShowCatDropdown(false); }}>
                      <View style={[s.catModalDot, { backgroundColor: isActive ? C.primary : '#E5E7EB' }]} />
                      <Text style={[s.catModalTxt, isActive && s.catModalTxtActive]}>{cat}</Text>
                      <View style={s.catModalCount}>
                        <Text style={[s.catModalCountTxt, isActive && { color: C.primary }]}>{categoryCounts[cat] ?? 0}</Text>
                      </View>
                      {isActive && <Ionicons name="checkmark" size={16} color={C.primary} />}
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

  /* ── Cart view ── */
  return (
    <SafeAreaView style={s.container}>
      <LinearGradient colors={['#0C0A2E', '#17105C']} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.headerBlob} />
        <TouchableOpacity onPress={() => setView('products')} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cart ({itemCount})</Text>
        {cart.length > 0 ? (
          <TouchableOpacity onPress={clearCart}>
            <Text style={{ color: '#FCA5A5', fontWeight: '700', fontSize: 13 }}>Clear</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 50 }} />}
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={s.cartSection}>
          <Text style={s.cartSectionLabel}>Customer</Text>
          <TouchableOpacity style={s.customerRow} onPress={() => setShowCustomerPicker(true)}>
            <View style={s.customerAvatar}><Text style={{ color: '#fff', fontWeight: '700' }}>{customer.name.charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.customerName}>{customer.name}</Text>
              {customer.phone ? <Text style={s.customerPhone}>{customer.phone}</Text> : null}
            </View>
            <Text style={{ color: '#888' }}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={s.cartSection}>
          <Text style={s.cartSectionLabel}>Items</Text>
          {cart.length === 0 ? (
            <Text style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Cart is empty</Text>
          ) : cart.map(item => (
            <View key={item._id} style={s.cartRow}>
              <View style={s.cartItemIcon}><Ionicons name="cube-outline" size={18} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cartItemSub}>${item.price.toFixed(2)} × {item.qty} = ${(item.price * item.qty).toFixed(2)}</Text>
              </View>
              <View style={s.qtyRow}>
                <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item._id, -1)}>
                  <Ionicons name="remove" size={16} color={C.primary} />
                </TouchableOpacity>
                <Text style={s.qtyNum}>{item.qty}</Text>
                <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item._id, 1)}>
                  <Ionicons name="add" size={16} color={C.primary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeFromCart(item._id)} style={s.removeBtn}>
                <Ionicons name="trash-outline" size={16} color={C.red} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={s.cartSection}>
          <Text style={s.cartSectionLabel}>Coupon Code</Text>
          {appliedCoupon ? (
            <View style={s.couponApplied}>
              <View style={{ flex: 1 }}>
                <Text style={s.couponAppliedCode}>{appliedCoupon.code}</Text>
                <Text style={s.couponAppliedAmt}>Saving ${appliedCoupon.discount.toFixed(2)}</Text>
              </View>
              <TouchableOpacity onPress={removeCoupon} style={s.couponRemoveBtn}>
                <Text style={s.couponRemoveTxt}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[s.discInput, { flex: 1, textAlign: 'left' }]}
                placeholder="Enter coupon code"
                placeholderTextColor="#bbb"
                value={couponCode}
                onChangeText={t => setCouponCode(t.toUpperCase())}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={[s.couponApplyBtn, (!couponCode.trim() || couponLoading) && { opacity: 0.5 }]}
                onPress={applyCoupon} disabled={!couponCode.trim() || couponLoading}>
                {couponLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.couponApplyTxt}>Apply</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={s.cartSection}>
          <Text style={s.cartSectionLabel}>Note (optional)</Text>
          <TextInput style={s.noteInput} placeholder="Add order note…" placeholderTextColor="#bbb" value={note} onChangeText={setNote} multiline />
        </View>

        <View style={s.cartSection}>
          <Text style={s.cartSectionLabel}>Discount</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={[s.discType, discountType === 'fixed' && s.discTypeActive]} onPress={() => setDiscountType('fixed')}>
              <Text style={[s.discTypeTxt, discountType === 'fixed' && { color: '#fff' }]}>$ Fixed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.discType, discountType === 'percent' && s.discTypeActive]} onPress={() => setDiscountType('percent')}>
              <Text style={[s.discTypeTxt, discountType === 'percent' && { color: '#fff' }]}>% Percent</Text>
            </TouchableOpacity>
            <TextInput style={s.discInput} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#bbb"
              value={discountValue === '' ? '' : String(discountValue)}
              onChangeText={t => setDiscountValue(t === '' ? '' : Math.max(0, parseFloat(t) || 0))} />
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={[s.cartSectionLabel, { marginBottom: 4 }]}>Flat Discount</Text>
            <TextInput style={[s.discInput, { width: '100%' }]} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#bbb"
              value={flatDiscount === '' ? '' : String(flatDiscount)}
              onChangeText={t => setFlatDiscount(t === '' ? '' : Math.max(0, parseFloat(t) || 0))} />
          </View>
        </View>

        <View style={s.cartSection}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalVal}>${subtotal.toFixed(2)}</Text></View>
          {discountAmt > 0 && <View style={s.totalRow}><Text style={[s.totalLabel, { color: C.green }]}>Discount {discountType === 'percent' ? `(${discountValue}%)` : ''}</Text><Text style={[s.totalVal, { color: C.green }]}>−${discountAmt.toFixed(2)}</Text></View>}
          {flatDiscountAmt > 0 && <View style={s.totalRow}><Text style={[s.totalLabel, { color: C.green }]}>Flat Discount</Text><Text style={[s.totalVal, { color: C.green }]}>−${flatDiscountAmt.toFixed(2)}</Text></View>}
          {appliedCoupon && couponDiscount > 0 && <View style={s.totalRow}><Text style={[s.totalLabel, { color: C.green }]}>Coupon ({appliedCoupon.code})</Text><Text style={[s.totalVal, { color: C.green }]}>−${couponDiscount.toFixed(2)}</Text></View>}
          {defaultTax?.type === 'exclusive' && taxAmt > 0 && <View style={s.totalRow}><Text style={s.totalLabel}>{defaultTax.name} ({defaultTax.rate}%)</Text><Text style={s.totalVal}>${taxAmt.toFixed(2)}</Text></View>}
          {defaultTax?.type === 'inclusive' && inclusiveTaxAmt > 0 && <View style={s.totalRow}><Text style={[s.totalLabel, { color: '#888' }]}>Incl. {defaultTax.name} ({defaultTax.rate}%)</Text><Text style={[s.totalVal, { color: '#888' }]}>${inclusiveTaxAmt.toFixed(2)}</Text></View>}
          <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 4 }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>Total</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.blue }}>${total.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.checkoutWrap}>
        <TouchableOpacity style={[s.checkoutBtn, cart.length === 0 && { opacity: 0.4 }]}
          onPress={() => setShowCheckout(true)} disabled={cart.length === 0}>
          <Text style={s.checkoutBtnTxt}>Review & Checkout  ${total.toFixed(2)}</Text>
        </TouchableOpacity>
      </View>

      <CustomerPickerModal visible={showCustomerPicker} selected={customer}
        onSelect={setCustomer} onClose={() => setShowCustomerPicker(false)} />

      <CheckoutModal
        visible={showCheckout} cart={cart} customer={customer}
        subtotal={subtotal} discountAmt={discountAmt + flatDiscountAmt}
        couponDiscount={couponDiscount} taxAmt={taxAmt} total={total}
        taxConfig={defaultTax} paymentMethods={paymentMethods}
        selectedMethodId={selectedMethodId} cashReceived={cashReceived}
        appliedCoupon={appliedCoupon}
        onMethodChange={setSelectedMethodId} onCashChange={setCashReceived}
        loading={checkoutLoading} onConfirm={handleCheckout}
        onClose={() => !checkoutLoading && setShowCheckout(false)}
      />

      {showWallet && (
        <WalletPaymentModal
          methodName={walletMethodName}
          amount={total}
          instructions={walletInstructions}
          loading={checkoutLoading}
          onConfirm={confirmWalletPayment}
          onCancel={cancelWalletPayment}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, overflow: 'hidden' },
  headerBlob: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(99,102,241,0.13)', top: -80, right: -40 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  taxPill:     { backgroundColor: 'rgba(16,185,129,0.22)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  taxPillTxt:  { color: '#34d399', fontSize: 10, fontWeight: '700' },
  logoutBtn:   { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 },
  searchWrap:  { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBar:   { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, shadowColor: '#6366F1', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  searchInput: { flex: 1, paddingVertical: 13, paddingHorizontal: 8, fontSize: 14, color: '#333' },
  searchClear: { padding: 10 },
  scanBtn:     { width: 48, height: 48, backgroundColor: C.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  catChip:          { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8 },
  catChipActive:    { backgroundColor: C.primary },
  catChipTxt:       { fontSize: 13, fontWeight: '600', color: '#555' },
  catChipTxtActive: { color: '#fff' },
  /* Category dropdown button */
  catDropBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8, marginBottom: 4, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  catDropLabel:{ fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  catDropBadge:{ backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  catDropBadgeTxt: { fontSize: 11, fontWeight: '700', color: C.primary },
  /* Category modal */
  catModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  catModalSheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, maxHeight: '75%' },
  catModalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  catModalTitle:   { fontSize: 15, fontWeight: '800', color: C.text },
  catModalRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  catModalRowActive: { backgroundColor: '#F5F3FF' },
  catModalDot:     { width: 8, height: 8, borderRadius: 4 },
  catModalTxt:     { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  catModalTxtActive: { color: C.primary },
  catModalCount:   { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  catModalCountTxt:{ fontSize: 12, fontWeight: '700', color: C.muted },
  /* Search suggestions */
  suggestBox:       { position: 'absolute', top: 128, left: 12, right: 12, backgroundColor: '#fff', borderRadius: 16, zIndex: 50, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, elevation: 10, overflow: 'hidden' },
  suggestHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  suggestHeaderTxt: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  suggestIconWrap:  { width: 42, height: 42, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  suggestName:      { fontSize: 14, fontWeight: '700', color: C.text },
  suggestMeta:      { fontSize: 11, color: C.muted, marginTop: 2 },
  suggestPrice:     { fontSize: 14, fontWeight: '800', color: C.primary },
  suggestInCart:    { backgroundColor: C.primaryLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  suggestInCartTxt: { fontSize: 10, fontWeight: '700', color: C.primary },
  productCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#6366F1', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, borderWidth: 2, borderColor: 'transparent' },
  productCardActive: { borderColor: C.primary, backgroundColor: '#FAFAFF' },
  productCardDisabled: { opacity: 0.45 },
  productIcon: { backgroundColor: '#EEF2FF', borderRadius: 12, marginBottom: 8, alignItems: 'center', justifyContent: 'center', height: 70 },
  productName: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  productCat:  { fontSize: 11, color: C.muted, marginBottom: 6 },
  productFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  productPrice:{ fontSize: 16, fontWeight: '800', color: C.primary },
  addBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  productBarcode: { fontSize: 9, color: C.light, fontFamily: 'monospace', marginBottom: 4 },
  stockBadge:  { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  stockTxt:    { fontSize: 10, fontWeight: '700' },
  badge: { position: 'absolute', top: -6, right: -6, backgroundColor: C.primary, borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 2, borderColor: '#fff' },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  cartFab: { margin: 12, backgroundColor: C.primary, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', shadowColor: '#6366F1', shadowOpacity: 0.4, shadowRadius: 14, elevation: 8 },
  cartFabLeft: { position: 'relative', marginRight: 10 },
  cartFabBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: C.red, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: C.primary },
  cartFabBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  cartFabTxt: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
  cartFabPrice: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 16 },
  cartSection: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, borderRadius: 16, padding: 14 },
  cartSectionLabel: { fontSize: 10, fontWeight: '700', color: C.light, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  customerName: { fontSize: 14, fontWeight: '700', color: C.text },
  customerPhone: { fontSize: 12, color: C.muted, marginTop: 1 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 8 },
  cartItemIcon: { width: 36, height: 36, backgroundColor: '#F0F0FA', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cartItemName: { fontSize: 13, fontWeight: '600', color: C.text },
  cartItemSub:  { fontSize: 11, color: C.muted, marginTop: 2 },
  qtyRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn:    { width: 32, height: 32, borderRadius: 10, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  qtyNum:    { fontSize: 15, fontWeight: '800', color: C.text, minWidth: 26, textAlign: 'center' },
  removeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginLeft: 2 },
  noteInput: { backgroundColor: '#F8F8FF', borderRadius: 10, padding: 10, fontSize: 13, color: '#333', minHeight: 44 },
  couponApplied: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  couponAppliedCode: { fontSize: 14, fontWeight: '800', color: C.green },
  couponAppliedAmt: { fontSize: 12, color: C.green, marginTop: 2 },
  couponRemoveBtn: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  couponRemoveTxt: { color: C.red, fontWeight: '700', fontSize: 12 },
  couponApplyBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  couponApplyTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  discType: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F0F0FA' },
  discTypeActive: { backgroundColor: C.primary },
  discTypeTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  discInput: { flex: 1, backgroundColor: '#F8F8FF', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, fontSize: 14, fontWeight: '600', color: '#333', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel: { fontSize: 13, color: C.muted },
  totalVal: { fontSize: 13, fontWeight: '600', color: C.text },
  checkoutWrap: { padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  checkoutBtn: { backgroundColor: C.primary, borderRadius: 16, padding: 18, alignItems: 'center', shadowColor: '#6366F1', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  checkoutBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
