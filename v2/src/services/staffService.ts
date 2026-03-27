// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Staff, CreateStaffInput, UpdateStaffInput } from '@/types';

// Map a Supabase DB row (snake_case) to a Staff object (camelCase)
function rowToStaff(row: Record<string, unknown>): Staff {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    user_id: (row.user_id as string) ?? undefined,
    name: row.name as string,
    role: row.role as Staff['role'],
    isActive: row.is_active as boolean,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// Map camelCase input to snake_case DB columns for INSERT
function staffInputToRow(input: CreateStaffInput): Record<string, unknown> {
  return {
    name: input.name,
    role: input.role,
    is_active: input.isActive ?? true,
    user_id: input.user_id ?? null,
  };
}

// Map camelCase partial update to snake_case DB columns
function updateInputToRow(input: UpdateStaffInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.role !== undefined) row.role = input.role;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  if (input.user_id !== undefined) row.user_id = input.user_id;
  if (input.deleted_at !== undefined) row.deleted_at = input.deleted_at;
  return row;
}

export const staffService = {
  /** Fetch all non-deleted staff for a firm. */
  async list(firmId: string): Promise<Staff[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToStaff);
  },

  /** Fetch a single staff member by ID. firm_id filter provides defense-in-depth beyond RLS. */
  async getById(firmId: string, id: string): Promise<Staff> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Staff member not found');
    return rowToStaff(data as Record<string, unknown>);
  },

  /** Create a new staff member. firm_id is set server-side. */
  async create(firmId: string, input: CreateStaffInput): Promise<Staff> {
    const row = staffInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('staff')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToStaff(data as Record<string, unknown>);
  },

  /** Update an existing staff member. firm_id filter provides defense-in-depth beyond RLS. */
  async update(firmId: string, id: string, input: UpdateStaffInput): Promise<Staff> {
    const row = updateInputToRow(input);

    const { data, error } = await supabase
      .from('staff')
      .update(row)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToStaff(data as Record<string, unknown>);
  },

  /** Soft delete a staff member (set deleted_at). firm_id filter provides defense-in-depth beyond RLS. */
  async delete(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('staff')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },
};
