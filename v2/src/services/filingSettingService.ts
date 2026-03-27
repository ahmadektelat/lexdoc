// CREATED: 2026-03-19
// UPDATED: 2026-03-19 15:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { FilingSetting } from '@/types';

function rowToFilingSetting(row: Record<string, unknown>): FilingSetting {
  return {
    clientId: row.client_id as string,
    vatFreq: row.vat_freq as FilingSetting['vatFreq'],
    taxAdvEnabled: row.tax_adv_enabled as boolean,
    taxAdvFreq: row.tax_adv_freq as FilingSetting['taxAdvFreq'],
    taxDeductEnabled: row.tax_deduct_enabled as boolean,
    taxDeductFreq: row.tax_deduct_freq as FilingSetting['taxDeductFreq'],
    niiDeductEnabled: row.nii_deduct_enabled as boolean,
    niiDeductFreq: row.nii_deduct_freq as FilingSetting['niiDeductFreq'],
  };
}

function settingToRow(setting: FilingSetting, firmId: string): Record<string, unknown> {
  return {
    firm_id: firmId,
    client_id: setting.clientId,
    vat_freq: setting.vatFreq,
    tax_adv_enabled: setting.taxAdvEnabled,
    tax_adv_freq: setting.taxAdvFreq,
    tax_deduct_enabled: setting.taxDeductEnabled,
    tax_deduct_freq: setting.taxDeductFreq,
    nii_deduct_enabled: setting.niiDeductEnabled,
    nii_deduct_freq: setting.niiDeductFreq,
  };
}

export const filingSettingService = {
  async get(firmId: string, clientId: string): Promise<FilingSetting | null> {
    const { data, error } = await supabase
      .from('filing_settings')
      .select('*')
      .eq('firm_id', firmId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToFilingSetting(data as Record<string, unknown>);
  },

  async save(firmId: string, setting: FilingSetting): Promise<FilingSetting> {
    const row = settingToRow(setting, firmId);

    const { data, error } = await supabase
      .from('filing_settings')
      .upsert(row, { onConflict: 'firm_id,client_id' })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToFilingSetting(data as Record<string, unknown>);
  },
};
