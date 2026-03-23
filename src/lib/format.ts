// CREATED: 2026-03-23
// UPDATED: 2026-03-23 14:00 IST (Jerusalem)
//          - Initial implementation: formatFileSize, sanitizePath

/**
 * Format byte count to human-readable string (B, KB, MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sanitize a string for use in a Supabase Storage path segment.
 * Strips path traversal characters (/, \, ..), control characters,
 * and other dangerous chars while preserving Hebrew/Arabic/English text.
 */
export function sanitizePath(segment: string): string {
  return segment
    .replace(/\.\./g, '')        // strip path traversal
    .replace(/[/\\]/g, '')       // strip directory separators
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control characters
    .replace(/[<>:"|?*]/g, '')   // strip Windows-reserved chars
    .trim();
}
