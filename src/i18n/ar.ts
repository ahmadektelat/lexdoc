// Arabic translations
export const ar: Record<string, string> = {
  // Navigation
  'nav.dashboard': 'لوحة التحكم',
  'nav.clients': 'العملاء',
  'nav.filings': 'التقارير الضريبية',
  'nav.billing': 'الفواتير والمحاسبة',
  'nav.staff': 'الموظفون',
  'nav.crm': 'إدارة علاقات العملاء',
  'nav.documents': 'المستندات',
  'nav.reports': 'التقارير',
  'nav.messaging': 'الرسائل',
  'nav.permissions': 'الصلاحيات',
  'nav.audit': 'سجل النشاط',
  'nav.backup': 'النسخ الاحتياطي',
  'nav.settings': 'الإعدادات',

  // Common
  'common.save': 'حفظ',
  'common.cancel': 'إلغاء',
  'common.delete': 'حذف',
  'common.edit': 'تعديل',
  'common.add': 'إضافة',
  'common.search': 'بحث',
  'common.filter': 'تصفية',
  'common.export': 'تصدير',
  'common.import': 'استيراد',
  'common.close': 'إغلاق',
  'common.confirm': 'تأكيد',
  'common.back': 'رجوع',
  'common.next': 'التالي',
  'common.loading': 'جاري التحميل...',
  'common.noResults': 'لا توجد نتائج',
  'common.actions': 'إجراءات',
  'common.status': 'الحالة',
  'common.date': 'التاريخ',
  'common.name': 'الاسم',
  'common.phone': 'الهاتف',
  'common.email': 'البريد الإلكتروني',
  'common.notes': 'ملاحظات',
  'common.type': 'النوع',
  'common.all': 'الكل',

  // Auth
  'auth.login': 'تسجيل الدخول',
  'auth.logout': 'تسجيل الخروج',
  'auth.email': 'البريد الإلكتروني',
  'auth.password': 'كلمة المرور',
  'auth.forgotPassword': 'نسيت كلمة المرور',
  'auth.register': 'التسجيل',

  // Dashboard
  'dashboard.title': 'لوحة التحكم',
  'dashboard.welcome': 'مرحباً',
  'dashboard.totalClients': 'إجمالي العملاء',
  'dashboard.upcomingFilings': 'تقارير قادمة',
  'dashboard.pendingTasks': 'مهام معلقة',
  'dashboard.monthlyRevenue': 'الإيرادات الشهرية',

  // Clients
  'clients.title': 'العملاء',
  'clients.addNew': 'إضافة عميل جديد',
  'clients.name': 'اسم العميل',
  'clients.type': 'نوع العميل',
  'clients.taxId': 'الرقم الضريبي',
  'clients.type.company': 'شركة',
  'clients.type.selfEmployed': 'مستقل مرخص',
  'clients.type.economic': 'مستقل معفى',
  'clients.type.private': 'خاص',

  // Filings
  'filings.title': 'التقارير الضريبية',
  'filings.vatReport': 'تقرير ضريبة القيمة المضافة',
  'filings.taxAdvances': 'سلف ضريبة الدخل',
  'filings.incomeTaxDeductions': 'خصومات ضريبة الدخل',
  'filings.niiDeductions': 'خصومات التأمين الوطني',
  'filings.dueDate': 'تاريخ الاستحقاق',
  'filings.status.pending': 'معلق',
  'filings.status.filed': 'تم التقديم',
  'filings.status.late': 'متأخر',

  // Billing
  'billing.title': 'الفواتير والمحاسبة',
  'billing.invoiceTotal': 'إجمالي الفاتورة',
  'billing.createInvoice': 'إنشاء فاتورة',
  'billing.monthlyFee': 'رسوم شهرية',
  'billing.hourly': 'بالساعة',
  'billing.oneTime': 'لمرة واحدة',
  'billing.vat': 'ض.ق.م',
  'billing.subtotal': 'المبلغ قبل الضريبة',
  'billing.total': 'الإجمالي',

  // Staff
  'staff.title': 'الموظفون',
  'staff.addMember': 'إضافة موظف',
  'staff.role': 'الدور',
  'staff.active': 'نشط',

  // Errors
  'errors.generic': 'حدث خطأ',
  'errors.notFound': 'غير موجود',
  'errors.unauthorized': 'غير مصرح',
  'errors.networkError': 'خطأ في الشبكة',
  'errors.saveFailed': 'فشل الحفظ',

  // Theme
  'theme.sky': 'سماوي',
  'theme.dark': 'داكن',
  'theme.blue': 'أزرق',
  'theme.label': 'المظهر',

  // Language
  'language.hebrew': 'עברית',
  'language.arabic': 'عربية',
  'language.english': 'English',
  'language.label': 'اللغة',

  // Shared component keys (added for Phase 1)
  'common.confirmAction': 'تأكيد الإجراء',
  'common.areYouSure': 'هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.',
  'common.noData': 'لا توجد بيانات للعرض',
  'common.searchPlaceholder': 'بحث...',
  'common.page': 'صفحة',
  'common.of': 'من',
  'common.rowsPerPage': 'صفوف في الصفحة',
  'common.previous': 'السابق',
  'common.required': 'حقل مطلوب',
  'common.showing': 'عرض',
  'common.results': 'نتائج',

  // Status labels
  'status.filed': 'تم التقديم',
  'status.pending': 'معلق',
  'status.late': 'متأخر',
  'status.active': 'نشط',
  'status.archived': 'مؤرشف',
  'status.sent': 'تم الإرسال',
  'status.paid': 'مدفوع',
  'status.open': 'مفتوح',
  'status.done': 'مكتمل',
  'status.cancelled': 'ملغى',
  'status.failed': 'فشل',

  // Priority labels
  'priority.high': 'عالية',
  'priority.medium': 'متوسطة',
  'priority.low': 'منخفضة',

  // Staff roles
  'staffRoles.partner': 'شريك',
  'staffRoles.attorney': 'محامي',
  'staffRoles.juniorAttorney': 'محامي متدرب',
  'staffRoles.accountant': 'محاسب',
  'staffRoles.consultant': 'مستشار',
  'staffRoles.secretary': 'سكرتير/ة',
  'staffRoles.manager': 'مدير/ة',
  'staffRoles.student': 'طالب/ة',

  // Task categories
  'taskCategories.client': 'عميل',
  'taskCategories.taxAuth': 'مصلحة الضرائب',
  'taskCategories.nii': 'التأمين الوطني',
  'taskCategories.internal': 'داخلي',

  // Interaction channels
  'channels.call': 'مكالمة',
  'channels.email': 'بريد إلكتروني',
  'channels.meeting': 'اجتماع',
  'channels.letter': 'رسالة',
  'channels.portal': 'بوابة',

  // Document sensitivity
  'sensitivity.internal': 'داخلي',
  'sensitivity.confidential': 'سري',
  'sensitivity.restricted': 'مقيد',
  'sensitivity.public': 'عام',

  // Client types
  'clientTypes.selfEmployed': 'عامل مستقل',
  'clientTypes.company': 'شركة',
  'clientTypes.economic': 'معفى',
  'clientTypes.private': 'خاص',

  // System roles
  'systemRoles.admin': 'مدير النظام',
  'systemRoles.adminDesc': 'وصول كامل لجميع النظام',
  'systemRoles.editor': 'محرر',
  'systemRoles.editorDesc': 'تحرير وعرض جميع الوحدات',
  'systemRoles.viewer': 'مشاهد',
  'systemRoles.viewerDesc': 'عرض فقط',
  'systemRoles.manager': 'مدير',
  'systemRoles.managerDesc': 'إدارة الفريق والعملاء',

  // Subscription plans
  'subscriptionPlans.monthly': 'شهري',
  'subscriptionPlans.yearly': 'سنوي',
  'subscriptionPlans.twoYear': 'سنتين',

  // Permission labels
  'permissions.clients.view': 'عرض العملاء',
  'permissions.clients.create': 'إضافة عميل',
  'permissions.clients.edit': 'تعديل عميل',
  'permissions.clients.delete': 'حذف عميل',
  'permissions.filings.view': 'عرض التقارير',
  'permissions.filings.create': 'إضافة تقرير',
  'permissions.filings.edit': 'تعديل تقرير',
  'permissions.filings.delete': 'حذف تقرير',
  'permissions.billing.view': 'عرض الفواتير',
  'permissions.billing.create': 'إضافة فاتورة',
  'permissions.billing.edit': 'تعديل فاتورة',
  'permissions.billing.delete': 'حذف فاتورة',
  'permissions.billing.invoices': 'إدارة الفواتير',
  'permissions.staff.view': 'عرض الفريق',
  'permissions.staff.manage': 'إدارة الفريق',
  'permissions.crm.view': 'عرض جهات الاتصال',
  'permissions.crm.manage': 'إدارة جهات الاتصال',
  'permissions.documents.view': 'عرض المستندات',
  'permissions.documents.upload': 'رفع المستندات',
  'permissions.documents.delete': 'حذف المستندات',
  'permissions.reports.view': 'عرض التقارير',
  'permissions.reports.export': 'تصدير التقارير',
  'permissions.messaging.view': 'عرض الرسائل',
  'permissions.messaging.send': 'إرسال الرسائل',
  'permissions.settings.roles': 'إدارة الصلاحيات',
  'permissions.settings.firm': 'إعدادات المكتب',
  'permissions.settings.audit': 'عرض سجل النشاط',
  'permissions.settings.backup': 'نسخ احتياطي واستعادة',
};
