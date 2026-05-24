import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Directory, Paths } from 'expo-file-system';
import { StorageAccessFramework, readAsStringAsync } from 'expo-file-system/legacy';
import { apiFetch } from '@/lib/api';

const C = {
  navy: '#0C0A2E', blue: '#6366F1', green: '#10B981', amber: '#F59E0B',
  red: '#EF4444', purple: '#8B5CF6', bg: '#F0F0FA', card: '#ffffff',
  border: '#E5E7EB', text: '#111827', muted: '#6B7280', light: '#9CA3AF',
  primary: '#6366F1', primaryLight: '#EEF2FF',
};

/* ─── Save a file directly to the device file manager ───────────────────────
   Android: SAF → Downloads folder (directory picker shown once per session)
   iOS:     app documentDirectory/receipts/ (visible in Files app)
──────────────────────────────────────────────────────────────────────────── */
async function saveToFileManager(
  srcUri: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  if (Platform.OS !== 'android') {
    const dir = new Directory(Paths.document, 'receipts');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, fileName);
    if (dest.exists) dest.delete();
    new File(srcUri).copy(dest);
    return dest.uri;
  }

  // Android: write to public Downloads via Storage Access Framework
  const downloadsUri = StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync(downloadsUri);
  if (!perm.granted) throw new Error('Storage permission not granted. Please allow access to Downloads.');

  const base64 = await readAsStringAsync(srcUri, { encoding: 'base64' });
  // createFileAsync expects name WITHOUT extension; Android appends it based on mimeType
  const nameNoExt = fileName.replace(/\.[^.]+$/, '');
  const fileUri = await StorageAccessFramework.createFileAsync(perm.directoryUri, nameNoExt, mimeType);
  await StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
  return fileUri;
}

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
   Thermal Receipt HTML  (80mm POS style)
════════════════════════════════════════ */
function buildThermalHtml(sale: SaleDetail): string {
  const dash = '- - - - - - - - - - - - - - - - - -';
  const line  = '====================================';

  const pad = (left: string, right: string, total = 36) => {
    const gap = total - left.length - right.length;
    return left + ' '.repeat(Math.max(gap, 1)) + right;
  };

  const itemLines = sale.items.map(i => {
    const qtyPrice = `x${i.quantity}  $${i.lineTotal.toFixed(2)}`;
    if (i.name.length + qtyPrice.length + 1 <= 36) {
      return pad(i.name, qtyPrice);
    }
    const name1 = i.name.substring(0, 34);
    const name2 = i.name.substring(34);
    return `${name1}\n  ${name2 ? name2 + '\n' : ''}${pad('', qtyPrice)}`;
  }).join('\n');

  const discLines = [
    (sale.discount ?? 0) > 0       ? pad('Discount',                            `-$${sale.discount!.toFixed(2)}`) : '',
    (sale.flatDiscount ?? 0) > 0    ? pad('Flat Discount',                       `-$${sale.flatDiscount!.toFixed(2)}`) : '',
    sale.couponCode && (sale.couponDiscount ?? 0) > 0
                                    ? pad(`Coupon (${sale.couponCode})`,          `-$${sale.couponDiscount!.toFixed(2)}`) : '',
  ].filter(Boolean).join('\n');

  const taxLine = (sale.tax ?? 0) > 0
    ? pad(`${sale.taxName || 'Tax'}${sale.taxRate ? ` (${sale.taxRate}%)` : ''}`, `$${sale.tax!.toFixed(2)}`)
    : '';

  const cashAmt   = sale.cashReceived ?? 0;
  const changeAmt = sale.change ?? (cashAmt > sale.total ? cashAmt - sale.total : 0);
  const cashLines = cashAmt > 0 && sale.paymentMethod === 'cash'
    ? `${pad('Cash Received', `$${cashAmt.toFixed(2)}`)}\n${changeAmt > 0 ? pad('Change', `$${changeAmt.toFixed(2)}`) : ''}`
    : '';

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&color=000000&margin=4&data=${encodeURIComponent(sale.invoiceNumber)}`;

  const noteLine = sale.note ? `\n${dash}\nNOTE: ${sale.note}\n` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.55;
      max-width: 302px;
      margin: 0 auto;
      padding: 12px 8px 20px;
      background: #fff;
      color: #000;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .center { text-align: center; display: block; }
    .bold   { font-weight: bold; }
    .big    { font-size: 15px; font-weight: bold; }
    .total  { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
    .qr     { display: block; margin: 8px auto; width: 100px; height: 100px; }
    .cut    { text-align: center; letter-spacing: 3px; color: #999; font-size: 10px; margin-top: 6px; }
  </style>
  </head><body><span class="center big">★ POS Receipt ★</span>
<span class="center">Point of Sale System</span>
${line}
${pad('Invoice:', sale.invoiceNumber)}
${pad('Date:', new Date(sale.timestamp).toLocaleString())}
${pad('Customer:', sale.customerName)}
${pad('Cashier:', sale.cashier)}
${pad('Payment:', normalizePayMethod(sale.paymentMethod))}
${dash}
<span class="bold">${pad('ITEM', 'QTY   AMOUNT')}</span>
${dash}
${itemLines}
${dash}
${pad('Subtotal', `$${(sale.subtotal ?? 0).toFixed(2)}`)}
${discLines}${discLines ? '\n' : ''}${taxLine}${taxLine ? '\n' : ''}${dash}
<span class="total">${pad('** TOTAL **', `$${sale.total.toFixed(2)} **`)}</span>
${line}
${cashLines}${cashLines ? '\n' + line : ''}${noteLine}
<span class="center">
</span>
<img class="qr" src="${qrUrl}" />
<span class="center">Scan to verify: ${sale.invoiceNumber}</span>
<span class="center">
</span>
<span class="center bold">Thank you for your business!</span>
<span class="center">Please come again soon.</span>
<span class="center">
</span>
<span class="cut">- - - ✂ CUT HERE ✂ - - -</span>
  </body></html>`;
}

