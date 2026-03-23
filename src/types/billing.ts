// CREATED: 2026-03-17
// UPDATED: 2026-03-23 10:00 IST (Jerusalem)
//          - Added status field to BillingEntry
//          - Updated CreateBillingInput to exclude status
//          - Added CreateHoursInput type

export interface BillingEntry {
  id: string;
  firm_id: string;
  client_id: string;
  type: 'charge' | 'credit';
  amount: number;         // agorot
  status: 'pending' | 'paid' | 'cancelled';
  date: string;           // ISO date
  notes?: string;
  invoice_id?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface HoursEntry {
  id: string;
  firm_id: string;
  client_id: string;
  staffId: string;
  staffName: string;
  hours: number;
  date: string;           // ISO date
  note?: string;
  deleted_at?: string;
  created_at: string;
}

export interface InvoiceItem {
  desc: string;
  qty: number;
  unit: number;           // agorot — unit price
  total: number;          // agorot — qty * unit
  note?: string;
}

export interface Invoice {
  id: string;
  firm_id: string;
  client_id: string;
  invoiceNum: string;
  date: string;           // ISO date
  items: InvoiceItem[];
  subtotal: number;       // agorot
  vatAmount: number;      // agorot
  total: number;          // agorot
  sent: boolean;
  paid: boolean;
  paidDate?: string;      // ISO date
  updated_at: string;
  deleted_at?: string;
  created_at: string;
}

export type CreateBillingInput = Omit<BillingEntry, 'id' | 'firm_id' | 'status' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type CreateInvoiceInput = Omit<Invoice, 'id' | 'firm_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sent' | 'paid' | 'paidDate'>;

export type CreateHoursInput = Omit<HoursEntry, 'id' | 'firm_id' | 'deleted_at' | 'created_at'>;
