// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Used Hebrew transliteration codes per amendment 1
//          - Excluded firm_id from CreateFilingInput (security audit)

export type FilingType = 'maam' | 'mekadmot' | 'nikuyim' | 'nii';

export type FilingStatus = 'pending' | 'filed' | 'late';

export interface Filing {
  id: string;
  firm_id: string;
  client_id: string;
  type: FilingType;
  period: string;         // e.g., "2026-01" or "2026-01/2026-02" for bimonthly
  due: string;            // ISO date — filing deadline
  status: FilingStatus;
  filedDate?: string;     // ISO date — when actually filed
  note?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FilingSetting {
  clientId: string;
  vatFreq: 'monthly' | 'bimonthly';
  taxAdvEnabled: boolean;
  taxAdvFreq: 'monthly' | 'bimonthly';
  taxDeductEnabled: boolean;
  taxDeductFreq: 'monthly' | 'bimonthly';
  niiDeductEnabled: boolean;
  niiDeductFreq: 'monthly' | 'bimonthly';
}

export type CreateFilingInput = Omit<Filing, 'id' | 'firm_id' | 'deleted_at' | 'created_at' | 'updated_at'>;
