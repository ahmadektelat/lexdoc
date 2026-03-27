// CREATED: 2026-03-23
// UPDATED: 2026-03-26 15:00 IST (Jerusalem)
//          - Moved cachedLogoBase64 to module level (review fix)
//          - Upgraded download and save from .txt to .pdf using dynamic import of shared PDF utility
//          - Fixed filename to use ISO date format instead of toLocaleDateString('he-IL')

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSaveGeneratedDocument, useFolders } from '@/hooks/useDocuments';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Save } from 'lucide-react';
import { toast } from 'sonner';

interface DocGenModalProps {
  clientId: string;
  clientName: string;
  clientCaseNum: string;
  onSuccess: () => void;
  onClose: () => void;
}

interface TemplateVars {
  clientName: string;
  caseNum: string;
  firmName: string;
  firmPhone: string;
  firmEmail: string;
  date: string;
  addressee: string;
  addresseeTitle: string;
  subject: string;
  customBody: string;
}

const TEMPLATES = [
  { id: 'fine', label: 'documents.templateFine' },
  { id: 'extension', label: 'documents.templateExtension' },
  { id: 'withholding', label: 'documents.templateWithholding' },
  { id: 'appeal', label: 'documents.templateAppeal' },
  { id: 'custom', label: 'documents.templateCustom' },
] as const;

function generateFineTemplate(v: TemplateVars): string {
  return `${v.date}

לכבוד
${v.addressee}
${v.addresseeTitle}

הנדון: ${v.clientName} - ת.ז./ח.פ. ${v.caseNum}
ביטול קנס

${v.addresseeTitle} הנכבד/ה,

1. אנו פונים אליכם בשם לקוחנו, ${v.clientName}, בבקשה לביטול הקנס שהוטל.

2. לקוחנו פעל בתום לב ובהתאם להנחיות שניתנו לו, ולפיכך מבוקש ביטול הקנס.

3. נודה לטיפולכם המהיר בעניין.

בכבוד רב,
${v.firmName}
טל: ${v.firmPhone}
דוא"ל: ${v.firmEmail}`;
}

function generateExtensionTemplate(v: TemplateVars): string {
  return `${v.date}

לכבוד
${v.addressee}
${v.addresseeTitle}

הנדון: ${v.clientName} - ת.ז./ח.פ. ${v.caseNum}
בקשת ארכה

${v.addresseeTitle} הנכבד/ה,

1. אנו פונים אליכם בשם לקוחנו, ${v.clientName}, בבקשה להארכת המועד להגשת המסמכים הנדרשים.

2. הארכה מתבקשת לצורך השלמת איסוף המסמכים והנתונים הדרושים.

3. נודה לאישורכם בהקדם.

בכבוד רב,
${v.firmName}
טל: ${v.firmPhone}
דוא"ל: ${v.firmEmail}`;
}

function generateWithholdingTemplate(v: TemplateVars): string {
  return `${v.date}

לכבוד
${v.addressee}
${v.addresseeTitle}

הנדון: ${v.clientName} - ת.ז./ח.פ. ${v.caseNum}
בקשה לפטור מניכוי מס במקור

${v.addresseeTitle} הנכבד/ה,

1. אנו פונים אליכם בשם לקוחנו, ${v.clientName}, בבקשה לקבלת פטור מניכוי מס במקור.

2. לקוחנו עומד בכל התנאים הנדרשים לקבלת הפטור המבוקש.

3. מצורפים המסמכים התומכים בבקשה.

בכבוד רב,
${v.firmName}
טל: ${v.firmPhone}
דוא"ל: ${v.firmEmail}`;
}

function generateAppealTemplate(v: TemplateVars): string {
  return `${v.date}

לכבוד
${v.addressee}
${v.addresseeTitle}

הנדון: ${v.clientName} - ת.ז./ח.פ. ${v.caseNum}
השגה על שומה

${v.addresseeTitle} הנכבד/ה,

1. אנו פונים אליכם בשם לקוחנו, ${v.clientName}, בהשגה על השומה שנקבעה.

2. לטענתנו, השומה אינה משקפת נכונה את מצבו הכלכלי של לקוחנו ויש לבחון אותה מחדש.

3. מצורפים מסמכים ונתונים התומכים בהשגה זו.

4. נבקש לקיים דיון בעניין בהקדם האפשרי.

בכבוד רב,
${v.firmName}
טל: ${v.firmPhone}
דוא"ל: ${v.firmEmail}`;
}

function generateCustomTemplate(v: TemplateVars): string {
  return `${v.date}

לכבוד
${v.addressee}
${v.addresseeTitle}

הנדון: ${v.clientName} - ת.ז./ח.פ. ${v.caseNum}
${v.subject}

${v.addresseeTitle} הנכבד/ה,

${v.customBody}

בכבוד רב,
${v.firmName}
טל: ${v.firmPhone}
דוא"ל: ${v.firmEmail}`;
}

const TEMPLATE_GENERATORS: Record<string, (v: TemplateVars) => string> = {
  fine: generateFineTemplate,
  extension: generateExtensionTemplate,
  withholding: generateWithholdingTemplate,
  appeal: generateAppealTemplate,
  custom: generateCustomTemplate,
};

