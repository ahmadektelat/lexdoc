// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import type {
  Client, Staff, Filing,
  BillingEntry, HoursEntry, Invoice,
  Contact, Interaction, Task,
  LegalDocument, DocumentFolder,
  MessageTemplate, Message, ScheduledMessage,
  AuditEntry, Role,
} from '@/types';

/** Current backup format version. */
export const BACKUP_VERSION = '1.0.0';

/** Full firm backup envelope. */
export interface BackupData {
  version: string;
  createdAt: string;        // ISO datetime
  firmId: string;
  firmName: string;
  data: {
    clients: Client[];
    clientStaff: ClientStaffRow[];
    staff: Staff[];
    contacts: Contact[];
    interactions: Interaction[];
    tasks: Task[];
    filings: Filing[];
    filingSettings: FilingSettingRow[];
    invoices: Invoice[];
    billingEntries: BillingEntry[];
    hoursLog: HoursEntry[];
    documentFolders: DocumentFolder[];
    documents: LegalDocument[];
    messageTemplates: MessageTemplate[];
    messages: Message[];
    scheduledMessages: ScheduledMessage[];
    auditLog: AuditEntry[];    // read-only archive, skipped on restore
    roles: Role[];
    staffRoles: StaffRoleJunctionRow[];
  };
}

/** Raw client_staff junction row (DB shape). */
export interface ClientStaffRow {
  id: string;
  client_id: string;
  staff_id: string;
  is_primary: boolean;
  created_at: string;
}

/** Raw filing_settings row (DB shape). */
export interface FilingSettingRow {
  id: string;
  firm_id: string;
  client_id: string;
  vat_freq: string;
  tax_adv_enabled: boolean;
  tax_adv_freq: string;
  tax_deduct_enabled: boolean;
  tax_deduct_freq: string;
  nii_deduct_enabled: boolean;
  nii_deduct_freq: string;
  created_at: string;
  updated_at: string;
}

/**
 * Raw staff_roles junction row (DB shape).
 * Named StaffRoleJunctionRow to avoid collision with StaffRoleRow in src/types/role.ts
 * which has different (camelCase) fields.
 */
export interface StaffRoleJunctionRow {
  id: string;
  staff_id: string;
  role_id: string;
  created_at: string;
}

/** Result of a restore operation. */
export interface RestoreResult {
  inserted: Record<string, number>;   // table -> count inserted
  skipped: Record<string, number>;    // table -> count skipped (conflicts)
  errors: string[];                   // human-readable error descriptions
}

/** A single parsed import row (pre-validation). */
export interface ImportRow {
  name?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  city?: string;
  type?: string;          // 'company' | 'private'
  clientType?: string;    // 'self_employed' | 'company' | 'economic' | 'private'
  monthlyFee?: string;    // raw string from CSV/Excel -- parsed to number later
  billingDay?: string;
  tags?: string;
  notes?: string;
  _rowIndex: number;      // 1-based row number from source file
}

/** Validation result for a single import row. */
export interface ImportRowResult {
  row: ImportRow;
  valid: boolean;
  errors: string[];       // e.g. ['missingName', 'invalidEmail']
  isDuplicate: boolean;
}

/** Result of a client import operation. */
export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

export interface ImportRowError {
  rowIndex: number;
  name: string;
  reason: string;
}

/** Exportable client field definition. */
export interface ExportField {
  key: string;            // Client property name (camelCase)
  labelKey: string;       // i18n key for display
  defaultSelected: boolean;
}

/** Storage statistics for StorageInfo display. */
export interface BackupStats {
  clientCount: number;
  activeClientCount: number;
  staffCount: number;
  hoursCount: number;
  invoiceCount: number;
  documentCount: number;
}
