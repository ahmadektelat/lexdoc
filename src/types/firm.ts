// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Added deleted_at for soft-delete consistency (amendment 5)

export type FirmType = 'lawyer' | 'cpa' | 'combined' | 'notary';

export interface Firm {
  id: string;
  name: string;
  type: FirmType;
  regNum: string;
  phone: string;
  email: string;
  city: string;
  logo?: string;
  plan: string;
  planLabel: string;
  expiry: string;
  defaultFee?: number; // agorot
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: 'monthly' | 'yearly' | 'two';
  label: string;
  price: number; // agorot
  months: number;
}
