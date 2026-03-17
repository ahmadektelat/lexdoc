// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Excluded firm_id from Create*Input types (security audit)

export type ContactType = 'client' | 'taxAuth' | 'nii' | 'other';

export type InteractionChannel = 'call' | 'email' | 'meeting' | 'letter' | 'portal';

export interface Contact {
  id: string;
  firm_id: string;
  client_id?: string;
  type: ContactType;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  firm_id: string;
  client_id?: string;
  contact_id: string;
  date: string;           // ISO date
  channel: InteractionChannel;
  subject: string;
  notes?: string;
  authorityType?: string;
  staffId?: string;
  outcome?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateContactInput = Omit<Contact, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type CreateInteractionInput = Omit<Interaction, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;
