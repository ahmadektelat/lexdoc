// CREATED: 2026-03-17
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Updated CreateClientInput to omit caseNum and status (DB-generated / service-controlled)
//          - Updated UpdateClientInput to omit caseNum and deleted_at

export type ClientType = 'self_employed' | 'company' | 'economic' | 'private';

export interface Client {
  id: string;
  firm_id: string;
  name: string;
  caseNum: string;
  status: 'active' | 'archived';
  type: 'company' | 'private';       // high-level UI grouping
  clientType: ClientType;             // specific Israeli tax registration type
  taxId?: string;
  mobile?: string;
  email?: string;
  address?: string;
  city?: string;
  tags: string[];
  monthlyFee?: number;               // agorot
  billingDay?: number;
  assignedStaffId?: string;
  notes?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateClientInput = Omit<Client, 'id' | 'firm_id' | 'caseNum' | 'status' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type UpdateClientInput = Partial<Omit<Client, 'id' | 'firm_id' | 'caseNum' | 'deleted_at' | 'created_at' | 'updated_at'>>;
