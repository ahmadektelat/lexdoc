// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { ClientStaffAssignment } from '@/types';

function rowToAssignment(row: Record<string, unknown>): ClientStaffAssignment {
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    staff_id: row.staff_id as string,
    is_primary: row.is_primary as boolean,
    created_at: row.created_at as string,
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

  /** Set a staff member as primary for a client (unsets others). */
  async setPrimary(clientId: string, staffId: string): Promise<void> {
    // Unset all existing primaries for this client
    const { error: unsetError } = await supabase
      .from('client_staff')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true);

    if (unsetError) throw new Error(unsetError.message);

    // Set the new primary
    const { error: setError } = await supabase
      .from('client_staff')
      .update({ is_primary: true })
      .eq('client_id', clientId)
      .eq('staff_id', staffId);

    if (setError) throw new Error(setError.message);
  },
};
