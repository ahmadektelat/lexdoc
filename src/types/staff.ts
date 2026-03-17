// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Excluded firm_id from CreateStaffInput (security audit)

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
