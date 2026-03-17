---
name: domain
description: >
  Use when working with Israeli tax/legal domain logic — filing schedules,
  VAT calculations, invoicing, billing, client types, RBAC permissions,
  or any business rules specific to law/accounting firm management.
---

# LexDoc Domain Knowledge

> Israeli tax/legal domain rules for law and accounting firm management.

## When to Use

Use when implementing filing logic, financial calculations, permission checks, client management, or any business rules specific to the Israeli legal/accounting domain.

## Filing Types

| Type | Hebrew | Code | Frequency |
|------|--------|------|-----------|
| VAT Report | דוח מע"מ | `maam` | Monthly or Bimonthly |
| Tax Advances | מקדמות מס הכנסה | `mekadmot` | Monthly |
| Income Tax Deductions | ניכויים מס הכנסה | `nikuyim` | Monthly |
| NII Deductions | ניכויים ביטוח לאומי | `nii` | Monthly |

## Filing Schedule

- **Due date**: 15th of the month after the filing period
- **Monthly**: Jan→due Feb 15, Feb→due Mar 15, etc.
- **Bimonthly** (some VAT): Jan-Feb→due Mar 15, Mar-Apr→due May 15, etc.
- **Year boundary**: Dec→due Jan 15 of next year

## Automatic Task Engine

When a filing deadline is within 10 days:
1. Check if a task already exists for this filing
2. If not, auto-create a task linked to the filing
3. Set priority to `high`
4. Set `auto_generated = true`

## Financial Rules

- **VAT_RATE**: `0.18` (18%)
- **Currency**: Israeli Shekel (₪ / ILS)
- **Money storage**: Integer agorot (1 ₪ = 100 agorot)
- **Formatting**: Use `he-IL` locale with `Intl.NumberFormat`
- **Invoice total**: `amount + vat_amount = total`
- **VAT calculation**: `vat_amount = Math.round(amount * VAT_RATE)`

## Client Types

| Code | Hebrew | Description |
|------|--------|-------------|
| `company` | חברה | Registered company (Ltd, Inc) |
| `self_employed` | עוסק מורשה | Licensed self-employed |
| `economic` | עוסק פטור | Exempt dealer (below VAT threshold) |
| `private` | פרטי | Private individual |

## RBAC Roles

| Role | Hebrew | Access Level |
|------|--------|-------------|
| `superAdmin` | מנהל ראשי | Full system — all firms, all settings |
| `manager` | מנהל משרד | Firm-wide — all clients, staff management |
| `staff` | עובד | Assigned clients only |
| `external` | חיצוני | Read-only, limited sections |

## Document Sensitivity Levels

| Level | Hebrew | Who Can Access |
|-------|--------|---------------|
| `normal` | רגיל | All firm staff |
| `confidential` | סודי | Manager + assigned staff |
| `restricted` | מוגבל | Manager only |

## Subscription Plans

Firms subscribe to LexDoc with tiered plans:
- Monthly, yearly, or 2-year billing cycles
- Features gated by plan level

## Detailed Rules

For full patterns and algorithms, read:
- `rules/filing-logic.md` — Filing schedule generation, period calculations
- `rules/financial-calculations.md` — Invoice generation, VAT, currency formatting
- `rules/rbac-model.md` — Complete permission model with 4 roles
