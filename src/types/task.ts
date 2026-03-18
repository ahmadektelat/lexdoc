// CREATED: 2026-03-17
// UPDATED: 2026-03-19 13:00 IST (Jerusalem)
//          - Refined CreateTaskInput: exclude server-controlled fields, make auto-task fields optional

import type { FilingType } from './filing';

export type TaskStatus = 'open' | 'done' | 'cancelled';

export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskCategory = 'client' | 'taxAuth' | 'nii' | 'internal';

export interface Task {
  id: string;
  firm_id: string;
  client_id?: string;
  filing_id?: string;
  seq: number;
  title: string;
  desc?: string;
  dueDate?: string;       // ISO date
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string;    // staff ID
  category: TaskCategory;
  isAuto: boolean;
  filingType?: FilingType;
  filingDue?: string;     // ISO date — the filing's due date (for auto-tasks)
  period?: string;        // filing period (for auto-tasks)
  doneAt?: string;        // ISO datetime
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type CreateTaskInput = Omit<Task, 'id' | 'firm_id' | 'seq' | 'status' | 'doneAt' | 'isAuto' | 'filingType' | 'filingDue' | 'period' | 'deleted_at' | 'created_at' | 'updated_at'> & {
  isAuto?: boolean;
  filingType?: FilingType;
  filingDue?: string;
  period?: string;
};
