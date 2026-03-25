// CREATED: 2026-03-26
// UPDATED: 2026-03-26 10:00 IST (Jerusalem)
//          - Initial implementation — Noto Sans Hebrew font placeholder
//
// This module provides the Hebrew font data for PDF generation.
// To use a real embedded font, replace NOTO_SANS_HEBREW_REGULAR with the
// base64-encoded TTF data of Noto Sans Hebrew Regular.
// The current value is an empty string, which signals pdf.ts to skip
// custom font registration and fall back to jsPDF's default font.
// Hebrew characters may not render correctly without a proper Hebrew font.

/**
 * Base64-encoded TTF data for Noto Sans Hebrew Regular.
 * Replace this empty string with real font data for proper Hebrew rendering.
 * To generate: download NotoSansHebrew-Regular.ttf from Google Fonts,
 * then run: `btoa(String.fromCharCode(...new Uint8Array(buffer)))`.
 */
export const NOTO_SANS_HEBREW_REGULAR = '';
