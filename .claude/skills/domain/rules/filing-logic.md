# Filing Logic

## Filing Schedule Generation

### Algorithm

For each client, generate filings based on their `filing_settings`:

```typescript
function generateFilings(
  client: Client,
  settings: FilingSettings,
  year: number
): Filing[] {
  const filings: Filing[] = [];

  for (const filingType of settings.enabled_types) {
    const isBimonthly = filingType === 'maam' && settings.vat_bimonthly;
    const periods = isBimonthly
      ? getBimonthlyPeriods(year)
      : getMonthlyPeriods(year);

    for (const period of periods) {
      filings.push({
        firm_id: client.firm_id,
        client_id: client.id,
        type: filingType,
        period_start: period.start,
        period_end: period.end,
        due_date: calculateDueDate(period.end),
        status: 'pending',
      });
    }
  }

  return filings;
}
```

### Period Calculations

**Monthly periods:**
```typescript
function getMonthlyPeriods(year: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    start: `${year}-${String(i + 1).padStart(2, '0')}-01`,
    end: lastDayOfMonth(year, i + 1),
  }));
}
```

**Bimonthly periods (VAT only):**
```typescript
function getBimonthlyPeriods(year: number) {
  return [
    { start: `${year}-01-01`, end: `${year}-02-28` }, // or 29 in leap year
    { start: `${year}-03-01`, end: `${year}-04-30` },
    { start: `${year}-05-01`, end: `${year}-06-30` },
    { start: `${year}-07-01`, end: `${year}-08-31` },
    { start: `${year}-09-01`, end: `${year}-10-31` },
    { start: `${year}-11-01`, end: `${year}-12-31` },
  ];
}
```

### Due Date Calculation

The due date is always the **15th of the month after the period ends**:

```typescript
function calculateDueDate(periodEnd: string): string {
  const endDate = new Date(periodEnd);
  const dueMonth = endDate.getMonth() + 2; // +1 for 0-index, +1 for next month
  const dueYear = endDate.getFullYear() + (dueMonth > 12 ? 1 : 0);
  const adjustedMonth = dueMonth > 12 ? dueMonth - 12 : dueMonth;
  return `${dueYear}-${String(adjustedMonth).padStart(2, '0')}-15`;
}
```

**Edge cases:**
- December period → due January 15 of next year
- November-December bimonthly → due January 15 of next year

### Filing Status Transitions

```
pending → filed    (when accountant marks as completed)
pending → late     (when due_date passes without filing)
filed   → (final)  (cannot revert)
late    → filed    (late filing still gets recorded)
```

### Auto-Task Creation

When `daysUntilDue <= 10` and no task exists for this filing:

```typescript
async function createAutoTask(filing: Filing): Promise<Task> {
  return {
    firm_id: filing.firm_id,
    client_id: filing.client_id,
    filing_id: filing.id,
    title: getFilingTaskTitle(filing),
    description: `Auto-generated task for ${filing.type} filing`,
    due_date: filing.due_date,
    status: 'pending',
    priority: 'high',
    auto_generated: true,
  };
}

function getFilingTaskTitle(filing: Filing): string {
  const typeNames: Record<string, string> = {
    maam: 'דוח מע"מ',
    mekadmot: 'מקדמות מס הכנסה',
    nikuyim: 'ניכויים מס הכנסה',
    nii: 'ניכויים ביטוח לאומי',
  };
  return `${typeNames[filing.type]} - ${filing.period_end}`;
}
```
