// CREATED: 2026-03-26
// UPDATED: 2026-03-26 10:00 IST (Jerusalem)
//          - Initial implementation — shared PDF utility for invoice and document generation
//          - Uses fetch() + FileReader for logo-to-base64 (per security review)
//          - Validates logo URL domain before fetching (per security review)

import jsPDF from 'jspdf';
import { NOTO_SANS_HEBREW_REGULAR } from './pdf-font';
import type { Firm } from '@/types';

const PAGE_WIDTH = 210; // A4 mm
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// Expected Supabase storage domain prefix for logo URL validation
const SUPABASE_STORAGE_DOMAIN = 'huexcyhjmbpsvopaoxms.supabase.co';

let fontRegistered = false;

/**
 * Creates a pre-configured jsPDF instance with A4 portrait,
 * Hebrew font (if available), and RTL-friendly defaults.
 */
export function createPdfDoc(): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Register Hebrew font if available and not yet registered
  if (NOTO_SANS_HEBREW_REGULAR && !fontRegistered) {
    try {
      doc.addFileToVFS('NotoSansHebrew-Regular.ttf', NOTO_SANS_HEBREW_REGULAR);
      doc.addFont('NotoSansHebrew-Regular.ttf', 'NotoSansHebrew', 'normal');
      fontRegistered = true;
    } catch {
      // Font registration failed — fall back to default
    }
  }

  if (fontRegistered) {
    doc.setFont('NotoSansHebrew', 'normal');
  }

  doc.setFontSize(10);
  return doc;
}

/**
 * Renders firm letterhead (logo + name + contact details) at the top of a page.
 * Returns the Y position after the letterhead for continued content.
 */
export function renderLetterhead(
  doc: jsPDF,
  firm: Firm | null | undefined,
  logoBase64: string | null,
): number {
  let y = MARGIN;

  if (!firm) return y + 5;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', PAGE_WIDTH - MARGIN - 30, y, 28, 28);
    } catch {
      // Image rendering failed — skip logo
    }
  }

  // Firm name — RTL aligned to right
  doc.setFontSize(16);
  doc.text(firm.name, PAGE_WIDTH - MARGIN - (logoBase64 ? 35 : 0), y + 8, { align: 'right' });

  // Contact details
  doc.setFontSize(9);
  const details: string[] = [];
  if (firm.regNum) details.push(firm.regNum);
  if (firm.phone) details.push(firm.phone);
  if (firm.email) details.push(firm.email);
  if (firm.city) details.push(firm.city);

  const detailsX = PAGE_WIDTH - MARGIN - (logoBase64 ? 35 : 0);
  details.forEach((line, i) => {
    doc.text(line, detailsX, y + 14 + i * 4, { align: 'right' });
  });

  y += Math.max(32, 14 + details.length * 4 + 4);

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 5;

  doc.setFontSize(10);
  return y;
}

/**
 * Fetches an image URL and returns a base64 data URI, or null on failure.
 * Uses fetch() + FileReader approach (per review requirement).
 * Validates that the URL is from the expected Supabase Storage domain.
 */
export async function fetchImageAsBase64(url: string | undefined): Promise<string | null> {
  if (!url) return null;

  // Validate URL domain before fetching (security requirement)
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(SUPABASE_STORAGE_DOMAIN)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();

    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export { PAGE_WIDTH, MARGIN, CONTENT_WIDTH };
