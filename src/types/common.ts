// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListOptions {
  firmId: string;
  limit?: number;
  cursor?: string;
  search?: string;
}
