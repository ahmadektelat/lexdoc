# Translation Workflow

## Adding a New Key

1. Choose the key name: `section.descriptiveKey`
2. Add to all 3 files in order:

### src/i18n/he.ts (Hebrew — primary)
```typescript
'clients.addNew': 'הוספת לקוח חדש',
```

### src/i18n/ar.ts (Arabic)
```typescript
'clients.addNew': 'إضافة عميل جديد',
```

### src/i18n/en.ts (English)
```typescript
'clients.addNew': 'Add New Client',
```

3. Use in component:
```typescript
const { t } = useLanguage();
<h1>{t('clients.addNew')}</h1>
```

4. Verify: `npx tsc --noEmit`

## Dynamic Strings

Use `.replace()` for interpolation:
```typescript
// In translation file:
'clients.deleteConfirm': 'האם אתה בטוח שברצונך למחוק את {{name}}?',

// In component:
t('clients.deleteConfirm').replace('{{name}}', clientName)
```

## Hebrew as Primary

- Hebrew is the primary UI language
- Start writing Hebrew text first, then Arabic, then English
- Test RTL layout with Hebrew before checking other languages

## Rules

- Never hardcode strings in JSX — always use `t()`
- Never delete existing keys unless intentionally replacing
- Keep keys sorted within their section group
- Import `useLanguage` if the component doesn't already have it
