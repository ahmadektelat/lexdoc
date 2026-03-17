---
name: i18n-rtl
description: >
  Use when adding any user-facing text, UI labels, buttons, toast messages,
  placeholders, or working with RTL layout for Hebrew/Arabic/English.
  Use this whenever creating or editing components with translatable strings,
  fixing layout direction issues, or adding new translation keys.
---

# i18n & RTL Patterns

> Project-specific skill for 3-language translation and RTL layout.

## When to Use

Use when adding any user-facing text, creating UI components, or working with layout that must support RTL (Hebrew/Arabic) and LTR (English).

## Quick Reference

### 3 Translation Files
- `src/i18n/he.ts` — Hebrew (primary language)
- `src/i18n/ar.ts` — Arabic
- `src/i18n/en.ts` — English

### Using Translations

```typescript
import { useLanguage } from '@/contexts/LanguageContext';

const { t, direction, language } = useLanguage();

// In JSX
<h1>{t('section.title')}</h1>
<div dir={direction}>...</div>
```

## Key Naming Convention

Format: `section.descriptiveKey`

Examples:
- `clients.addNew` — "הוספת לקוח חדש"
- `filings.vatReport` — "דוח מע\"מ"
- `billing.invoiceTotal` — "סה\"כ חשבונית"
- `dashboard.title` — "לוח בקרה"
- `common.save` — "שמירה"
- `common.cancel` — "ביטול"
- `errors.notFound` — "לא נמצא"

## Key Naming by Section

| Section | Prefix | Example |
|---------|--------|---------|
| Common | `common.` | `common.save`, `common.cancel` |
| Navigation | `nav.` | `nav.dashboard` |
| Clients | `clients.` | `clients.addNew` |
| Filings | `filings.` | `filings.vatReport` |
| Billing | `billing.` | `billing.invoiceTotal` |
| Staff | `staff.` | `staff.addMember` |
| CRM | `crm.` | `crm.newInteraction` |
| Reports | `reports.` | `reports.generate` |
| Messaging | `messaging.` | `messaging.send` |
| Permissions | `permissions.` | `permissions.editRole` |
| Audit | `audit.` | `audit.viewLog` |
| Documents | `documents.` | `documents.upload` |
| Backup | `backup.` | `backup.export` |
| Auth | `auth.` | `auth.login` |
| Dashboard | `dashboard.` | `dashboard.overview` |
| Errors | `errors.` | `errors.generic` |

## What to Translate

**Always translate:**
- UI labels, buttons, headings
- Toast messages (success, error)
- Placeholders and tooltips
- Dialog titles and descriptions
- Select options and empty states
- Error messages shown to users

**Never translate:**
- Code, API paths, technical IDs
- Content-generation templates in a specific language
- Phone format patterns, regex, URLs, tax ID formats

## Verification

After adding keys, verify TypeScript compiles:
```bash
npx tsc --noEmit
```

## Detailed Rules

For full examples and patterns, read:
- `rules/translation-workflow.md` — Step-by-step for adding keys
- `rules/rtl-layout.md` — RTL layout patterns and utilities
