# Feature-Complete Integrations: Technical Design

## 1. Architecture Overview

Four features to implement, ordered by dependency:

1. **Invoice PDF Generation** -- Replace `buildInvoiceText()` + `handlePrint()` with jsPDF-based PDF output. Creates a shared PDF utility in `src/lib/pdf.ts`.
2. **Settings Page** -- New `SettingsView` component at `src/components/settings/SettingsView.tsx`, wired into `/settings` route in `App.tsx`.
3. **Document Generation PDF Upgrade** -- Upgrade `DocGenModal` download/save from `.txt` to `.pdf`, reusing shared PDF utility from Feature 1.
4. **Cron Status Indicator** -- Small badge in `MsgSchedulePanel` showing whether pg_cron auto-processing is active.

### Key Design Decisions

- **jsPDF + jsPDF-AutoTable** for PDF generation (not @react-pdf/renderer). Rationale: lighter bundle, simpler API, proven RTL handling with embedded fonts. The existing codebase has no React PDF rendering patterns, and jsPDF fits the imperative "generate and download" pattern already used in `handlePrint()` and `handleDownload()`.
- **Single shared PDF utility** (`src/lib/pdf.ts`) used by both Invoice PDF and DocGen PDF. Contains: font embedding, RTL configuration, letterhead rendering, and image fetching helper.
- **Hebrew font**: Embed Noto Sans Hebrew (regular weight) as a base64 string in a separate file `src/lib/pdf-font.ts`. This adds ~80KB to the bundle but is loaded lazily (only when PDF generation is triggered).
- **Logo handling**: Fetch firm logo URL, convert to base64 via canvas, cache for session. Handle CORS by using the Supabase public URL directly (same-origin or CORS-enabled).

---

## 2. New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `jspdf` | `^2.5.2` | PDF document generation |
| `jspdf-autotable` | `^3.8.4` | Table rendering in PDFs (invoice line items) |

Install command:
```bash
npm install jspdf jspdf-autotable
```

No new dev dependencies needed. TypeScript types are bundled with both packages.

---

## 3. Shared PDF Utility Design

### File: `src/lib/pdf.ts`

This is the core shared module. Both Invoice PDF and DocGen PDF import from here.

**Exports:**

```typescript
// Creates a pre-configured jsPDF instance with Hebrew font and RTL settings
export function createPdfDoc(): jsPDF

// Renders firm letterhead (logo + name + contact details) at the top of a page
// Returns the Y position after the letterhead for continued content
export function renderLetterhead(doc: jsPDF, firm: Firm, logoBase64: string | null): number

// Fetches an image URL and returns a base64 data URI, or null on failure
export function fetchImageAsBase64(url: string): Promise<string | null>
```

**Design Notes:**
- `createPdfDoc()` instantiates jsPDF with A4 portrait, registers the Hebrew font, sets it as default, and returns the doc. The font is lazy-loaded from `pdf-font.ts` on first call.
- `renderLetterhead()` is a pure function that draws the firm header (logo image if provided, firm name, reg number, phone, email, city) in RTL layout at the top of the page. Returns Y offset so callers know where to start their content.
- `fetchImageAsBase64()` uses a canvas element to convert a remote image URL to base64. Returns `null` on any error (CORS, network, etc.) so the caller can gracefully skip the logo.

### File: `src/lib/pdf-font.ts`

Contains a single exported constant:
```typescript
export const NOTO_SANS_HEBREW_REGULAR: string = '...base64 string...'
```

The implementer must download the Noto Sans Hebrew Regular TTF, convert to base64, and place it here. This file will be ~80KB but is tree-shaken unless PDF generation is actually used.

### Data Flow (PDF Generation)

```
User clicks Download
    |
    v
Component gathers data (invoice/letter + firmData)
    |
    v
fetchImageAsBase64(firmData.logo) -> base64 | null  [cached after first call]
    |
    v
createPdfDoc() -> jsPDF instance with Hebrew font
    |
    v
renderLetterhead(doc, firmData, logoBase64) -> yOffset
    |
    v
Component-specific content rendering (table for invoice, text for letter)
    |
    v
doc.save('filename.pdf')
```