// Logo base64 cache — loaded once per session
let cachedLogoBase64: string | null | undefined;

export function DocGenModal({
  clientId,
  clientName,
  clientCaseNum,
  onSuccess,
  onClose,
}: DocGenModalProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const firmData = useAuthStore((s) => s.firmData);
  const saveGenerated = useSaveGeneratedDocument();
  const { data: folders = [] } = useFolders(firmId, clientId);

  const [templateId, setTemplateId] = useState<string>('fine');
  const [addressee, setAddressee] = useState('');
  const [addresseeTitle, setAddresseeTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  const vars: TemplateVars = useMemo(() => ({
    clientName,
    caseNum: clientCaseNum,
    firmName: firmData?.name ?? '',
    firmPhone: firmData?.phone ?? '',
    firmEmail: firmData?.email ?? '',
    date: new Date().toLocaleDateString('he-IL'),
    addressee: addressee || '___',
    addresseeTitle: addresseeTitle || '___',
    subject: subject || '___',
    customBody: customBody || '___',
  }), [clientName, clientCaseNum, firmData, addressee, addresseeTitle, subject, customBody]);

  const letterText = useMemo(() => {
    const generator = TEMPLATE_GENERATORS[templateId];
    return generator ? generator(vars) : '';
  }, [templateId, vars]);

  const templateLabel = TEMPLATES.find((tpl) => tpl.id === templateId);
  const [isGenerating, setIsGenerating] = useState(false);

  function buildFileName(ext: string): string {
    const isoDate = new Date().toISOString().slice(0, 10);
    return `${t(templateLabel?.label ?? 'documents.templateCustom')}_${clientName}_${isoDate}.${ext}`;
  }

  async function generateLetterPdf(): Promise<{ doc: import('jspdf').jsPDF } | null> {
    // Dynamic import for lazy loading PDF modules
    const { createPdfDoc, renderLetterhead, fetchImageAsBase64, PAGE_WIDTH, MARGIN } = await import('@/lib/pdf');

    if (cachedLogoBase64 === undefined) {
      cachedLogoBase64 = await fetchImageAsBase64(firmData?.logo);
    }

    const doc = createPdfDoc();
    let y = renderLetterhead(doc, firmData, cachedLogoBase64);
    const maxWidth = PAGE_WIDTH - 2 * MARGIN;
    const pageHeight = 297; // A4 height in mm
    const bottomMargin = 15;

    doc.setFontSize(10);
    const lines = letterText.split('\n');

    for (const line of lines) {
      if (line.trim() === '') {
        y += 4;
      } else {
        const wrappedLines = doc.splitTextToSize(line, maxWidth);
        for (const wl of wrappedLines) {
          if (y > pageHeight - bottomMargin) {
            doc.addPage();
            y = MARGIN;
          }
          doc.text(wl, PAGE_WIDTH - MARGIN, y, { align: 'right' });
          y += 5;
        }
      }
    }

    return { doc };
  }

  async function handleDownload() {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await generateLetterPdf();
      if (result) {
        result.doc.save(buildFileName('pdf'));
      }
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!firmId || isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await generateLetterPdf();
      if (!result) return;

      const pdfBlob = result.doc.output('blob');
      const correspondenceFolder = folders.find((f) => f.name === 'התכתבויות');
      const fileName = buildFileName('pdf');

      saveGenerated.mutate(
        {
          firmId,
          clientId,
          folderId: correspondenceFolder?.id ?? null,
          name: fileName,
          content: letterText,
          blob: pdfBlob,
        },
        {
          onSuccess: () => {
            onSuccess();
            onClose();
          },
        }
      );
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('documents.generateDocument')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Settings */}
          <div className="space-y-4">
            <FormField label={t('documents.selectTemplate')}>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {t(tpl.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label={t('documents.addressee')}>
              <Input
                value={addressee}
                onChange={(e) => setAddressee(e.target.value)}
              />
            </FormField>

            <FormField label={t('documents.addresseeTitle')}>
              <Input
                value={addresseeTitle}
                onChange={(e) => setAddresseeTitle(e.target.value)}
              />
            </FormField>

            {templateId === 'custom' && (
              <>
                <FormField label={t('documents.subject')}>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </FormField>
                <FormField label={t('documents.customBody')}>
                  <textarea
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                  />
                </FormField>
              </>
            )}
          </div>

          {/* Right: Preview */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t('documents.preview')}
            </h4>
            <div
              className="border rounded-lg p-4 bg-muted/20 min-h-[300px] max-h-[400px] overflow-y-auto"
              dir="rtl"
            >
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                {letterText}
              </pre>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={handleDownload} disabled={isGenerating}>
            <Download className="h-4 w-4 me-2" />
            {isGenerating ? t('documents.generatingPdf') : t('documents.downloadLetter')}
          </Button>
          <Button onClick={handleSave} disabled={saveGenerated.isPending || isGenerating}>
            <Save className="h-4 w-4 me-2" />
            {t('documents.saveToFolder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
