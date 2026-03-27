# Feature-Complete Integrations: Requirements Document

## Executive Summary

LexDoc has five incomplete integrations that need to be completed to bring the product to a usable state. This document captures the current state of each, the gaps, and detailed requirements for completing them. The work is primarily frontend-focused with one database/cron concern. All features have existing scaffolding (types, services, hooks) but are missing final wiring or key functionality.

**Features:**
1. **Invoice PDF Generation** -- Invoices export as `.txt` files; needs proper PDF output
2. **Scheduled Message Processing** -- `process_scheduled_messages` RPC exists + cron migration, but cron may fail on free tier; manual "Run Now" button already works; verify and surface status
3. **Settings Page** -- Route exists (`/settings`) but renders a `SectionPlaceholder`; needs real settings UI
4. **Document Generation from Templates** -- DocGenModal works end-to-end (generates, previews, saves to Supabase Storage); generates `.txt` files; no PDF
5. **Report Export** -- Already functional for all 3 report tabs (CSV + TXT); verify completeness

---

## Feature 1: Invoice PDF Generation

### Current State

- **InvoicesTab** (`src/components/billing/InvoicesTab.tsx`) -- fully functional CRUD: create, list, mark paid, mark sent, download
- **invoiceService** (`src/services/invoiceService.ts`) -- full service layer: list, create, markPaid, markSent, getNextInvoiceNumber, delete
- **useInvoices** (`src/hooks/useInvoices.ts`) -- React Query hooks for all operations
- **Types** (`src/types/billing.ts`) -- `Invoice`, `InvoiceItem`, `CreateInvoiceInput` fully defined

**What works today:**
- Invoice creation with line items (monthly fee + hours summary)
- Invoice number generation via `generate_invoice_num` RPC
- Auto-creation of billing entry on invoice create
- Mark as paid/sent with linked billing entry update
- Download button exports as `.txt` via `buildInvoiceText()` (plain text, no formatting)

**The gap:** The `handlePrint()` function at line 201 generates a plain text file and downloads it as `{invoiceNum}.txt`. There is no PDF generation. The `buildInvoiceText()` function (line 38) constructs a text-only representation with separators (`=` and `-` lines).

### Gap Analysis

| Aspect | Current | Needed |
|--------|---------|--------|
| Export format | `.txt` plain text | PDF with professional layout |
| Firm branding | Text-only name/regNum/city | Logo image, firm letterhead |
| Layout | LTR text dump | RTL Hebrew layout with proper typography |
| Line items | Text list | Table with columns (description, qty, unit price, total) |
| VAT breakdown | Text line | Structured row in totals section |
| Visual design | None | Professional invoice styling (borders, colors, spacing) |

### Detailed Requirements

**R1.1 - PDF library:** Use a client-side PDF generation library. Candidates:
- **jsPDF + jsPDF-AutoTable** -- lightweight, proven, good RTL support with manual handling
- **@react-pdf/renderer** -- React-native approach, good for complex layouts but heavier
- **Recommendation:** jsPDF + jsPDF-AutoTable for simplicity and bundle size

**R1.2 - Invoice PDF layout (RTL):**
- Page direction: RTL
- Header: Firm logo (from `firmData.logo` -- Supabase Storage URL), firm name, regNum, phone, email, city
- Invoice metadata: Invoice number, date, billing period
- Client block: Client name, case number, email
- Line items table: Description | Qty | Unit Price | Total (all amounts formatted with `formatMoney()`)
- Totals section: Subtotal, VAT (18%), Total Due
- Hours summary (optional): Staff name -> hours breakdown for the billing period
- Footer: Payment terms (billing day), thank you message
- Font: Must support Hebrew characters (embed a Hebrew font or use built-in Unicode support)

**R1.3 - Data available (no new queries needed):**
- Invoice: `invoice.invoiceNum`, `invoice.date`, `invoice.items[]`, `invoice.subtotal`, `invoice.vatAmount`, `invoice.total`
- Firm: `firmData.name`, `firmData.regNum`, `firmData.phone`, `firmData.email`, `firmData.city`, `firmData.logo`
- Client: `clientName`, `clientCaseNum`, `clientEmail`, `clientBillingDay`
- Hours: `hoursEntries` filtered by invoice month (already computed as `monthHours`)

**R1.4 - Integration point:** Replace the body of `handlePrint()` in `InvoicesTab.tsx` (line 201-222). The function signature and data gathering remain the same; only the output format changes from `.txt` to `.pdf`.

**R1.5 - File naming:** `{invoiceNum}.pdf` (currently `{invoiceNum}.txt`)