---

## 4. Feature 1: Invoice PDF Generation

### File-by-File Change Plan

#### `src/lib/pdf.ts`
- **Action:** Create
- **Changes:** New shared PDF utility module with `createPdfDoc()`, `renderLetterhead()`, `fetchImageAsBase64()` as described in Section 3.
- **Rationale:** Shared between Invoice PDF and DocGen PDF. Centralizes font loading, RTL setup, and letterhead rendering.

#### `src/lib/pdf-font.ts`
- **Action:** Create
- **Changes:** Single exported constant containing base64-encoded Noto Sans Hebrew Regular TTF font data.
- **Rationale:** Keeps the large font string out of the main pdf.ts module for readability. Lazy-loaded only when PDF generation is triggered.

#### `src/components/billing/InvoicesTab.tsx`
- **Action:** Modify
- **Changes:**
  - Remove `buildInvoiceText()` function (lines 38-105). Replace with a new `generateInvoicePdf()` async function.
  - Modify `handlePrint()` (lines 201-222) to call the new async PDF function instead of building text.
  - Add imports: `createPdfDoc`, `renderLetterhead`, `fetchImageAsBase64` from `@/lib/pdf`, and `autoTable` from `jspdf-autotable`.
  - Add `agorotToShekel` import from `@/lib/money` (for raw number display in PDF table cells).
  - The new `generateInvoicePdf()` function:
    1. Calls `fetchImageAsBase64(firmData?.logo)` to get logo (cached).
    2. Calls `createPdfDoc()` to get a configured jsPDF instance.
    3. Calls `renderLetterhead(doc, firmData, logoBase64)` to draw firm header.
    4. Draws invoice metadata block (invoice number, date, billing period) aligned RTL.
    5. Draws client block (name, case number, email).
    6. Uses `autoTable` to render the line items table with columns: Description | Qty | Unit Price | Total. RTL text alignment. Column widths proportional.
    7. Draws totals section below the table: Subtotal, VAT (18%), Total Due -- using `formatMoney()` for display.
    8. If `monthHours.length > 0`, draws hours summary section (staff name -> hours).
    9. Draws footer with payment due date and thank-you message.
    10. Calls `doc.save(`${invoice.invoiceNum}.pdf`)`.
  - Change `handlePrint` from sync to async. Add a loading state to prevent double-clicks during PDF generation.
- **Rationale:** This is the core integration point specified in the requirements (R1.4). The data gathering remains identical; only the output format changes.

#### `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add new translation keys for PDF-specific labels (see Section 8 for complete list).
- **Rationale:** PDF column headers and labels need to be translatable.

### Data Flow

```
handlePrint(invoice)
  |
  +--> hoursEntries.filter(invoiceMonth) -> monthHours
  |
  +--> fetchImageAsBase64(firmData.logo) -> logoBase64
  |
  +--> createPdfDoc() -> doc (jsPDF with Hebrew font)
  |
  +--> renderLetterhead(doc, firmData, logoBase64) -> yPos
  |
  +--> Draw invoice number, date at yPos (RTL)
  |
  +--> Draw client name, case num, email
  |
  +--> autoTable(doc, { columns, body: invoice.items, startY })
  |
  +--> Draw subtotal / VAT / total below table
  |
  +--> Draw hours summary (optional)
  |
  +--> Draw footer
  |
  +--> doc.save(`${invoiceNum}.pdf`)
```

### Edge Cases & Error Handling

1. **Logo fetch fails (CORS/network)** -> `fetchImageAsBase64()` returns `null`, letterhead renders without logo. No error shown to user -- logo is optional decoration.
2. **Very long item descriptions** -> jsPDF-AutoTable handles text wrapping within cells automatically. No special handling needed.
3. **Invoice with zero items** -> Unlikely given the create flow, but the table renders with no rows. Not a crash.
4. **Large number of hours entries** -> Could overflow a page. Use jsPDF's page break handling. AutoTable handles pagination automatically for the items table. For the hours summary, check remaining page height before rendering.
5. **Missing firm data** -> `renderLetterhead()` gracefully handles null/undefined fields by skipping them.

