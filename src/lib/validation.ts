// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Separate validateTaxId and validateCompanyId (amendment 2)
//          - Added clarifying comment on sanitizeSearchInput (security audit)

/**
 * Validate an Israeli personal ID number (מספר זהות).
 * 9-digit number with Luhn-like check digit algorithm.
 * Accepts shorter numbers (left-padded with zeros).
 */
export function validateTaxId(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  if (cleaned.length > 9 || cleaned.length === 0) return false;
  const padded = cleaned.padStart(9, '0');

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(padded[i], 10);
    if (i % 2 !== 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Validate an Israeli company registration number (ח.פ. / ע.ר.).
 * Accepts 8-9 digit numbers. Does NOT apply check-digit algorithm
 * (company numbers use a different validation scheme).
 */
export function validateCompanyId(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  return cleaned.length >= 8 && cleaned.length <= 9;
}

/**
 * Validate an Israeli phone number.
 * Accepts formats: 05X-XXXXXXX, 05XXXXXXXX, +972-5X-XXXXXXX, etc.
 * Must be a mobile number (05X prefix) or landline (02/03/04/08/09 prefix).
 */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  // Israeli mobile: 05X followed by 7 digits
  // Israeli landline: 0[2-9] followed by 7 digits
  // International: +972 followed by 9 digits (without leading 0)
  const israeliPattern = /^0[2-9]\d{7,8}$/;
  const internationalPattern = /^\+972[2-9]\d{7,8}$/;
  return israeliPattern.test(cleaned) || internationalPattern.test(cleaned);
}

/** Validate email format. */
export function validateEmail(email: string): boolean {
  // Simple but effective email regex — not trying to be RFC 5322 compliant
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Sanitize user search input for safe use in PostgreSQL ILIKE queries.
 * Escapes special characters (%, _, \) that have meaning in ILIKE patterns.
 * NOTE: This is scoped to ILIKE query safety only. It does NOT protect against
 * full SQL injection — use parameterized queries for that.
 */
export function sanitizeSearchInput(search: string): string {
  return search
    .replace(/[\\%_]/g, (char) => `\\${char}`)
    .trim();
}
