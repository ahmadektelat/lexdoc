# RTL Layout Patterns

## Direction on Containers

Use `dir={direction}` on layout containers:

```typescript
const { direction } = useLanguage();

<div dir={direction} className="flex flex-col">
  {/* Content automatically flows RTL or LTR */}
</div>
```

## Force LTR for Specific Inputs

Phone numbers, tax IDs, code, and URLs are always LTR:

```typescript
<Input dir="ltr" type="tel" className="text-left" placeholder="050-1234567" />
<Input dir="ltr" value={taxId} className="text-left" placeholder="123456789" />
<code dir="ltr">{snippet}</code>
```

## Tailwind RTL Utilities

Use logical properties where available:

```css
/* Instead of ml-4 / mr-4, use: */
ms-4   /* margin-inline-start */
me-4   /* margin-inline-end */
ps-4   /* padding-inline-start */
pe-4   /* padding-inline-end */

/* Text alignment */
text-start  /* instead of text-left */
text-end    /* instead of text-right */
```

## Flexbox Direction

Flex containers auto-reverse in RTL. Use `flex-row` (not `flex-row-reverse`) and let `dir` handle it:

```typescript
<div dir={direction} className="flex flex-row gap-2">
  <span>{t('label')}</span>
  <span>{value}</span>
</div>
```

## Portal Overrides

shadcn portals (Select, Dialog, DropdownMenu, Popover) render outside the app root.
They don't inherit `dir` — override with `!important`:

```css
/* In component or global CSS */
[data-radix-popper-content-wrapper] {
  direction: rtl !important;
}

/* Or use the dir attribute directly on portal content */
<SelectContent dir={direction}>
```

## Icon Mirroring

Some icons should mirror in RTL (arrows, chevrons):
```typescript
<ChevronRight className={direction === 'rtl' ? 'rotate-180' : ''} />
```

Icons that should NOT mirror: checkmarks, plus, X, search.

## Table Layout

Tables in RTL should have headers aligned right:
```typescript
<table dir={direction}>
  <thead>
    <tr>
      <th className="text-start">{t('clients.name')}</th>
      <th className="text-start">{t('clients.phone')}</th>
    </tr>
  </thead>
</table>
```

## Scroll Bars

In RTL, scroll bars appear on the left. This is native behavior — don't override.

## Testing RTL

1. Switch language to Hebrew in the app
2. Verify layout flows right-to-left
3. Check that phone/tax ID inputs remain LTR
4. Verify dropdown menus open in correct direction
5. Check that icons point the right way
