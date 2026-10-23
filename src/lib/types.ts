export type Material = {
  id: string;
  name_am: string;
  name_en: string;
  subtype: string | null;
  unit: string;
  unit_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: number;
  created_at: string;
};

export type PaymentMethod = 'telebirr' | 'cbe_bank' | 'credit';

export const CBE_ACCOUNT_NUMBER = '1000474209637';

export const TELEBIRR_PHONE = '0942836279';

/** Digits only, so "1000 4742-09637" compares equal to "1000474209637". */
export function normalizeAccount(v: string): string {
  return v.replace(/\D/g, '');
}

export function isValidCbeAccount(v: string): boolean {
  return normalizeAccount(v) === CBE_ACCOUNT_NUMBER;
}

export const CBE_VALIDATION_ERROR =
  'ተሳስተዋል! ክፍያው የተፈጸመው ወደ ትክክለኛው የድርጅታችን የባንክ ሂሳብ ቁጥር (1000474209637) አይደለም። እባክዎን ትክክለኛውን ደረሰኝ/መረጃ ያስገቡ።';

export type SaleStatus = 'pending_verification' | 'approved' | 'rejected' | 'exited' | 'completed';

export const SALE_STATUS_LABELS: Record<SaleStatus, { en: string; am: string; tone: 'amber' | 'green' | 'red' | 'blue' | 'slate' }> = {
  pending_verification: { en: 'Pending Admin Verification', am: 'የአስተዳዳሪ ማረጋገጫ በመጠበቅ ላይ', tone: 'amber' },
  approved: { en: 'Approved / Ready for Exit', am: 'ጸድቋል / ለመውጣት ዝግጁ', tone: 'green' },
  rejected: { en: 'Rejected', am: 'ውድቅ ሆኗል', tone: 'red' },
  exited: { en: 'Exited', am: 'ወጥቷል', tone: 'blue' },
  completed: { en: 'Returned', am: 'ተመልሷል', tone: 'slate' },
};

export type VehicleStatus = 'available' | 'pending_verification' | 'approved' | 'exited';

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, { en: string; am: string; tone: 'amber' | 'green' | 'red' | 'blue' | 'slate' }> = {
  available: { en: 'Available', am: 'ዝግጁ ነው', tone: 'green' },
  pending_verification: { en: 'Pending Admin Verification', am: 'ማረጋገጫ በመጠበቅ ላይ', tone: 'amber' },
  approved: { en: 'Approved / Ready for Exit', am: 'ለመውጣት ዝግጁ', tone: 'blue' },
  exited: { en: 'Exited', am: 'ወጥቷል', tone: 'slate' },
};

export type Vehicle = {
  id: string;
  plate_number: string;
  driver_name: string;
  driver_phone: string;
  vehicle_model: string;
  status: VehicleStatus;
  created_at: string;
};

export type Sale = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string | null;
  material_id: string | null;
  material_label: string;
  quantity: number;
  unit: string;
  unit_price: number;
  transport_fee: number;
  subtotal: number;
  total: number;
  payment_method: PaymentMethod;
  amount_paid: number;
  balance_due: number;
  status: 'paid' | 'partial' | 'unpaid';
  transaction_ref: string | null;
  paid_to_account: string | null;
  customer_email: string | null;
  destination: string | null;
  customer_city: string | null;
  customer_kebele: string | null;
  customer_area: string | null;
  maps_link: string | null;
  vehicle_id: string | null;
  dispatch_status: SaleStatus;
  rejection_reason: string | null;
  approved_at: string | null;
  exited_at: string | null;
  returned_at: string | null;
  email_status: 'sending' | 'sent' | 'failed' | 'skipped' | null;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string;
};

export type SaleWithRelations = Sale & {
  vehicle: Vehicle | null;
  gate_passes: GatePass[];
};

export type AppNotification = {
  id: string;
  audience: 'admin' | 'cashier' | 'gatekeeper';
  kind: 'pending' | 'approved' | 'rejected' | 'exited' | 'returned' | 'info';
  title: string;
  title_am: string | null;
  message: string;
  sale_id: string | null;
  created_at: string;
};

export type MerchantDetail = {
  label: string;
  amLabel: string;
  accountName: string;
  accountNumber: string;
  refLabel: string;
  refAmLabel: string;
};

export const MERCHANT_DETAILS: Record<'telebirr' | 'cbe_bank', MerchantDetail> = {
  cbe_bank: {
    label: 'Commercial Bank of Ethiopia (CBE)',
    amLabel: 'ንግድ ባንክ',
    accountName: 'Garvelgo Material Supply',
    accountNumber: CBE_ACCOUNT_NUMBER,
    refLabel: 'Transaction Ref / Reference Number',
    refAmLabel: 'የክፍያ ማረጋገጫ ቁጥር',
  },
  telebirr: {
    label: 'Telebirr',
    amLabel: 'ቴሌብር',
    accountName: 'Garvelgo Material Supply',
    accountNumber: TELEBIRR_PHONE,
    refLabel: 'Telebirr Transaction ID',
    refAmLabel: 'የቴሌብር ማረጋገጫ ቁጥር',
  },
};

export const PAYMENT_METHODS_WITH_REF: PaymentMethod[] = ['telebirr', 'cbe_bank'];

export function merchantFor(method: PaymentMethod): MerchantDetail | null {
  if (method === 'telebirr' || method === 'cbe_bank') {
    return MERCHANT_DETAILS[method];
  }
  return null;
}

export type GatePass = {
  id: string;
  pass_number: string;
  sale_id: string | null;
  truck_plate: string;
  driver_name: string;
  destination: string;
  material_label: string;
  quantity: number;
  unit: string;
  order_ref: string | null;
  dispatched_at: string;
  vehicle_id?: string | null;
  driver_phone?: string | null;
  vehicle_model?: string | null;
  customer_address?: string | null;
  maps_link?: string | null;
  exited_at?: string | null;
  returned_at?: string | null;
};

export type Payment = {
  id: string;
  customer_id: string;
  sale_id: string | null;
  amount: number;
  method: 'telebirr' | 'cbe_bank';
  note: string | null;
  created_at: string;
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  telebirr: 'ቴሌ ብር (Telebirr)',
  cbe_bank: 'ባንክ (CBE Bank)',
  credit: 'በብድር (Credit)',
};

export const UNITS = ['m³', 'truck_load', 'ton'] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  'm³': 'ኪዩቢክ ሜትር (m³)',
  truck_load: 'የመኪና ጭነት (Truck Load)',
  ton: 'ቶን (Ton)',
};
