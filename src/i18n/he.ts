// Hebrew translations (primary language)
export const he: Record<string, string> = {
  // Navigation
  'nav.dashboard': 'לוח בקרה',
  'nav.clients': 'לקוחות',
  'nav.filings': 'דיווחים',
  'nav.billing': 'חיוב וחשבוניות',
  'nav.staff': 'צוות',
  'nav.crm': 'ניהול קשרי לקוחות',
  'nav.documents': 'מסמכים',
  'nav.reports': 'דוחות',
  'nav.messaging': 'הודעות',
  'nav.permissions': 'הרשאות',
  'nav.audit': 'יומן פעילות',
  'nav.backup': 'גיבוי',
  'nav.settings': 'הגדרות',

  // Common
  'common.save': 'שמירה',
  'common.cancel': 'ביטול',
  'common.delete': 'מחיקה',
  'common.edit': 'עריכה',
  'common.add': 'הוספה',
  'common.search': 'חיפוש',
  'common.filter': 'סינון',
  'common.export': 'ייצוא',
  'common.import': 'ייבוא',
  'common.close': 'סגירה',
  'common.confirm': 'אישור',
  'common.back': 'חזרה',
  'common.next': 'הבא',
  'common.loading': 'טוען...',
  'common.noResults': 'לא נמצאו תוצאות',
  'common.actions': 'פעולות',
  'common.status': 'סטטוס',
  'common.date': 'תאריך',
  'common.name': 'שם',
  'common.phone': 'טלפון',
  'common.email': 'דוא"ל',
  'common.notes': 'הערות',
  'common.type': 'סוג',
  'common.all': 'הכל',

  // Auth
  'auth.login': 'התחברות',
  'auth.logout': 'יציאה',
  'auth.email': 'דואר אלקטרוני',
  'auth.password': 'סיסמה',
  'auth.forgotPassword': 'שכחתי סיסמה',
  'auth.register': 'הרשמה',

  // Dashboard
  'dashboard.title': 'לוח בקרה',
  'dashboard.welcome': 'ברוכים הבאים',
  'dashboard.totalClients': 'סה"כ לקוחות',
  'dashboard.upcomingFilings': 'דיווחים קרובים',
  'dashboard.pendingTasks': 'משימות ממתינות',
  'dashboard.monthlyRevenue': 'הכנסה חודשית',

  // Clients
  'clients.title': 'לקוחות',
  'clients.addNew': 'הוספת לקוח חדש',
  'clients.name': 'שם הלקוח',
  'clients.type': 'סוג לקוח',
  'clients.taxId': 'מספר עוסק / ח.פ.',
  'clients.type.company': 'חברה',
  'clients.type.selfEmployed': 'עוסק מורשה',
  'clients.type.economic': 'עוסק פטור',
  'clients.type.private': 'פרטי',

  // Filings
  'filings.title': 'דיווחים',
  'filings.vatReport': 'דוח מע"מ',
  'filings.taxAdvances': 'מקדמות מס הכנסה',
  'filings.incomeTaxDeductions': 'ניכויים מס הכנסה',
  'filings.niiDeductions': 'ניכויים ביטוח לאומי',
  'filings.dueDate': 'תאריך יעד',
  'filings.status.pending': 'ממתין',
  'filings.status.filed': 'הוגש',
  'filings.status.late': 'באיחור',

  // Billing
  'billing.title': 'חיוב וחשבוניות',
  'billing.invoiceTotal': 'סה"כ חשבונית',
  'billing.createInvoice': 'יצירת חשבונית',
  'billing.monthlyFee': 'אגרה חודשית',
  'billing.hourly': 'שעתי',
  'billing.oneTime': 'חד-פעמי',
  'billing.vat': 'מע"מ',
  'billing.subtotal': 'סכום לפני מע"מ',
  'billing.total': 'סה"כ',

  // Staff
  'staff.title': 'צוות',
  'staff.addMember': 'הוספת עובד',
  'staff.role': 'תפקיד',
  'staff.active': 'פעיל',

  // Errors
  'errors.generic': 'אירעה שגיאה',
  'errors.notFound': 'לא נמצא',
  'errors.unauthorized': 'אין הרשאה',
  'errors.networkError': 'שגיאת רשת',
  'errors.saveFailed': 'השמירה נכשלה',

  // Theme
  'theme.sky': 'שמיים',
  'theme.dark': 'כהה',
  'theme.blue': 'כחול',
  'theme.label': 'ערכת נושא',

  // Language
  'language.hebrew': 'עברית',
  'language.arabic': 'عربية',
  'language.english': 'English',
  'language.label': 'שפה',

  // Shared component keys (added for Phase 1)
  'common.confirmAction': 'אישור פעולה',
  'common.areYouSure': 'האם אתה בטוח? לא ניתן לבטל פעולה זו.',
  'common.noData': 'אין נתונים להצגה',
  'common.searchPlaceholder': 'חיפוש...',
  'common.page': 'עמוד',
  'common.of': 'מתוך',
  'common.rowsPerPage': 'שורות בעמוד',
  'common.previous': 'הקודם',
  'common.required': 'שדה חובה',
  'common.showing': 'מציג',
  'common.results': 'תוצאות',

  // Status labels
  'status.filed': 'הוגש',
  'status.pending': 'ממתין',
  'status.late': 'באיחור',
  'status.active': 'פעיל',
  'status.archived': 'בארכיון',
  'status.sent': 'נשלח',
  'status.paid': 'שולם',
  'status.open': 'פתוח',
  'status.done': 'הושלם',
  'status.cancelled': 'בוטל',
  'status.failed': 'נכשל',

  // Priority labels
  'priority.high': 'גבוהה',
  'priority.medium': 'בינונית',
  'priority.low': 'נמוכה',

  // Staff roles
  'staffRoles.partner': 'שותף',
  'staffRoles.attorney': 'עורך דין',
  'staffRoles.juniorAttorney': 'עורך דין מתמחה',
  'staffRoles.accountant': 'רואה חשבון',
  'staffRoles.consultant': 'יועץ',
  'staffRoles.secretary': 'מזכיר/ה',
  'staffRoles.manager': 'מנהל/ת',
  'staffRoles.student': 'סטודנט/ית',

  // Task categories
  'taskCategories.client': 'לקוח',
  'taskCategories.taxAuth': 'רשות המסים',
  'taskCategories.nii': 'ביטוח לאומי',
  'taskCategories.internal': 'פנימי',

  // Interaction channels
  'channels.call': 'שיחה',
  'channels.email': 'דוא"ל',
  'channels.meeting': 'פגישה',
  'channels.letter': 'מכתב',
  'channels.portal': 'פורטל',

  // Document sensitivity
  'sensitivity.internal': 'פנימי',
  'sensitivity.confidential': 'חסוי',
  'sensitivity.restricted': 'מוגבל',
  'sensitivity.public': 'ציבורי',

  // Client types
  'clientTypes.selfEmployed': 'עוסק מורשה',
  'clientTypes.company': 'חברה',
  'clientTypes.economic': 'עוסק פטור',
  'clientTypes.private': 'פרטי',

  // System roles
  'systemRoles.admin': 'מנהל מערכת',
  'systemRoles.adminDesc': 'גישה מלאה לכל המערכת',
  'systemRoles.editor': 'עורך',
  'systemRoles.editorDesc': 'עריכה וצפייה בכל המודולים',
  'systemRoles.viewer': 'צופה',
  'systemRoles.viewerDesc': 'צפייה בלבד',
  'systemRoles.manager': 'מנהל',
  'systemRoles.managerDesc': 'ניהול צוות ולקוחות',

  // Subscription plans
  'subscriptionPlans.monthly': 'חודשי',
  'subscriptionPlans.yearly': 'שנתי',
  'subscriptionPlans.twoYear': 'דו-שנתי',

  // Permission labels
  'permissions.clients.view': 'צפייה בלקוחות',
  'permissions.clients.create': 'הוספת לקוח',
  'permissions.clients.edit': 'עריכת לקוח',
  'permissions.clients.delete': 'מחיקת לקוח',
  'permissions.filings.view': 'צפייה בדיווחים',
  'permissions.filings.create': 'הוספת דיווח',
  'permissions.filings.edit': 'עריכת דיווח',
  'permissions.filings.delete': 'מחיקת דיווח',
  'permissions.billing.view': 'צפייה בחיובים',
  'permissions.billing.create': 'הוספת חיוב',
  'permissions.billing.edit': 'עריכת חיוב',
  'permissions.billing.delete': 'מחיקת חיוב',
  'permissions.billing.invoices': 'ניהול חשבוניות',
  'permissions.staff.view': 'צפייה בצוות',
  'permissions.staff.manage': 'ניהול צוות',
  'permissions.crm.view': 'צפייה באנשי קשר',
  'permissions.crm.manage': 'ניהול אנשי קשר',
  'permissions.documents.view': 'צפייה במסמכים',
  'permissions.documents.upload': 'העלאת מסמכים',
  'permissions.documents.delete': 'מחיקת מסמכים',
  'permissions.reports.view': 'צפייה בדוחות',
  'permissions.reports.export': 'ייצוא דוחות',
  'permissions.messaging.view': 'צפייה בהודעות',
  'permissions.messaging.send': 'שליחת הודעות',
  'permissions.settings.roles': 'ניהול הרשאות',
  'permissions.settings.firm': 'הגדרות משרד',
  'permissions.settings.audit': 'צפייה ביומן פעילות',
  'permissions.settings.backup': 'גיבוי ושחזור',
};