/* ════════════════════════════════════════
   Image Receipt HTML  (card-sized portrait)
════════════════════════════════════════ */
function buildImageHtml(sale: SaleDetail): string {
  const STATUS_BG: Record<string, string> = {
    completed: '#DCFCE7', pending: '#EDE9FE', processing: '#DBEAFE',
    cancelled: '#FEE2E2', refunded: '#FEF3C7',
  };
  const STATUS_TEXT: Record<string, string> = {
    completed: '#16A34A', pending: '#7C3AED', processing: '#2563EB',
    cancelled: '#DC2626', refunded: '#D97706',
  };
  const sBg  = STATUS_BG[sale.status]   || '#F3F4F6';
  const sTxt = STATUS_TEXT[sale.status] || '#374151';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=ffffff&color=0C0A2E&margin=5&data=${encodeURIComponent(sale.invoiceNumber)}`;

  const itemRows = sale.items.map((i, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#F8F8FF'};">
      <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#111827;">${i.name}</td>
      <td style="padding:8px 12px;text-align:center;"><span style="background:#EEF2FF;color:#6366F1;font-weight:700;font-size:11px;padding:2px 7px;border-radius:5px;">${i.quantity}</span></td>
      <td style="padding:8px 12px;text-align:right;font-size:12px;color:#6B7280;">$${i.price.toFixed(2)}</td>
      <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:700;color:#111827;">$${i.lineTotal.toFixed(2)}</td>
    </tr>`).join('');

  const discRows = [
    (sale.discount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;"><span style="color:#6B7280;">Discount</span><span style="color:#10B981;font-weight:600;">−$${sale.discount!.toFixed(2)}</span></div>` : '',
    (sale.flatDiscount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;"><span style="color:#6B7280;">Flat Discount</span><span style="color:#10B981;font-weight:600;">−$${sale.flatDiscount!.toFixed(2)}</span></div>` : '',
    sale.couponCode && (sale.couponDiscount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;"><span style="color:#6B7280;">Coupon (${sale.couponCode})</span><span style="color:#10B981;font-weight:600;">−$${sale.couponDiscount!.toFixed(2)}</span></div>` : '',
  ].join('');

  const taxRow = (sale.tax ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;"><span style="color:#6B7280;">${sale.taxName || 'Tax'}${sale.taxRate ? ` (${sale.taxRate}%)` : ''}</span><span style="font-weight:600;">$${sale.tax!.toFixed(2)}</span></div>` : '';

  const cashAmt   = sale.cashReceived ?? 0;
  const changeAmt = sale.change ?? (cashAmt > sale.total ? cashAmt - sale.total : 0);
  const cashRows  = cashAmt > 0 && sale.paymentMethod === 'cash'
    ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:8px;padding-top:8px;border-top:1px solid #E5E7EB;"><span style="color:#6B7280;">Cash Received</span><span style="font-weight:600;">$${cashAmt.toFixed(2)}</span></div>${changeAmt > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;"><span style="color:#6B7280;">Change</span><span style="color:#F59E0B;font-weight:700;">$${changeAmt.toFixed(2)}</span></div>` : ''}` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    @page { size: 420px 680px; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, Arial, sans-serif; background: #fff; width: 420px; }
  </style>
  </head><body>
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0C0A2E 0%,#17105C 55%,#2D1B69 100%);padding:22px 18px 18px;text-align:center;overflow:hidden;position:relative;">
    <div style="position:absolute;width:160px;height:160px;border-radius:80px;background:rgba(99,102,241,0.15);top:-55px;right:-30px;"></div>
    <div style="font-size:18px;font-weight:900;color:#fff;position:relative;">POS Receipt</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:2px;position:relative;">Sales Invoice</div>
    <div style="display:inline-block;margin-top:8px;padding:3px 12px;border-radius:14px;font-size:10px;font-weight:800;letter-spacing:0.8px;background:${sBg};color:${sTxt};position:relative;">${sale.status.toUpperCase()}</div>
  </div>
  <!-- QR + Invoice -->
  <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #E5E7EB;background:#FAFBFF;">
    <div style="flex-shrink:0;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px;padding:6px;">
      <img src="${qrUrl}" style="width:88px;height:88px;display:block;border-radius:4px;" />
    </div>
    <div style="flex:1;">
      <div style="font-size:9px;font-weight:700;color:#9CA3AF;letter-spacing:1px;text-transform:uppercase;">Invoice</div>
      <div style="font-size:14px;font-weight:900;color:#111827;margin:3px 0 2px;">${sale.invoiceNumber}</div>
      <div style="font-size:10px;color:#6B7280;margin-bottom:6px;">${new Date(sale.timestamp).toLocaleString()}</div>
      <div style="font-size:9px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:2px;">Total</div>
      <div style="font-size:22px;font-weight:900;color:#6366F1;letter-spacing:-0.5px;">$${sale.total.toFixed(2)}</div>
    </div>
  </div>
  <!-- Meta -->
  <div style="display:flex;padding:10px 16px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;gap:10px;">
    <div style="flex:1;"><div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">Customer</div><div style="font-size:11px;font-weight:700;color:#111827;">${sale.customerName}</div></div>
    <div style="flex:1;"><div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">Cashier</div><div style="font-size:11px;font-weight:700;color:#111827;">${sale.cashier}</div></div>
    <div style="flex:1;"><div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">Payment</div><div style="font-size:11px;font-weight:700;color:#111827;">${normalizePayMethod(sale.paymentMethod)}</div></div>
  </div>
  <!-- Items -->
  <div style="font-size:9px;font-weight:700;color:#9CA3AF;letter-spacing:1px;text-transform:uppercase;padding:10px 16px 6px;">Items (${sale.items.length})</div>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr style="background:#F3F4F6;">
      <th style="padding:7px 12px;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.4px;text-align:left;">Item</th>
      <th style="padding:7px 12px;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.4px;text-align:center;">Qty</th>
      <th style="padding:7px 12px;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.4px;text-align:right;">Price</th>
      <th style="padding:7px 12px;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.4px;text-align:right;">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <!-- Totals -->
  <div style="padding:12px 16px;border-top:1px solid #E5E7EB;">
    <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;"><span style="color:#6B7280;">Subtotal</span><span style="font-weight:600;">$${(sale.subtotal ?? 0).toFixed(2)}</span></div>
    ${discRows}${taxRow}
    <div style="display:flex;justify-content:space-between;border-top:2px solid #6366F1;padding-top:10px;margin-top:6px;">
      <span style="font-size:13px;font-weight:800;color:#111827;">Total</span>
      <span style="font-size:20px;font-weight:900;color:#6366F1;">$${sale.total.toFixed(2)}</span>
    </div>
    ${cashRows}
  </div>
  <!-- Footer -->
  <div style="text-align:center;padding:14px 16px 18px;border-top:1px dashed #D1D5DB;background:#FAFBFF;">
    <div style="font-size:14px;font-weight:900;color:#111827;margin-bottom:4px;">Thank You!</div>
    <div style="font-size:10px;color:#9CA3AF;">We appreciate your business</div>
    <div style="display:inline-block;margin-top:8px;background:#EEF2FF;border-radius:7px;padding:5px 12px;">
      <div style="font-size:9px;color:#9CA3AF;margin-bottom:1px;">Scan to verify</div>
      <div style="font-size:10px;font-weight:700;color:#6366F1;font-family:monospace;">${sale.invoiceNumber}</div>
    </div>
  </div>
  </body></html>`;
}

/* ════════════════════════════════════════
   HTML Receipt Generator  (A4 / PDF)
════════════════════════════════════════ */
function buildReceiptHtml(sale: SaleDetail): string {
  const STATUS_BG: Record<string, string> = {
    completed: '#DCFCE7', pending: '#EDE9FE', processing: '#DBEAFE',
    cancelled: '#FEE2E2', refunded: '#FEF3C7',
  };
  const STATUS_TEXT: Record<string, string> = {
    completed: '#16A34A', pending: '#7C3AED', processing: '#2563EB',
    cancelled: '#DC2626', refunded: '#D97706',
  };
  const sBg   = STATUS_BG[sale.status]   || '#F3F4F6';
  const sTxt  = STATUS_TEXT[sale.status] || '#374151';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=ffffff&color=0C0A2E&margin=6&data=${encodeURIComponent(sale.invoiceNumber)}`;

  const itemRows = sale.items.map((i, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#FAFAFA'}">
      <td style="padding:11px 20px;font-size:13px;font-weight:600;color:#111827;">${i.name}</td>
      <td style="padding:11px 20px;text-align:center;">
        <span style="background:#EEF2FF;color:#6366F1;font-weight:700;font-size:12px;padding:3px 10px;border-radius:6px;">${i.quantity}</span>
      </td>
      <td style="padding:11px 20px;text-align:right;font-size:13px;color:#6B7280;">$${i.price.toFixed(2)}</td>
      <td style="padding:11px 20px;text-align:right;font-size:13px;font-weight:700;color:#111827;">$${i.lineTotal.toFixed(2)}</td>
    </tr>`).join('');

  const discountRows = [
    (sale.discount ?? 0) > 0
      ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:#6B7280;">Discount</span><span style="color:#10B981;font-weight:600;">−$${sale.discount!.toFixed(2)}</span></div>` : '',
    (sale.flatDiscount ?? 0) > 0
      ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:#6B7280;">Flat Discount</span><span style="color:#10B981;font-weight:600;">−$${sale.flatDiscount!.toFixed(2)}</span></div>` : '',
    sale.couponCode && (sale.couponDiscount ?? 0) > 0
      ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:#6B7280;">Coupon (${sale.couponCode})</span><span style="color:#10B981;font-weight:600;">−$${sale.couponDiscount!.toFixed(2)}</span></div>` : '',
  ].join('');

  const taxRow = (sale.tax ?? 0) > 0
    ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:#6B7280;">${sale.taxName || 'Tax'}${sale.taxRate ? ` (${sale.taxRate}%)` : ''}</span><span style="font-weight:600;color:#111827;">$${sale.tax!.toFixed(2)}</span></div>`
    : '';

  const cashAmt   = sale.cashReceived ?? 0;
  const changeAmt = sale.change ?? (cashAmt > sale.total ? cashAmt - sale.total : 0);
  const cashRows  = cashAmt > 0 && sale.paymentMethod === 'cash' ? `
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:10px;padding-top:10px;border-top:1px solid #E5E7EB;">
      <span style="color:#6B7280;">Cash Received</span><span style="font-weight:600;">$${cashAmt.toFixed(2)}</span>
    </div>
    ${changeAmt > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px;"><span style="color:#6B7280;">Change</span><span style="color:#F59E0B;font-weight:700;">$${changeAmt.toFixed(2)}</span></div>` : ''}` : '';

  const noteSection = sale.note ? `
    <div style="margin:0 24px 16px;background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:8px;padding:12px 14px;">
      <div style="font-size:10px;font-weight:700;color:#92400E;letter-spacing:0.8px;margin-bottom:4px;">NOTE</div>
      <div style="font-size:13px;color:#92400E;">${sale.note}</div>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:-apple-system,Arial,Helvetica,sans-serif;background:#fff;color:#111827;max-width:680px;margin:0 auto;}
    @media print{body{max-width:100%;}}
  </style>
  </head><body>

  <!-- ▌Header gradient -->
  <div style="background:linear-gradient(135deg,#0C0A2E 0%,#17105C 55%,#2D1B69 100%);padding:36px 28px 28px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;width:240px;height:240px;border-radius:120px;background:rgba(99,102,241,0.15);top:-80px;right:-60px;"></div>
    <div style="position:absolute;width:120px;height:120px;border-radius:60px;background:rgba(139,92,246,0.12);bottom:-30px;left:20px;"></div>
    <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;position:relative;">POS Receipt</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:4px;position:relative;">Sales Invoice</div>
    <div style="display:inline-block;margin-top:14px;padding:5px 16px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:1px;background:${sBg};color:${sTxt};position:relative;">${sale.status.toUpperCase()}</div>
  </div>

  <!-- ▌QR + Invoice info -->
  <div style="display:flex;align-items:center;gap:20px;padding:22px 24px;border-bottom:1px solid #E5E7EB;background:#FAFBFF;">
    <div style="flex-shrink:0;background:#fff;border:2px solid #E5E7EB;border-radius:14px;padding:8px;box-shadow:0 2px 8px rgba(99,102,241,0.1);">
      <img src="${qrUrl}" style="width:110px;height:110px;display:block;border-radius:6px;" />
    </div>
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;letter-spacing:1.2px;text-transform:uppercase;">Invoice Number</div>
      <div style="font-size:19px;font-weight:900;color:#111827;margin:5px 0 3px;letter-spacing:-0.3px;">${sale.invoiceNumber}</div>
      <div style="font-size:12px;color:#6B7280;margin-bottom:10px;">${new Date(sale.timestamp).toLocaleString()}</div>
      <div style="font-size:11px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:3px;">Amount Due</div>
      <div style="font-size:32px;font-weight:900;color:#6366F1;letter-spacing:-1px;">$${sale.total.toFixed(2)}</div>
    </div>
  </div>

  <!-- ▌Customer / Cashier / Payment row -->
  <div style="display:flex;padding:16px 24px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;gap:16px;">
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">Customer</div>
      <div style="font-size:13px;font-weight:700;color:#111827;">${sale.customerName}</div>
      ${sale.customerPhone ? `<div style="font-size:11px;color:#6B7280;margin-top:2px;">${sale.customerPhone}</div>` : ''}
    </div>
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">Cashier</div>
      <div style="font-size:13px;font-weight:700;color:#111827;">${sale.cashier}</div>
    </div>
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">Payment</div>
      <div style="font-size:13px;font-weight:700;color:#111827;">${normalizePayMethod(sale.paymentMethod)}</div>
    </div>
  </div>

  <!-- ▌Items table -->
  <div style="font-size:10px;font-weight:700;color:#9CA3AF;letter-spacing:1px;text-transform:uppercase;padding:16px 24px 10px;">Items (${sale.items.length})</div>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#F3F4F6;">
        <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;text-align:left;">Item</th>
        <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Qty</th>
        <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Price</th>
        <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- ▌Totals -->
  <div style="padding:20px 24px;border-top:1px solid #E5E7EB;">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;">
      <span style="color:#6B7280;">Subtotal</span>
      <span style="font-weight:600;color:#111827;">$${(sale.subtotal ?? 0).toFixed(2)}</span>
    </div>
    ${discountRows}${taxRow}
    <div style="display:flex;justify-content:space-between;border-top:2px solid #6366F1;padding-top:14px;margin-top:10px;">
      <span style="font-size:17px;font-weight:800;color:#111827;">Total</span>
      <span style="font-size:28px;font-weight:900;color:#6366F1;letter-spacing:-0.5px;">$${sale.total.toFixed(2)}</span>
    </div>
    ${cashRows}
  </div>

  ${noteSection}

  <!-- ▌Footer -->
  <div style="text-align:center;padding:28px 24px 36px;border-top:1px dashed #D1D5DB;">
    <div style="font-size:20px;font-weight:900;color:#111827;margin-bottom:6px;">Thank You!</div>
    <div style="font-size:13px;color:#9CA3AF;margin-bottom:16px;">We appreciate your business.</div>
    <div style="display:inline-block;background:#EEF2FF;border-radius:10px;padding:8px 16px;">
      <div style="font-size:10px;color:#9CA3AF;margin-bottom:3px;">Scan QR to verify</div>
      <div style="font-size:11px;font-weight:700;color:#6366F1;font-family:monospace;">${sale.invoiceNumber}</div>
    </div>
    <div style="font-size:10px;color:#D1D5DB;margin-top:16px;">Powered by POS System</div>
  </div>

  </body></html>`;
}

/* ════════════════════════════════════════
   Receipt Modal (with QR Code)
════════════════════════════════════════ */
function ReceiptModal({ sale, onClose, onStatusChange }: {
  sale: SaleDetail | null; onClose(): void;
  onStatusChange(id: string, status: string): void;
}) {
  const [changing, setChanging]         = useState(false);
  const [showExportSheet, setShowExport] = useState(false);
  const [exporting, setExporting]        = useState<'print' | 'pdf' | 'image' | null>(null);
  if (!sale) return null;

  const actions = TRANSITIONS[sale.status] || [];
  const cashAmt = sale.cashReceived ?? 0;
  const changeAmt = sale.change ?? (cashAmt > sale.total ? cashAmt - sale.total : 0);
  const statusColor = STATUS_COLORS[sale.status] || '#888';
  const qrValue = sale.invoiceNumber || String(sale.id);

  /* ── Export handlers ── */
  const handleThermalPrint = async () => {
    setExporting('print');
    try {
      await Print.printAsync({ html: buildThermalHtml(sale) });
    } catch (e: any) {
      Alert.alert('Print Error', e.message);
    } finally { setExporting(null); setShowExport(false); }
  };

  const handlePDF = async () => {
    setExporting('pdf');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildReceiptHtml(sale), base64: false });
      const name = `Receipt_${sale.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      await saveToFileManager(uri, name, 'application/pdf');
      Alert.alert(
        'PDF Saved',
        Platform.OS === 'android'
          ? `"${name}" saved to Downloads folder.`
          : `"${name}" saved.\nOpen the Files app → On My iPhone → POSAPP.`
      );
    } catch (e: any) {
      Alert.alert('Export Error', e.message);
    } finally { setExporting(null); setShowExport(false); }
  };

  const handleImage = async () => {
    setExporting('image');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildImageHtml(sale), base64: false });
      const name = `Receipt_${sale.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}_card.pdf`;
      await saveToFileManager(uri, name, 'application/pdf');
      Alert.alert(
        'Image Saved',
        Platform.OS === 'android'
          ? `Receipt card "${name}" saved to Downloads folder.`
          : `Receipt card saved.\nOpen the Files app → On My iPhone → POSAPP.`
      );
    } catch (e: any) {
      Alert.alert('Export Error', e.message);
    } finally { setExporting(null); setShowExport(false); }
  };

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
          {/* Export icon button in header */}
          <TouchableOpacity onPress={() => setShowExport(true)} style={rm.printIconBtn} disabled={!!exporting}>
            {exporting
              ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
              : <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.85)" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={rm.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </LinearGradient>

        {(changing || !!exporting) && (
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

          {/* ── Export button ── */}
          <TouchableOpacity
            style={[rm.printBtn, !!exporting && { opacity: 0.6 }]}
            onPress={() => setShowExport(true)}
            disabled={!!exporting}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#0C0A2E', '#17105C']} style={rm.printBtnGrad}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={rm.printBtnTxt}>Print / Export Receipt</Text>
              <Ionicons name="chevron-up" size={15} color="rgba(255,255,255,0.5)" />
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>

        {/* ── Export bottom sheet ── */}
        <Modal
          visible={showExportSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowExport(false)}
        >
          <TouchableOpacity
            style={rm.sheetOverlay}
            activeOpacity={1}
            onPress={() => setShowExport(false)}
          >
            <View style={rm.sheet}>
              {/* Sheet handle */}
              <View style={rm.sheetHandle} />
              <Text style={rm.sheetTitle}>Export Receipt</Text>
              <Text style={rm.sheetSub}>#{sale.invoiceNumber}</Text>

              {/* Option 1 — Print */}
              <TouchableOpacity
                style={[rm.exportRow, exporting === 'print' && rm.exportRowActive]}
                onPress={handleThermalPrint}
                disabled={!!exporting}
                activeOpacity={0.75}
              >
                <View style={[rm.exportIconWrap, { backgroundColor: '#F0F0FA' }]}>
                  {exporting === 'print'
                    ? <ActivityIndicator size="small" color={C.navy} />
                    : <Ionicons name="print-outline" size={22} color={C.navy} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rm.exportLabel}>Print Receipt</Text>
                  <Text style={rm.exportSub}>Thermal POS style · Opens print dialog</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.light} />
              </TouchableOpacity>

              {/* Option 2 — PDF */}
              <TouchableOpacity
                style={[rm.exportRow, exporting === 'pdf' && rm.exportRowActive]}
                onPress={handlePDF}
                disabled={!!exporting}
                activeOpacity={0.75}
              >
                <View style={[rm.exportIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  {exporting === 'pdf'
                    ? <ActivityIndicator size="small" color="#DC2626" />
                    : <Ionicons name="document-text-outline" size={22} color="#DC2626" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rm.exportLabel}>Download PDF</Text>
                  <Text style={rm.exportSub}>Modern A4 receipt · Saved instantly to device</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.light} />
              </TouchableOpacity>

              {/* Option 3 — JPG / Image */}
              <TouchableOpacity
                style={[rm.exportRow, exporting === 'image' && rm.exportRowActive, { borderBottomWidth: 0 }]}
                onPress={handleImage}
                disabled={!!exporting}
                activeOpacity={0.75}
              >
                <View style={[rm.exportIconWrap, { backgroundColor: '#ECFDF5' }]}>
                  {exporting === 'image'
                    ? <ActivityIndicator size="small" color="#10B981" />
                    : <Ionicons name="image-outline" size={22} color="#10B981" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rm.exportLabel}>Download Image</Text>
                  <Text style={rm.exportSub}>Compact card receipt · Saved instantly to device</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.light} />
              </TouchableOpacity>

              <TouchableOpacity style={rm.sheetCancelBtn} onPress={() => setShowExport(false)}>
                <Text style={rm.sheetCancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

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

  /* Export button & icon */
  printIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  printBtn:     { marginHorizontal: 16, marginTop: 12, marginBottom: 8, borderRadius: 16, overflow: 'hidden', shadowColor: '#0C0A2E', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  printBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20 },
  printBtnTxt:  { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1, textAlign: 'center' },

  /* Export sheet */
  sheetOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36 },
  sheetHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetTitle:      { fontSize: 17, fontWeight: '800', color: C.text, paddingHorizontal: 20, marginBottom: 3 },
  sheetSub:        { fontSize: 12, color: C.muted, paddingHorizontal: 20, marginBottom: 16 },
  exportRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  exportRowActive: { backgroundColor: '#F8F8FF' },
  exportIconWrap:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  exportLabel:     { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 3 },
  exportSub:       { fontSize: 11, color: C.muted },
  sheetCancelBtn:  { marginHorizontal: 20, marginTop: 14, backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sheetCancelTxt:  { fontSize: 15, fontWeight: '700', color: C.muted },
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
