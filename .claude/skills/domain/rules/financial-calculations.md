# Financial Calculations

## Core Constants

```typescript
const VAT_RATE = 0.18;        // 18% Israeli VAT
const AGOROT_PER_SHEKEL = 100; // 1 ₪ = 100 agorot
```

## Money Storage

All monetary values are stored as **integer agorot** in the database:

```typescript
// Converting user input (shekels) to storage (agorot)
function shekelToAgorot(shekels: number): number {
  return Math.round(shekels * AGOROT_PER_SHEKEL);
}

// Converting storage (agorot) to display (shekels)
function agorotToShekel(agorot: number): number {
  return agorot / AGOROT_PER_SHEKEL;
}
```

## Currency Formatting

```typescript
function formatMoney(agorot: number): string {
  const shekels = agorot / AGOROT_PER_SHEKEL;
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(shekels);
}

// Examples:
// formatMoney(10000) → "₪100.00"
// formatMoney(15050) → "₪150.50"
```

## Invoice Generation

```typescript
interface InvoiceCalculation {
  amount: number;       // in agorot (before VAT)
  vatAmount: number;    // in agorot
  total: number;        // in agorot (amount + vatAmount)
}

function calculateInvoice(amountAgorot: number): InvoiceCalculation {
  const vatAmount = Math.round(amountAgorot * VAT_RATE);
  return {
    amount: amountAgorot,
    vatAmount,
    total: amountAgorot + vatAmount,
  };
}

// Example: Client billed ₪1,000 (100000 agorot)
// calculateInvoice(100000) → { amount: 100000, vatAmount: 18000, total: 118000 }
// Display: ₪1,000.00 + ₪180.00 VAT = ₪1,180.00
```

## Billing Entry Types

| Type | Hebrew | Description |
|------|--------|-------------|
| `monthly_fee` | אגרה חודשית | Fixed monthly retainer |
| `hourly` | שעתי | Hourly billing (amount = hours × rate) |
| `one_time` | חד-פעמי | One-time service fee |

### Monthly Fee Calculation
```typescript
// Monthly fee is a fixed amount set per client
const monthlyFee = client.monthly_fee_agorot; // e.g., 200000 (₪2,000)
```

### Hourly Billing
```typescript
function calculateHourlyBilling(hours: number, rateAgorot: number): number {
  return Math.round(hours * rateAgorot);
}

// Example: 3.5 hours × ₪350/hr
// calculateHourlyBilling(3.5, 35000) → 122500 (₪1,225.00)
```

## Client Balance

```typescript
function calculateClientBalance(
  billingEntries: BillingEntry[],
  invoices: Invoice[]
): number {
  const totalBilled = billingEntries
    .filter(e => !e.invoice_id) // Only uninvoiced entries
    .reduce((sum, e) => sum + e.amount, 0);

  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.total, 0);

  const totalInvoiced = invoices
    .reduce((sum, i) => sum + i.total, 0);

  return totalInvoiced - totalPaid; // Outstanding balance in agorot
}
```

## Date Formatting

```typescript
function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateStr));
}

// formatDate('2026-03-15') → "15/03/2026" (dd/mm/yyyy in Hebrew locale)
```

## Rules

- **NEVER** use floating-point for money calculations
- **ALWAYS** round to integer agorot using `Math.round()`
- **ALWAYS** store amounts as integers in the database
- **ALWAYS** convert to shekels only for display
- **ALWAYS** include VAT breakdown on invoices (amount + vatAmount = total)
