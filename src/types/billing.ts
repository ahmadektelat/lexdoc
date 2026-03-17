// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Added deleted_at to HoursEntry (amendment 5)
//          - Added updated_at and deleted_at to Invoice (amendment 5)
//          - Tightened CreateInvoiceInput (amendment 5)
//          - Excluded firm_id from Create*Input types (security audit)

export interface BillingEntry {
  id: string;
  firm_id: string;
  client_id: string;
  type: 'charge' | 'credit';
  amount: number;         // agorot
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

export type CreateBillingInput = Omit<BillingEntry, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type CreateInvoiceInput = Omit<Invoice, 'id' | 'firm_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sent' | 'paid' | 'paidDate'>;