### Acceptance Criteria

- [ ] Clicking the download button on an invoice downloads a `.pdf` file
- [ ] PDF is RTL with Hebrew text rendering correctly
- [ ] PDF includes firm letterhead with logo (if logo URL exists)
- [ ] PDF includes a formatted line items table
- [ ] PDF includes subtotal, VAT (18%), and total in ILS currency format
- [ ] PDF includes hours summary when hours exist for that month
- [ ] PDF renders correctly in standard PDF viewers (Chrome, Preview, Acrobat)

---

## Feature 2: Scheduled Message Processing

### Current State

- **MsgSchedulePanel** (`src/components/messaging/MsgSchedulePanel.tsx`) -- complete UI for scheduling and managing scheduled messages
- **messageService** (`src/services/messageService.ts`) -- `runScheduledMessages()` calls `supabase.rpc('process_scheduled_messages', { p_firm_id })` at line 399
- **useRunScheduledMessages** (`src/hooks/useMessages.ts`) -- React Query mutation hook, line 173
- **Database RPC** (`supabase/migrations/20260324100000_create_messaging_tables.sql`) -- `process_scheduled_messages(p_firm_id UUID)` function exists, SECURITY INVOKER, granted to authenticated
- **Cron migration** (`supabase/migrations/20260324100001_create_messaging_cron.sql`) -- `process_all_scheduled_messages()` SECURITY DEFINER wrapper + pg_cron schedule (`0 * * * *`), wrapped in DO/EXCEPTION for graceful failure on free tier

**What works today:**
- Users can schedule messages (client + template + date + channel)
- Users can cancel scheduled messages
- "Run Now" button (`handleRunNow` at MsgSchedulePanel line 118) calls `runScheduled.mutate({ firmId })` which invokes the RPC
- The RPC processes all pending messages where `send_date <= CURRENT_DATE`, inserts them into the `messages` table, and marks scheduled messages as `sent`
- Cron migration attempts to set up hourly processing but gracefully fails if pg_cron is unavailable

### Gap Analysis

This feature is **already functional**. The "Run Now" button works as a manual trigger, and the cron job is a best-effort background processor. The question is whether anything is truly missing.

| Aspect | Current | Status |
|--------|---------|--------|
| Manual trigger | "Run Now" button in MsgSchedulePanel | Working |
| Auto processing | pg_cron hourly job | Works if pg_cron available; graceful fallback |
| UI feedback | Toast with processed count | Working |
| Pending count | Displayed next to "Run Now" button | Working |
| Cancel scheduled | X button per message | Working |

