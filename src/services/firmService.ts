// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// firmService - CRUD operations for firms and user_firms

import { supabase } from '@/integrations/supabase/client';
import type { Firm, CreateFirmInput } from '@/types';

// Map DB snake_case row to TypeScript camelCase Firm interface
function rowToFirm(row: Record<string, unknown>): Firm {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Firm['type'],
    regNum: (row.reg_num as string) ?? '',
    phone: row.phone as string,
    email: row.email as string,
    city: (row.city as string) ?? '',
    logo: (row.logo as string) ?? undefined,
    plan: row.plan as string,
    planLabel: (row.plan_label as string) ?? '',
    expiry: row.expiry as string,
    defaultFee: (row.default_fee as number) ?? 0,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export const firmService = {
  /** Atomic registration: creates firm + user_firms(superAdmin) in one transaction via RPC. */
  async registerFirm(data: CreateFirmInput): Promise<{ firmId: string | null; error: string | null }> {
    const { data: firmId, error } = await supabase.rpc('register_firm', {
      p_name: data.name,
      p_type: data.type,
      p_reg_num: data.regNum,
      p_phone: data.phone,
      p_email: data.email,
      p_city: data.city ?? '',
      p_default_fee: data.defaultFee ?? 0,
    });

    if (error) {
      return { firmId: null, error: error.message };
    }

    return { firmId: firmId as string, error: null };
  },

  /** Get the firm and role for a given user. Returns null if user has no firm. */
  async getFirmByUserId(userId: string): Promise<{ firm: Firm; role: string } | null> {
    // Get the user_firms row
    const { data: userFirm, error: ufError } = await supabase
      .from('user_firms')
      .select('firm_id, role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (ufError || !userFirm) return null;

    // Get the firm record
    const { data: firmRow, error: firmError } = await supabase
      .from('firms')
      .select('*')
      .eq('id', userFirm.firm_id)
      .maybeSingle();

    if (firmError || !firmRow) return null;

    return {
      firm: rowToFirm(firmRow as Record<string, unknown>),
      role: userFirm.role as string,
    };
  },

  /** Get a firm by ID. */
  async getFirmById(firmId: string): Promise<Firm | null> {
    const { data: firmRow, error } = await supabase
      .from('firms')
      .select('*')
      .eq('id', firmId)
      .maybeSingle();

    if (error || !firmRow) return null;

    return rowToFirm(firmRow as Record<string, unknown>);
  },

  /** Update non-sensitive firm fields (name, phone, email, city, logo, default_fee). */
  async updateFirm(firmId: string, data: Partial<Pick<Firm, 'name' | 'phone' | 'email' | 'city' | 'logo' | 'defaultFee'>>) {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.logo !== undefined) updateData.logo = data.logo;
    if (data.defaultFee !== undefined) updateData.default_fee = data.defaultFee;

    const { error } = await supabase
      .from('firms')
      .update(updateData)
      .eq('id', firmId);

    return { error: error?.message ?? null };
  },

  /** Update firm subscription plan via RPC. Validates superAdmin server-side. */
  async updatePlan(firmId: string, plan: string, planLabel: string, expiry: string) {
    const { error } = await supabase.rpc('update_firm_plan', {
      p_firm_id: firmId,
      p_plan: plan,
      p_plan_label: planLabel,
      p_expiry: expiry,
    });

    return { error: error?.message ?? null };
  },

  /** Upload a logo to Supabase Storage. Returns the public URL. */
  async uploadLogo(firmId: string, file: File): Promise<{ url: string | null; error: string | null }> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${firmId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('firm-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from('firm-logos')
      .getPublicUrl(path);

    return { url: publicUrl, error: null };
  },
};
