// CREATED: 2026-03-17
// UPDATED: 2026-03-18 21:00 IST (Jerusalem)
//          - ClientStaffAssignment interface uses camelCase properties

export type StaffRole = 'partner' | 'attorney' | 'junior_attorney' | 'accountant' | 'consultant' | 'secretary' | 'manager' | 'student';

export interface Staff {
  id: string;
  firm_id: string;
  user_id?: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateStaffInput = Omit<Staff, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;

export type UpdateStaffInput = Partial<Omit<Staff, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;

export interface ClientStaffAssignment {
  id: string;
  clientId: string;
  staffId: string;
  isPrimary: boolean;
  createdAt: string;
}