**Potential minor gaps:**
1. No visual indicator of whether pg_cron is active or not (user doesn't know if auto-processing is working)
2. No indication of last cron run time
3. The "Run Now" button only appears when `pendingCount > 0` -- this is correct behavior

### Detailed Requirements

**R2.1 - Verify cron status (optional, low priority):** Consider adding a small status indicator in the schedule panel showing whether auto-processing is active. This could query `cron.job` table to check if the job exists. However, this is optional since the manual button works as fallback.

**R2.2 - No code changes required** if the existing implementation is deemed sufficient. The feature is complete:
- Scheduling works
- Manual processing works
- Auto processing works when pg_cron is available
- Graceful degradation when pg_cron is not available

**R2.3 - If enhancement is desired:** Add a small info badge or tooltip near the "Run Now" button indicating:
- "Automatic processing active" (if pg_cron job exists)
- "Manual processing only" (if pg_cron is not available)

### Acceptance Criteria

- [ ] Scheduled messages can be created with a future date
- [ ] "Run Now" button processes all pending messages due today or earlier
- [ ] Processed messages appear in the message history log
- [ ] Cancelled messages are not processed
- [ ] Toast shows count of processed messages

---

## Feature 3: Settings Page

### Current State

- **Route:** `/settings` exists in `App.tsx` (line 91) but renders `SectionPlaceholder`
- **Firm data:** `Firm` type (`src/types/firm.ts`) has: `name`, `type`, `regNum`, `phone`, `email`, `city`, `logo`, `plan`, `planLabel`, `expiry`, `defaultFee`
- **Firm service:** `firmService` (`src/services/firmService.ts`) has `updateFirm()` (line 89) supporting: `name`, `phone`, `email`, `city`, `logo`, `defaultFee`
- **Logo upload:** `firmService.uploadLogo()` (line 119) uploads to `firm-logos` bucket and returns public URL
- **Plan update:** `firmService.updatePlan()` (line 107) via `update_firm_plan` RPC
- **Auth store:** `useAuthStore` holds `firmData: Firm | null` and `setFirmData(firm, role)`
- **Subscription display:** `SubscriptionStatus` component (`src/components/dashboard/SubscriptionStatus.tsx`) shows plan info and links to `/settings`
- **DB schema:** `firms` table (`supabase/migrations/20260317100000_create_firms_table.sql`): id, name, type, reg_num, phone, email, city, logo, plan, plan_label, expiry, default_fee

**The gap:** The `/settings` route renders a placeholder. No `SettingsView` component exists. All the backend (service, types, DB) is ready -- only the UI component is missing.

### Gap Analysis

| Aspect | Current | Needed |
|--------|---------|--------|
| Settings page | SectionPlaceholder | Full settings UI |
| Firm profile editing | Service ready | Form with fields for name, phone, email, city |
| Logo management | Upload service ready | Logo upload UI with preview |
| Subscription view | Dashboard widget exists | Full subscription section in settings |
| Default fee | Field in DB | Editable field in settings |
| Theme picker | ThemePicker component exists | Include in settings |
| Language selector | LanguageSelector component exists | Include in settings |

### Detailed Requirements

**R3.1 - Create `SettingsView` component** at `src/components/settings/SettingsView.tsx`

**R3.2 - Page structure:** Tab-based or section-based layout:
- **Firm Profile** section: Editable fields for firm name, phone, email, city, registration number (read-only display), firm type (read-only display)
- **Logo** section: Current logo preview, upload button (using `firmService.uploadLogo()`), remove logo option
- **Billing Defaults** section: Default monthly fee (input in shekels, stored as agorot using `shekelToAgorot()`)
- **Subscription** section: Current plan display, expiry date, days remaining (reuse logic from `SubscriptionStatus`)
- **Preferences** section: Theme picker (existing `ThemePicker` component), Language selector (existing `LanguageSelector` component)

**R3.3 - Permission gating:** Only users with `settings.firm` permission (or superAdmin) should be able to edit firm details. Read-only view for others.

**R3.4 - Save behavior:**
- Call `firmService.updateFirm()` on save
- After successful save, update `useAuthStore` via `setFirmData()` to reflect changes immediately
- Toast notification on success/failure

**R3.5 - Data source:** `useAuthStore((s) => s.firmData)` for initial values. No new service methods needed.

### Affected Files

- `src/App.tsx` -- Replace `SectionPlaceholder` with `SettingsView` import
- `src/components/settings/SettingsView.tsx` -- **NEW FILE** -- main settings page
- `src/i18n/he.ts`, `src/i18n/ar.ts`, `src/i18n/en.ts` -- Add `settings.*` translation keys

### New Files Needed

- `src/components/settings/SettingsView.tsx` -- Settings page component

### i18n Keys Needed

- `settings.title` -- "Settings" / "הגדרות" / "الإعدادات"
- `settings.firmProfile` -- "Firm Profile" / "פרטי משרד" / "ملف المكتب"
- `settings.firmName` -- "Firm Name" / "שם המשרד" / "اسم المكتب"
- `settings.phone` -- "Phone" / "טלפון" / "هاتف"
- `settings.email` -- "Email" / "דוא״ל" / "بريد إلكتروني"
- `settings.city` -- "City" / "עיר" / "مدينة"
- `settings.regNum` -- "Registration Number" / "מספר רישום" / "رقم التسجيل"
- `settings.firmType` -- "Firm Type" / "סוג המשרד" / "نوع المكتب"
- `settings.logo` -- "Logo" / "לוגו" / "شعار"
- `settings.uploadLogo` -- "Upload Logo" / "העלאת לוגו" / "تحميل الشعار"
- `settings.removeLogo` -- "Remove Logo" / "הסרת לוגו" / "إزالة الشعار"
- `settings.defaultFee` -- "Default Monthly Fee" / "מחיר חודשי ברירת מחדל" / "الرسوم الشهرية الافتراضية"
- `settings.subscription` -- "Subscription" / "מנוי" / "الاشتراك"
- `settings.currentPlan` -- "Current Plan" / "תוכנית נוכחית" / "الخطة الحالية"
- `settings.preferences` -- "Preferences" / "העדפות" / "التفضيلات"
- `settings.theme` -- "Theme" / "ערכת נושא" / "السمة"
- `settings.language` -- "Language" / "שפה" / "اللغة"
- `settings.saveSuccess` -- "Settings saved" / "ההגדרות נשמרו" / "تم حفظ الإعدادات"
- `settings.description` -- "Manage your firm profile and preferences" / "ניהול פרטי המשרד והעדפות" / "إدارة ملف المكتب والتفضيلات"

### Acceptance Criteria

- [ ] `/settings` route renders a real settings page (not a placeholder)
- [ ] Firm profile fields (name, phone, email, city) are editable and persist on save
- [ ] Logo upload works and preview updates immediately
- [ ] Default fee is editable (displayed in shekels, saved as agorot)
- [ ] Subscription plan and expiry are displayed
- [ ] Theme and language pickers are functional
- [ ] Permission-gated: only `settings.firm` or superAdmin can edit
- [ ] All text uses `t()` with keys in all 3 language files
- [ ] RTL layout is correct

---

## Feature 4: Document Generation from Templates

### Current State

- **DocGenModal** (`src/components/documents/DocGenModal.tsx`) -- fully functional modal with:
  - 5 template types: fine cancellation, extension request, withholding exemption, appeal, custom
  - Template variable system: client name, case number, firm details, addressee, custom body
  - Live preview pane (RTL, Hebrew)
  - Download as `.txt` file
  - Save to Supabase Storage via `useSaveGeneratedDocument()` hook
- **DocumentsTab** (`src/components/documents/DocumentsTab.tsx`) -- integrates DocGenModal with "Generate Document" button
- **documentService** (`src/services/documentService.ts`) -- full CRUD + upload to `client-documents` bucket
- **useSaveGeneratedDocument** (`src/hooks/useDocuments.ts`) -- saves generated text to storage + creates DB row with `generated: true` and `content` field
- **Folder system** -- auto-saves to "correspondence" folder, with fallback creation

**What works today:**
- Selecting a template type
- Filling in variables (addressee, title, subject for custom)
- Live RTL preview of the generated letter
- Download as `.txt` file
- Save to Supabase Storage in the correspondence folder
- Document appears in the client's document table

### Gap Analysis

This feature is **more complete than expected**. The full flow works:
1. User clicks "Generate Document" in DocumentsTab
2. DocGenModal opens with template picker + variable inputs
3. Live preview shows the generated letter
4. User can download as `.txt` or save to client's folder in Supabase Storage

| Aspect | Current | Status |
|--------|---------|--------|
| Template selection | 5 templates (fine, extension, withholding, appeal, custom) | Working |
| Variable auto-fill | Client name, case num, firm details from auth store | Working |
| User input variables | Addressee, title, subject, custom body | Working |
| Live preview | RTL Hebrew preview pane | Working |
| Download | `.txt` file | Working (but not PDF) |
| Save to storage | Supabase Storage + DB row | Working |
| Link to client folder | Auto-saves to correspondence folder | Working |

**The only gap is similar to Feature 1:** generated documents are `.txt` files, not PDFs. If PDF output is desired for document generation too, it would follow the same approach as invoices.

### Detailed Requirements

**R4.1 - If PDF output is desired for documents:** Apply the same PDF generation approach from Feature 1 (jsPDF) to generate formal letters as PDF with:
- RTL Hebrew layout
- Firm letterhead (logo, name, contact details)
- Formal letter formatting
- Save as `.pdf` instead of `.txt`

**R4.2 - If current `.txt` is acceptable:** No changes needed. The feature is complete.

**R4.3 - Minor enhancements (optional):**
- The download filename includes the Hebrew date (`toLocaleDateString('he-IL')`) which may include characters that cause issues on some OS file systems. Consider using ISO date format for filenames.

### Acceptance Criteria

- [ ] Document generation modal opens from client's Documents tab
- [ ] All 5 templates generate correctly with auto-filled variables
- [ ] Live preview displays the generated letter in RTL
- [ ] Download produces a file (`.txt` or `.pdf` per decision)
- [ ] Save stores document in Supabase Storage and creates a DB record
- [ ] Saved document appears in client's document list

---

## Feature 5: Report Export

### Current State

- **ReportExport** (`src/components/reports/ReportExport.tsx`) -- complete export component with:
  - Dropdown menu with TXT and CSV export options
  - `generateTxtContent()` -- formatted text report for all 3 tabs
  - `generateCsvContent()` -- proper CSV with UTF-8 BOM, CSV formula injection protection
  - Handles all 3 report types: Hours by Staff, Hours by Client, Filing Status
  - All text uses `t()` translation function
- **ReportsView** (`src/components/reports/ReportsView.tsx`) -- integrates ReportExport in the page header
- **Report sub-components** -- `HoursByStaffReport`, `HoursByClientReport`, `FilingStatusReport`
- **reportService** (`src/services/reportService.ts`) -- `hoursByFirm()`, `filingsByFirm()`
- **report-utils** (`src/lib/report-utils.ts`) -- `aggregateHoursByStaff()`, `aggregateHoursByClient()`, `aggregateFilingStatus()`
- **exportService** (`src/services/exportService.ts`) -- additional export for clients, filings, tasks (separate from report export)

**What works today:**
- All 3 report tabs render data from Supabase
- Export button appears for users with `reports.export` permission
- CSV export: UTF-8 BOM, proper escaping, formula injection protection (`sanitizeCsvValue`)
- TXT export: formatted text with separators, aggregated data
- Date range filtering for hours reports
- Year filtering for filing status report

### Gap Analysis

This feature appears **fully complete**.

| Aspect | Current | Status |
|--------|---------|--------|
| Hours by Staff export | TXT + CSV | Working |
| Hours by Client export | TXT + CSV | Working |
| Filing Status export | TXT + CSV | Working |
| CSV formula injection protection | `sanitizeCsvValue()` | Working |
| UTF-8 BOM for Excel compatibility | `\uFEFF` prefix | Working |
| Permission gating | `reports.export` | Working |
| Translated headers | Uses `t()` in CSV/TXT | Working |
| Date range filtering | Reflected in export | Working |

**No gaps identified.** The export functionality covers all 3 report types in both TXT and CSV formats with proper security, encoding, and i18n.

### Detailed Requirements

**R5.1 - No changes needed.** Report export is complete and functional.

**R5.2 - Optional enhancement (if desired):** Add Excel (.xlsx) export using a library like SheetJS. This would provide native Excel formatting, multiple sheets, and better Hebrew rendering. However, CSV with BOM already opens correctly in Excel.

### Acceptance Criteria

- [ ] Export button visible for users with `reports.export` permission
- [ ] CSV export produces valid CSV with Hebrew characters and BOM
- [ ] TXT export produces readable formatted text
- [ ] All 3 report tabs (hoursByStaff, hoursByClient, filingStatus) can be exported
- [ ] Exported data matches the filtered view (date range / year selection)

---

## Summary: Actual Work Needed

| Feature | Effort | Status |
|---------|--------|--------|
| 1. Invoice PDF Generation | Medium | Needs new PDF generation logic (replace `.txt` with `.pdf`) |
| 2. Scheduled Message Processing | None/Low | Already functional; optional cron status indicator |
| 3. Settings Page | Medium | New UI component needed; backend is ready |
| 4. Document Generation | None/Low | Already functional; optional PDF upgrade |
| 5. Report Export | None | Complete |

**True gaps requiring implementation:**
1. **Invoice PDF** -- Replace `buildInvoiceText()` + `handlePrint()` with PDF generation
2. **Settings Page** -- Create `SettingsView` component, wire up to route

**Already complete (verify only):**
3. Scheduled message processing
4. Document generation from templates
5. Report export

---

## Shared Concerns

### i18n
- Settings page needs approximately 20 new translation keys across all 3 language files
- Invoice PDF may need a few new keys for PDF-specific labels
- All existing features already use `t()` properly

### RTL
- Invoice PDF must be generated with RTL text direction and Hebrew font support
- Settings page must follow RTL layout conventions (logical properties: `ms-*/me-*/ps-*/pe-*`)
- All existing components already handle RTL correctly

### Theme
- Settings page must use CSS variables (`var(--bg)`, `var(--text)`, etc.) for theme compatibility
- PDF generation is not affected by theme (PDFs have fixed styling)
- Theme picker component already exists as `ThemePicker` in shared components

### Types
- No new TypeScript types needed for any feature
- All types (`Invoice`, `InvoiceItem`, `Firm`, `LegalDocument`, `MessageTemplate`, etc.) are fully defined
- Shared type exports are centralized in `src/types/index.ts`

### Dependencies
- **Invoice PDF** depends on: a PDF library (new dependency -- jsPDF recommended), a Hebrew font file
- **Settings Page** depends on: existing `firmService`, `useAuthStore`, `ThemePicker`, `LanguageSelector`
- No cross-feature dependencies between the 5 integrations

### Risks
1. **Hebrew font in PDF** -- jsPDF requires embedding a font that supports Hebrew characters. Need to include a Hebrew-compatible font file (e.g., Noto Sans Hebrew) in the bundle. This adds to bundle size (~50-100KB).
2. **Logo in PDF** -- Firm logos are stored as Supabase public URLs. Need to handle CORS when fetching the image for PDF embedding, or convert to base64 first.
3. **Settings permission model** -- The `settings.firm` permission exists in the permission groups but needs to be verified that it's assigned to the right roles.