---

## 5. Feature 2: Settings Page

### File-by-File Change Plan

#### `src/components/settings/SettingsView.tsx`
- **Action:** Create
- **Changes:** New full-page settings component with the following sections, laid out as a single scrollable page with Card-based sections (following the pattern used in `BackupView`):

  **Section 1: Firm Profile**
  - Form fields: name (text input), phone (text input, `dir="ltr"`), email (text input, `dir="ltr"`), city (text input)
  - Read-only display: regNum, firmType (using `t()` for type label)
  - Uses `FormField` shared component for each field
  - Pre-populated from `useAuthStore((s) => s.firmData)`
  - Save button calls `firmService.updateFirm()` with changed fields, then `useAuthStore.getState().setFirmData(updatedFirm, role)` to update local state
  - Permission-gated: editable only if `can('settings.firm')`, otherwise read-only

  **Section 2: Logo**
  - Displays current logo as `<img>` from `firmData.logo` URL, or a placeholder icon if no logo
  - "Upload Logo" button opens a file input (accepts `image/*`)
  - On file select: calls `firmService.uploadLogo(firmId, file)`, then `firmService.updateFirm(firmId, { logo: url })`, then updates auth store
  - "Remove Logo" button: calls `firmService.updateFirm(firmId, { logo: '' })`, updates auth store
  - Permission-gated: same as firm profile (`settings.firm`)

  **Section 3: Billing Defaults**
  - Default monthly fee input: displayed in shekels (using `agorotToShekel(firmData.defaultFee)`), stored as agorot (using `shekelToAgorot()`)
  - Uses a number input with `dir="ltr"` and a shekel prefix label
  - Save alongside firm profile changes (same save button/action)
  - Permission-gated: same as firm profile

  **Section 4: Subscription**
  - Displays: plan label (`t(firmData.planLabel)`), expiry date (`formatDate(firmData.expiry)`), days remaining (`daysLeft(firmData.expiry)`)
  - Progress bar for subscription (reuse logic from `SubscriptionStatus`)
  - Read-only display -- no edit actions (subscription management is out of scope)

  **Section 5: Preferences**
  - Embeds `<ThemePicker />` component from `@/components/shared/ThemePicker`
  - Embeds `<LanguageSelector />` component from `@/components/shared/LanguageSelector`
  - These are self-contained components that manage their own state (Zustand/Context). No additional wiring needed.
  - No permission gating -- all users can change their own theme/language

  **Layout:**
  - Outer `div.p-6.animate-fade-in` (matches all other views)
  - `PageHeader` with `t('settings.title')` and `t('settings.description')`
  - Sections as `Card` components with `CardContent`, each with a section heading
  - Two-column layout on large screens for firm profile fields (`grid grid-cols-1 lg:grid-cols-2 gap-4`)
  - Save button at the bottom of the editable sections

  **State Management:**
  - Local `useState` for form fields, initialized from `firmData`
  - `isSaving` boolean state for submit button loading
  - `isDirty` computed from comparing form state to `firmData` (enables/disables save button)
  - No React Query mutation needed -- direct `firmService.updateFirm()` call + manual auth store update

- **Rationale:** The Settings page is the only feature requiring a new component. All backend (firmService, types, auth store) is ready. The pattern follows `BackupView` which uses Card-based sections with PageHeader.

#### `src/App.tsx`
- **Action:** Modify
- **Changes:**
  - Add import: `import { SettingsView } from '@/components/settings/SettingsView';`
  - Replace line 91: `<Route path="settings" element={<SectionPlaceholder section="settings" />} />` with `<Route path="settings" element={<SettingsView />} />`
- **Rationale:** Wire the new component into the existing route.

#### `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add `settings.*` translation keys (see Section 8 for complete list).
- **Rationale:** All UI text must use `t()`.

### Data Flow

