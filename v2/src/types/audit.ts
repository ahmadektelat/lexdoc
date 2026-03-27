// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Added details field for forensic audit trail (security audit)

export interface AuditEntry {
  id: string;
  firm_id: string;
  userId: string;
  userName: string;
  action: string;
  target?: string;
  timestamp: string;      // ISO datetime
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}
