// CREATED: 2026-03-19
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { Role, CreateRoleInput, UpdateRoleInput, StaffRoleRow } from '@/types';

// Map a Supabase DB row (snake_case) to a Role object (camelCase)
function rowToRole(row: Record<string, unknown>): Role {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    color: row.color as string,
    locked: row.locked as boolean,
    permissions: (row.permissions as string[]) ?? [],
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// Map camelCase input to snake_case DB columns for INSERT
function roleInputToRow(input: CreateRoleInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? '',
    color: input.color,
    locked: input.locked ?? false,
    permissions: input.permissions ?? [],
  };
}

// Map camelCase partial update to snake_case DB columns
function updateInputToRow(input: UpdateRoleInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.description !== undefined) row.description = input.description;
  if (input.color !== undefined) row.color = input.color;
  if (input.permissions !== undefined) row.permissions = input.permissions;
  if (input.deleted_at !== undefined) row.deleted_at = input.deleted_at;
  return row;
}

export const roleService = {
  /** Fetch all non-deleted roles for a firm. System roles first, then by creation date. */
  async list(firmId: string): Promise<Role[]> {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('locked', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToRole);
  },

  /** Fetch a single role by ID. firm_id filter provides defense-in-depth beyond RLS. */
  async getById(firmId: string, id: string): Promise<Role> {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Role not found');
    return rowToRole(data as Record<string, unknown>);
  },

  /** Create a new custom role. */
  async create(firmId: string, input: CreateRoleInput): Promise<Role> {
    const row = roleInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('roles')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToRole(data as Record<string, unknown>);
  },

  /** Update a role. Rejects locked roles at application level. */
  async update(firmId: string, id: string, input: UpdateRoleInput): Promise<Role> {
    // Application-level locked check (defense-in-depth — DB trigger also prevents this)
    const existing = await roleService.getById(firmId, id);
    if (existing.locked) throw new Error('Cannot modify a locked system role');

    const row = updateInputToRow(input);

    const { data, error } = await supabase
      .from('roles')
      .update(row)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToRole(data as Record<string, unknown>);
  },

  /** Soft delete a role. Rejects locked roles at application level. */
  async delete(firmId: string, id: string): Promise<void> {
    const existing = await roleService.getById(firmId, id);
    if (existing.locked) throw new Error('Cannot delete a locked system role');

    const { error } = await supabase
      .from('roles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },

  /** Fetch staff_roles joined with role and staff data. */
  async getStaffRoles(firmId: string): Promise<StaffRoleRow[]> {
    const { data, error } = await supabase
      .from('staff_roles')
      .select(`
        id,
        staff_id,
        role_id,
        roles!inner (name, color, firm_id),
        staff!inner (firm_id)
      `)
      .eq('roles.firm_id', firmId)
      .eq('staff.firm_id', firmId);

    if (error) throw new Error(error.message);

    return (data as Record<string, unknown>[]).map((row) => {
      const role = row.roles as Record<string, unknown>;
      return {
        id: row.id as string,
        staffId: row.staff_id as string,
        roleId: row.role_id as string,
        roleName: role.name as string,
        roleColor: role.color as string,
      };
    });
  },

  /** Upsert a staff-role assignment (each staff has at most one role). */
  async assignRole(staffId: string, roleId: string): Promise<void> {
    const { error } = await supabase
      .from('staff_roles')
      .upsert(
        { staff_id: staffId, role_id: roleId },
        { onConflict: 'staff_id' }
      );

    if (error) throw new Error(error.message);
  },

  /** Remove a staff member's role assignment. */
  async removeRole(staffId: string): Promise<void> {
    const { error } = await supabase
      .from('staff_roles')
      .delete()
      .eq('staff_id', staffId);

    if (error) throw new Error(error.message);
  },

  /** Get permissions for the current user via RPC (uses auth.uid() internally). */
  async getPermissionsForUser(firmId: string): Promise<string[]> {
    const { data, error } = await supabase
      .rpc('get_user_permissions', { p_firm_id: firmId });

    if (error) throw new Error(error.message);
    return (data as string[]) ?? [];
  },
};
