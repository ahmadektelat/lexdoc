// CREATED: 2026-03-24
// UPDATED: 2026-03-24 23:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type { CreateClientInput } from '@/types';
import type { ImportRow, ImportRowResult, ImportResult } from '@/types/backup';
import { validateEmail, validatePhone, validateTaxId } from '@/lib/validation';
import { DEFAULT_FOLDERS } from '@/lib/constants';

/** Hebrew-to-English header mapping for import files. */
const HEADER_MAP: Record<string, keyof ImportRow> = {
  // Hebrew headers
  'שם': 'name',
  'שם לקוח': 'name',
  'שם חברה': 'name',
  'מספר עוסק': 'taxId',
  'ח.פ.': 'taxId',
  'ח"פ': 'taxId',
  'מספר זהות': 'taxId',
  'דואר אלקטרוני': 'email',
  'מייל': 'email',
  'טלפון': 'phone',
  'נייד': 'mobile',
  'כתובת': 'address',
  'עיר': 'city',
  'סוג': 'type',
  'סוג ישות': 'type',
  'סיווג מס': 'clientType',
  'שכ"ט': 'monthlyFee',
  'שכר טרחה': 'monthlyFee',
  'שכ"ט חודשי': 'monthlyFee',
  'יום חיוב': 'billingDay',
  'תגיות': 'tags',
  'הערות': 'notes',
  // English headers (case-insensitive match applied later)
  'name': 'name',
  'company': 'name',
  'tax_id': 'taxId',
  'taxid': 'taxId',
  'tax id': 'taxId',
  'email': 'email',
  'phone': 'phone',
  'mobile': 'mobile',
  'address': 'address',
  'city': 'city',
  'type': 'type',
  'client_type': 'clientType',
  'clienttype': 'clientType',
  'monthly_fee': 'monthlyFee',
  'monthlyfee': 'monthlyFee',
  'fee': 'monthlyFee',
  'billing_day': 'billingDay',
  'billingday': 'billingDay',
  'tags': 'tags',
  'notes': 'notes',
};