```
SettingsView mounts
  |
  +--> useAuthStore((s) => s.firmData) -> populate form state
  |
  +--> useAuthStore((s) => s.role) -> determine read-only vs editable
  |
  +--> useAuthStore((s) => s.can('settings.firm')) -> permission check
  |
User edits fields + clicks Save
  |
  +--> firmService.updateFirm(firmId, { name, phone, email, city, defaultFee })
  |       |
  |       +--> Supabase UPDATE firms SET ... WHERE id = firmId
  |
  +--> On success: firmService.getFirmById(firmId) -> updated Firm
  |       |
  |       +--> useAuthStore.getState().setFirmData(updatedFirm, role)
  |
  +--> toast.success(t('settings.saveSuccess'))

User uploads logo
  |
  +--> firmService.uploadLogo(firmId, file) -> { url }
  |       |
  |       +--> Supabase Storage: firm-logos/{firmId}/logo.{ext}
  |
  +--> firmService.updateFirm(firmId, { logo: url })
  |
  +--> Refresh firmData in auth store
```

### Edge Cases & Error Handling

1. **User without `settings.firm` permission** -> All form fields render as read-only (disabled inputs or plain text). Save button hidden. Logo upload hidden. Preferences section still visible and functional.
2. **Logo upload fails** -> Toast error message. Form state unchanged.
3. **Save fails (network/Supabase error)** -> Toast error message. Form state preserved so user can retry.
4. **defaultFee input validation** -> Must be non-negative number. Use `type="number" min="0"`. Convert on save with `shekelToAgorot()`.
5. **No firmData yet (loading state)** -> Show `LoadingSpinner`. This shouldn't happen since the route is protected and auth initializes firmData on login.

### Permission Model

The `settings.firm` permission already exists in `PERMISSION_GROUPS` (confirmed in `constants.ts` line 142 where editor role excludes `settings.*`). The `can()` function in `useAuthStore` returns `true` for `superAdmin` regardless.

---

## 6. Feature 3: Document Generation PDF Upgrade

### File-by-File Change Plan

