// CREATED: 2026-03-18
// UPDATED: 2026-03-18 21:00 IST (Jerusalem)
//          - Use atomic set_primary_staff RPC
//          - Map DB snake_case to camelCase ClientStaffAssignment

import { supabase } from '@/integrations/supabase/client';
import type { ClientStaffAssignment } from '@/types';

function rowToAssignment(row: Record<string, unknown>): ClientStaffAssignment {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    staffId: row.staff_id as string,
    isPrimary: row.is_primary as boolean,
    createdAt: row.created_at as string,
  };
}

export const clientStaffService = {
  /** Get all staff assignments for a client. */
  async getAssignments(clientId: string): Promise<ClientStaffAssignment[]> {
    const { data, error } = await supabase
      .from('client_staff')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToAssignment);
  },

  /** Get all client assignments for a staff member. */
  async getStaffClients(staffId: string): Promise<ClientStaffAssignment[]> {
    const { data, error } = await supabase
      .from('client_staff')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToAssignment);
  },

  /** Assign a staff member to a client. */
  async assignStaff(clientId: string, staffId: string, isPrimary = false): Promise<void> {
    const { error } = await supabase
      .from('client_staff')
      .insert({ client_id: clientId, staff_id: staffId, is_primary: isPrimary });

    if (error) throw new Error(error.message);
  },

  /** Remove a staff assignment from a client. */
  async removeAssignment(clientId: string, staffId: string): Promise<void> {
    const { error } = await supabase
      .from('client_staff')
      .delete()
      .eq('client_id', clientId)
      .eq('staff_id', staffId);

    if (error) throw new Error(error.message);
  },

  /** Set a staff member as primary for a client (atomic via RPC). */
  async setPrimary(clientId: string, staffId: string): Promise<void> {
    const { error } = await supabase.rpc('set_primary_staff', {
      p_client_id: clientId,
      p_staff_id: staffId,
    });
    if (error) throw error;
  },
};