/** Parse CSV text into ImportRow[]. Handles BOM and quoted fields. */
function parseCsvText(text: string): ImportRow[] {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = splitCsvLine(headerLine);
  const headerMap = importService.mapHeaders(headers);

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.every((v) => !v.trim())) continue;

    const row: ImportRow = { _rowIndex: i + 1 };
    for (const [colIdx, field] of headerMap.entries()) {
      if (field !== '_rowIndex' && colIdx < values.length) {
        (row as unknown as Record<string, unknown>)[field] = values[colIdx].trim();
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Split a CSV line respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Convert raw rows (array of arrays) from Excel to ImportRow[]. */
function rowsToImportRows(rows: string[][]): ImportRow[] {
  const headers = rows[0].map(String);
  const headerMap = importService.mapHeaders(headers);

  const result: ImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (!values || values.every((v) => !String(v ?? '').trim())) continue;

    const row: ImportRow = { _rowIndex: i + 1 };
    for (const [colIdx, field] of headerMap.entries()) {
      if (field !== '_rowIndex' && colIdx < values.length) {
        (row as unknown as Record<string, unknown>)[field] = String(values[colIdx] ?? '').trim();
      }
    }
    result.push(row);
  }
  return result;
}

/** Resolve type field to 'company' | 'private'. Default: 'private'. */
function resolveType(raw?: string): 'company' | 'private' {
  if (!raw) return 'private';
  const lower = raw.trim().toLowerCase();
  if (lower === 'company' || lower === 'חברה') return 'company';
  return 'private';
}

/** Resolve clientType field. Default: 'self_employed'. */
function resolveClientType(raw?: string): 'self_employed' | 'company' | 'economic' | 'private' {
  if (!raw) return 'self_employed';
  const lower = raw.trim().toLowerCase();
  const map: Record<string, 'self_employed' | 'company' | 'economic' | 'private'> = {
    'self_employed': 'self_employed',
    'עוסק מורשה': 'self_employed',
    'company': 'company',
    'חברה': 'company',
    'economic': 'economic',
    'עוסק פטור': 'economic',
    'private': 'private',
    'פרטי': 'private',
  };
  return map[lower] ?? 'self_employed';
}

/** Generate a CSV template with example rows. */
export function generateImportTemplate(): string {
  const headers = ['שם לקוח', 'מספר עוסק', 'דואר אלקטרוני', 'טלפון', 'נייד', 'כתובת', 'עיר', 'סוג ישות', 'סיווג מס', 'שכ"ט חודשי', 'יום חיוב', 'תגיות', 'הערות'];
  const example = ['ישראלי בע"מ', '123456789', 'info@example.com', '02-1234567', '050-1234567', 'הרצל 1', 'תל אביב', 'חברה', 'company', '1500', '1', 'חדש,VIP', 'לקוח חדש'];
  return '\uFEFF' + headers.join(',') + '\n' + example.join(',') + '\n';
}

export const importService = {
  /**
   * Map raw file headers to ImportRow keys using HEADER_MAP.
   * Returns a map of columnIndex -> ImportRow key.
   */
  mapHeaders(headers: string[]): Map<number, keyof ImportRow> {
    const result = new Map<number, keyof ImportRow>();
    for (let i = 0; i < headers.length; i++) {
      const raw = headers[i].trim();
      const normalized = raw.toLowerCase().replace(/[\s_\-]+/g, '');
      // Try exact match first (Hebrew)
      if (HEADER_MAP[raw]) {
        result.set(i, HEADER_MAP[raw]);
        continue;
      }
      // Try normalized match (English case-insensitive)
      for (const [key, value] of Object.entries(HEADER_MAP)) {
        if (key.toLowerCase().replace(/[\s_\-]+/g, '') === normalized) {
          result.set(i, value);
          break;
        }
      }
    }
    return result;
  },

  /**
   * Parse a CSV file into ImportRow[].
   */
  async parseCSV(file: File): Promise<ImportRow[]> {
    const text = await file.text();
    return parseCsvText(text);
  },

  /**
   * Parse an Excel (XLSX/XLS) file into ImportRow[].
   * Lazy-loads the xlsx library.
   */
  async parseExcel(file: File): Promise<ImportRow[]> {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length < 2) return [];
    return rowsToImportRows(rows);
  },

  /**
   * Parse a JSON file into ImportRow[].
   */
  async parseJSON(file: File): Promise<ImportRow[]> {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.clients ?? parsed.data ?? [];
    if (!Array.isArray(arr)) throw new Error('Invalid JSON format');

    const rows: ImportRow[] = [];
    for (let i = 0; i < arr.length; i++) {
      const obj = arr[i];
      if (typeof obj !== 'object' || obj === null) continue;
      const row: ImportRow = { _rowIndex: i + 1 };
      for (const [key, val] of Object.entries(obj)) {
        const mapped = HEADER_MAP[key] ?? HEADER_MAP[key.toLowerCase()];
        if (mapped && mapped !== '_rowIndex') {
          (row as unknown as Record<string, unknown>)[mapped] = String(val ?? '');
        }
      }
      rows.push(row);
    }
    return rows;
  },

  /**
   * Validate parsed rows against existing clients (duplicate detection by name).
   */
  validateRows(rows: ImportRow[], existingNames: Set<string>): ImportRowResult[] {
    return rows.map((row) => {
      const errors: string[] = [];
      const name = row.name?.trim();

      if (!name) errors.push('missingName');
      if (row.email && !validateEmail(row.email)) errors.push('invalidEmail');
      if (row.phone && !validatePhone(row.phone)) errors.push('invalidPhone');
      if (row.mobile && !validatePhone(row.mobile)) errors.push('invalidPhone');
      if (row.taxId && !validateTaxId(row.taxId)) errors.push('invalidTaxId');
      if (row.monthlyFee && isNaN(Number(row.monthlyFee))) errors.push('invalidFee');

      const isDuplicate = !!name && existingNames.has(name.toLowerCase());

      return {
        row,
        valid: errors.length === 0 && !isDuplicate,
        errors,
        isDuplicate,
      };
    });
  },

  /**
   * Import validated client rows into the database.
   */
  async importClients(
    firmId: string,
    validRows: ImportRow[]
  ): Promise<ImportResult> {
    const results: ImportResult = { total: validRows.length, imported: 0, skipped: 0, errors: [] };

    for (const row of validRows) {
      try {
        const input: CreateClientInput = {
          name: row.name!.trim(),
          type: resolveType(row.type),
          clientType: resolveClientType(row.clientType),
          taxId: row.taxId?.trim() || undefined,
          email: row.email?.trim() || undefined,
          mobile: row.mobile?.trim() || row.phone?.trim() || undefined,
          address: row.address?.trim() || undefined,
          city: row.city?.trim() || undefined,
          tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
          monthlyFee: row.monthlyFee ? Math.round(Number(row.monthlyFee) * 100) : 0,
          billingDay: row.billingDay ? Number(row.billingDay) : undefined,
          notes: row.notes?.trim() || undefined,
        };

        const { data, error } = await supabase
          .from('clients')
          .insert({
            firm_id: firmId,
            name: input.name,
            status: 'active',
            type: input.type,
            client_type: input.clientType,
            tax_id: input.taxId ?? null,
            mobile: input.mobile ?? null,
            email: input.email ?? null,
            address: input.address ?? null,
            city: input.city ?? null,
            tags: input.tags,
            monthly_fee: input.monthlyFee,
            billing_day: input.billingDay ?? null,
            notes: input.notes ?? null,
            case_num: '',   // trigger overwrites
          })
          .select('id')
          .single();

        if (error) {
          results.errors.push({ rowIndex: row._rowIndex, name: row.name ?? '', reason: error.message });
          results.skipped++;
        } else {
          // Create default folders for the new client
          try {
            const folderRows = DEFAULT_FOLDERS.map((name) => ({
              firm_id: firmId,
              client_id: data.id,
              name,
            }));
            await supabase
              .from('document_folders')
              .upsert(folderRows, { onConflict: 'firm_id,client_id,name', ignoreDuplicates: true });
          } catch {
            // Folder creation is best-effort
          }
          results.imported++;
        }
      } catch (err) {
        results.errors.push({
          rowIndex: row._rowIndex,
          name: row.name ?? '',
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
        results.skipped++;
      }
    }

    return results;
  },
};