#### `src/components/documents/DocGenModal.tsx`
- **Action:** Modify
- **Changes:**
  - Add imports: `createPdfDoc`, `renderLetterhead`, `fetchImageAsBase64` from `@/lib/pdf`.
  - Modify `handleDownload()` (lines 222-232):
    - Instead of creating a text Blob, call a new `generateLetterPdf()` async function.
    - `generateLetterPdf()` does:
      1. `fetchImageAsBase64(firmData?.logo)` -> logoBase64
      2. `createPdfDoc()` -> doc
      3. `renderLetterhead(doc, firmData, logoBase64)` -> yPos
      4. Split `letterText` into lines, render each line RTL using `doc.text()` with appropriate line spacing, starting at yPos.
      5. Handle page breaks: check if current Y exceeds page height minus margin, add new page if so.
      6. `doc.save(filename.pdf)` with the same filename pattern but `.pdf` extension.
    - Change `handleDownload` from sync to async.
  - Modify `handleSave()` (lines 234-254):
    - The save flow currently saves `.txt` to Supabase Storage.
    - Change to generate PDF blob instead: use `doc.output('blob')` to get the PDF as a Blob.
    - Update the `useSaveGeneratedDocument` call to pass PDF blob and `application/pdf` MIME type instead of text.
    - Change filename from `.txt` to `.pdf`.
  - Update download button icon/label if needed (current label is `t('documents.downloadLetter')` which is fine -- it doesn't mention the format).
  - Fix filename issue (R4.3): Change `toLocaleDateString('he-IL')` in filename to ISO date format (`new Date().toISOString().slice(0, 10)`) to avoid OS filesystem issues.

#### `src/hooks/useDocuments.ts`
- **Action:** Modify
- **Changes:**
  - Update `useSaveGeneratedDocument` mutation function signature to accept either a text `content` string or a `Blob` for PDF. The cleanest approach: add an optional `blob?: Blob` parameter. When `blob` is provided, use it directly for the storage upload instead of creating a Blob from text.
  - Update MIME type handling: when blob is provided, use `blob.type` (which will be `application/pdf`); otherwise use `text/plain` as currently.
  - Update the document metadata: when saving PDF, set `mime_type: 'application/pdf'` and `generated: true`.
- **Rationale:** The save hook needs to support both formats during transition. The `content` field (stored in DB for text preview) can still store the plain text version for generated documents, even when the storage file is PDF.

#### `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add `documents.generatingPdf` key for loading state during PDF generation (see Section 8).
- **Rationale:** User feedback during async PDF generation.

### Data Flow

```
handleDownload() [DocGenModal]
  |
  +--> fetchImageAsBase64(firmData.logo) -> logoBase64
  |
  +--> createPdfDoc() -> doc
  |
  +--> renderLetterhead(doc, firmData, logoBase64) -> yPos
  |
  +--> Split letterText by newlines
  |    For each line: doc.text(line, pageWidth - margin, yPos, { align: 'right' })
  |    Increment yPos, add page if needed
  |
  +--> doc.save('template_clientName_2026-03-26.pdf')

handleSave() [DocGenModal]
  |
  +--> Generate PDF blob: doc.output('blob')
  |
  +--> saveGenerated.mutate({ firmId, clientId, folderId, name: '...pdf', blob, content: letterText })
  |
  +--> useSaveGeneratedDocument:
  |      +--> Upload blob to Supabase Storage (client-documents bucket)
  |      +--> Create document DB row with mime_type='application/pdf', content=letterText
```

### Edge Cases & Error Handling

1. **Very long letter text** -> Page break handling in the render loop. Check Y position against page height before each line.
2. **Hebrew text wrapping** -> jsPDF's `doc.text()` with `maxWidth` parameter handles wrapping. Set maxWidth to page width minus margins.
3. **Save with PDF blob fails** -> Same error handling as current text save. Storage cleanup on DB insert failure.

---

## 7. Feature 4: Cron Status Indicator

### File-by-File Change Plan

#### `src/components/messaging/CronStatusBadge.tsx`
- **Action:** Create
- **Changes:** Small self-contained component that:
  1. On mount, calls `supabase.rpc('check_cron_status')` (a new lightweight RPC, see below).
  2. Displays a small badge/indicator:
     - Green dot + "Automatic processing active" if cron job exists
     - Yellow dot + "Manual processing only" if cron is not available
  3. Uses `Tooltip` from shadcn/ui for the label (keeps UI compact).
  4. Uses `useQuery` with a long stale time (30 minutes) since cron status rarely changes.
- **Rationale:** Separate component keeps `MsgSchedulePanel` clean. The badge is small and informational only.

**Alternative (simpler, no new RPC):** Instead of querying the database, check the cron status once during app init or use a simpler approach:
- Call `supabase.rpc('check_cron_status')` which checks if the `cron.job` table exists and has our job.
- If the RPC fails (because `cron` schema doesn't exist on free tier), that itself tells us cron is not available.

**Chosen approach:** Create a new RPC `check_cron_status` that returns a boolean. This is the cleanest approach because:
- It handles the case where the `cron` schema doesn't exist (catches the error).
- It runs server-side, so no client-side permission issues with the `cron` schema.
- It's a single boolean result, minimal data transfer.

#### Database Migration: `check_cron_status` RPC
- **Action:** Create migration
- **Changes:** New SQL function:
  ```sql
  CREATE OR REPLACE FUNCTION check_cron_status()
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM cron.job
      WHERE jobname = 'process-scheduled-messages'
    );
  EXCEPTION
    WHEN undefined_table THEN RETURN FALSE;
    WHEN OTHERS THEN RETURN FALSE;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION check_cron_status() TO authenticated;
  ```
- **Rationale:** Safely checks cron status. SECURITY DEFINER because authenticated users don't have access to the `cron` schema. The EXCEPTION block handles the case where `cron.job` table doesn't exist (free tier). Returns simple boolean.

#### `src/components/messaging/MsgSchedulePanel.tsx`
- **Action:** Modify
- **Changes:**
  - Import `CronStatusBadge` from `./CronStatusBadge`.
  - Add `<CronStatusBadge />` next to the "Pending" heading (line 244), inside the `flex items-center justify-between` div.
  - Specifically, place it between the heading and the "Run Now" button.
- **Rationale:** Minimal change to existing component. The badge is additive only.

#### `src/hooks/useMessages.ts`
- **Action:** Modify
- **Changes:**
  - Add a new hook `useCronStatus()` that calls `supabase.rpc('check_cron_status')` via `useQuery`.
  - Query key: `['cron-status']`.
  - `staleTime: 30 * 60 * 1000` (30 minutes) -- cron status doesn't change during normal use.
  - `retry: false` -- if the RPC fails, assume cron is not available.
- **Rationale:** Follows existing hook patterns in the codebase.

#### `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add `messaging.cronActive` and `messaging.cronInactive` translation keys (see Section 8).
- **Rationale:** Badge tooltip text needs translation.

### Data Flow

```
CronStatusBadge mounts
  |
  +--> useCronStatus() -> useQuery('cron-status')
  |       |
  |       +--> supabase.rpc('check_cron_status') -> boolean
  |
  +--> isActive ? green dot : yellow dot
  +--> Tooltip: t('messaging.cronActive') | t('messaging.cronInactive')
```

### Edge Cases & Error Handling

1. **RPC doesn't exist yet (migration not applied)** -> `useQuery` error, `retry: false`, component shows "manual only" as default. Not a crash.
2. **Network error** -> Same as above, graceful fallback.
3. **Free tier (no pg_cron)** -> `check_cron_status()` returns `false` (exception caught in SQL). Badge shows "manual processing only".

---

## 8. i18n Keys (Complete List)

### Settings Keys

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `settings.title` | הגדרות | الإعدادات | Settings |
| `settings.description` | ניהול פרטי המשרד והעדפות | إدارة ملف المكتب والتفضيلات | Manage firm profile and preferences |
| `settings.firmProfile` | פרטי משרד | ملف المكتب | Firm Profile |
| `settings.firmName` | שם המשרד | اسم المكتب | Firm Name |
| `settings.phone` | טלפון | هاتف | Phone |
| `settings.email` | דוא"ל | بريد إلكتروني | Email |
| `settings.city` | עיר | مدينة | City |
| `settings.regNum` | מספר רישום | رقم التسجيل | Registration Number |
| `settings.firmType` | סוג המשרד | نوع المكتب | Firm Type |
| `settings.logo` | לוגו | شعار | Logo |
| `settings.uploadLogo` | העלאת לוגו | تحميل الشعار | Upload Logo |
| `settings.removeLogo` | הסרת לוגו | إزالة الشعار | Remove Logo |
| `settings.defaultFee` | שכר טרחה חודשי ברירת מחדל | الرسوم الشهرية الافتراضية | Default Monthly Fee |
| `settings.subscription` | מנוי | الاشتراك | Subscription |
| `settings.currentPlan` | תוכנית נוכחית | الخطة الحالية | Current Plan |
| `settings.expiry` | תאריך תפוגה | تاريخ الانتهاء | Expiry Date |
| `settings.daysRemaining` | {days} ימים נותרו | {days} أيام متبقية | {days} days remaining |
| `settings.preferences` | העדפות | التفضيلات | Preferences |
| `settings.theme` | ערכת נושא | السمة | Theme |
| `settings.language` | שפה | اللغة | Language |
| `settings.saveSuccess` | ההגדרות נשמרו בהצלחה | تم حفظ الإعدادات بنجاح | Settings saved successfully |
| `settings.saveFailed` | שמירת ההגדרות נכשלה | فشل حفظ الإعدادات | Failed to save settings |
| `settings.logoUploadSuccess` | הלוגו הועלה בהצלחה | تم تحميل الشعار بنجاح | Logo uploaded successfully |
| `settings.logoRemoved` | הלוגו הוסר | تمت إزالة الشعار | Logo removed |
| `settings.noPermission` | אין הרשאה לערוך הגדרות | لا يوجد إذن لتعديل الإعدادات | No permission to edit settings |
| `settings.feeCurrency` | ₪ | ₪ | ₪ |
| `settings.billingDefaults` | הגדרות חיוב | إعدادات الفواتير | Billing Defaults |

### Invoice PDF Keys

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `invoices.pdfDescription` | תיאור | الوصف | Description |
| `invoices.pdfQty` | כמות | الكمية | Qty |
| `invoices.pdfUnitPrice` | מחיר ליחידה | سعر الوحدة | Unit Price |
| `invoices.pdfTotal` | סה"כ | المجموع | Total |
| `invoices.pdfGenerating` | מייצר חשבונית... | جاري إنشاء الفاتورة... | Generating invoice... |

### Document Generation PDF Keys

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `documents.generatingPdf` | מייצר מסמך... | جاري إنشاء المستند... | Generating document... |

### Cron Status Keys

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `messaging.cronActive` | עיבוד אוטומטי פעיל | المعالجة التلقائية نشطة | Automatic processing active |
| `messaging.cronInactive` | עיבוד ידני בלבד | المعالجة اليدوية فقط | Manual processing only |

---

## 9. Implementation Order

The features should be implemented in this order due to dependencies:

### Phase 1: Shared PDF Infrastructure + Invoice PDF
**Files created/modified:**
1. `src/lib/pdf-font.ts` (create) -- Font data, no dependencies
2. `src/lib/pdf.ts` (create) -- Shared PDF utility, depends on pdf-font.ts
3. `src/components/billing/InvoicesTab.tsx` (modify) -- Replace txt with PDF
4. `src/i18n/he.ts`, `ar.ts`, `en.ts` (modify) -- Add invoice PDF keys

**Verification:** Build succeeds. Download invoice produces a properly formatted RTL Hebrew PDF.

### Phase 2: Settings Page
**Files created/modified:**
1. `src/components/settings/SettingsView.tsx` (create) -- New component
2. `src/App.tsx` (modify) -- Wire route
3. `src/i18n/he.ts`, `ar.ts`, `en.ts` (modify) -- Add settings keys

**Verification:** Build succeeds. `/settings` renders a real page. Form saves persist. Logo upload works. Permission gating works.

### Phase 3: Document Generation PDF Upgrade
**Files modified:**
1. `src/components/documents/DocGenModal.tsx` (modify) -- PDF download + save
2. `src/hooks/useDocuments.ts` (modify) -- Support PDF blob in save hook

**Verification:** Build succeeds. Download from DocGenModal produces PDF. Save stores PDF in Supabase Storage.

### Phase 4: Cron Status Indicator
**Files created/modified:**
1. Database migration: `check_cron_status` RPC
2. `src/components/messaging/CronStatusBadge.tsx` (create) -- Badge component
3. `src/hooks/useMessages.ts` (modify) -- Add `useCronStatus` hook
4. `src/components/messaging/MsgSchedulePanel.tsx` (modify) -- Embed badge
5. `src/i18n/he.ts`, `ar.ts`, `en.ts` (modify) -- Add cron keys

**Verification:** Build succeeds. Badge appears in messaging schedule panel. Shows correct status.

### Cross-cutting (all phases):
- Run `npx tsc --noEmit` after each phase
- Run `npm run build` after each phase
- Verify RTL layout in browser

---

## 10. Risks and Mitigations

### Risk 1: Hebrew font rendering in jsPDF
**Likelihood:** Medium
**Impact:** High -- PDFs would be unreadable without proper Hebrew support
**Mitigation:** jsPDF supports custom font embedding via `doc.addFileToVFS()` + `doc.addFont()`. Noto Sans Hebrew is a proven, free font with full Hebrew character support. The implementation must register the font before any text rendering. Test with all Hebrew characters used in the UI (including special characters like `"` in `דוח מע"מ`).

### Risk 2: Logo CORS when converting to base64
**Likelihood:** Low (Supabase Storage public URLs should be CORS-enabled)
**Impact:** Low -- logo is optional decoration
**Mitigation:** `fetchImageAsBase64()` catches all errors and returns `null`. The letterhead renders without the logo. If CORS becomes an issue, the Supabase project's storage CORS settings can be updated.

### Risk 3: Bundle size increase from font + jsPDF
**Likelihood:** Certain
**Impact:** Low -- ~80KB for font + ~300KB for jsPDF (gzipped: ~25KB + ~90KB)
**Mitigation:** The font file is in a separate module (`pdf-font.ts`) that is only imported when PDF generation is triggered. Consider dynamic `import()` in `handlePrint()` and `handleDownload()` to lazy-load the PDF modules:
```typescript
async function handlePrint(invoice: Invoice) {
  const { createPdfDoc, renderLetterhead, fetchImageAsBase64 } = await import('@/lib/pdf');
  // ... generate PDF
}
```
This ensures the PDF libraries are not included in the initial bundle and are only loaded on first PDF generation.

### Risk 4: jsPDF-AutoTable RTL table rendering
**Likelihood:** Medium
**Impact:** Medium -- table columns may appear LTR
**Mitigation:** AutoTable supports `styles: { halign: 'right' }` for RTL text alignment. The column order in the data array should be reversed (Total | Unit Price | Qty | Description) so that when rendered RTL, the visual order matches expectations. Test thoroughly with Hebrew text in all columns.

### Risk 5: Settings page state management after save
**Likelihood:** Low
**Impact:** Medium -- firmData in auth store could become stale
**Mitigation:** After successful `updateFirm()`, re-fetch the firm with `getFirmById()` and call `setFirmData()` to update the global store. This ensures all components reading from `useAuthStore` see the updated firm data immediately.

### Risk 6: check_cron_status RPC security
**Likelihood:** Low
**Impact:** Low -- the function only returns a boolean
**Mitigation:** The function is `SECURITY DEFINER` (runs as the function owner, typically postgres) because authenticated users cannot access the `cron` schema. It returns only a boolean -- no data leakage risk. The `EXCEPTION` block prevents any error information from leaking to the caller.

---

## Self-Critique

### Where this design is weakest:

1. **Font file management**: Storing a base64-encoded font as a TypeScript constant is pragmatic but not elegant. An alternative would be to host the font file in the `public/` directory and fetch it at runtime, but that adds a network request and complicates offline scenarios. The current approach trades bundle size for reliability.

2. **PDF styling precision**: The design specifies what content to render but not exact pixel positions, colors, or font sizes. The implementer will need to make aesthetic decisions. Consider providing a reference PDF mockup or more specific styling constants (e.g., header font size: 16pt, body: 10pt, table header background: #f3f4f6).

3. **`useSaveGeneratedDocument` mutation signature change**: Adding a `blob` parameter to support PDF is a minimal but somewhat awkward API change. An alternative would be to create a separate `useSaveGeneratedPdfDocument` hook, but that duplicates logic. The chosen approach keeps a single hook with an optional parameter.

4. **No print/preview before download**: The current design goes straight to `doc.save()`. An alternative would be to open the PDF in a new browser tab for preview before downloading (using `doc.output('bloburl')`). This could be a future enhancement.

### Alternative approaches considered and rejected:

1. **@react-pdf/renderer instead of jsPDF**: Considered for its React-native approach, but rejected because: (a) heavier bundle (~400KB vs ~300KB), (b) requires a completely different rendering paradigm (React components vs imperative API), (c) the existing code uses an imperative download pattern that maps naturally to jsPDF. (d) RTL support requires more manual work with @react-pdf.

2. **Server-side PDF generation (Edge Function)**: Considered for reducing client bundle size, but rejected because: (a) adds latency (network round trip), (b) requires deploying an Edge Function with font dependencies, (c) the current architecture is fully client-side for PDF/export operations, (d) all data is already available client-side.

3. **Settings as a full Zustand store instead of local state**: Rejected because settings are not frequently accessed from multiple components simultaneously. The auth store already holds `firmData` which is the read path. The settings form is the only write path, and local state with a save action is simpler.
