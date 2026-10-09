export type LocalizedText = { ar: string; en: string };
export const localized = (ar: string, en: string): LocalizedText => ({ ar, en });

// Only application-authored text may be displayed verbatim.
export class LocalizedError extends Error {
  readonly translations: LocalizedText;
  constructor(ar: string, en: string) {
    super(en);
    this.translations = localized(ar, en);
  }
}

export function errorMessage(error: unknown, ar: boolean): string {
  const lang = ar ? 'ar' : 'en';
  if (error instanceof LocalizedError) return error.translations[lang];
  const details = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  const code = String(details.code ?? '');
  const message = String(details.message ?? '');
  let result: LocalizedText;
  if (code === '42501') {
    result = localized('لا تملك صلاحية تنفيذ هذه العملية. تواصل مع إدارة الأكاديمية.', 'You do not have permission for this action. Contact academy management.');
  } else if (code === '23505') {
    result = localized('هذه البيانات مسجلة مسبقًا. راجع السجل الموجود قبل المحاولة مجددًا.', 'This information is already registered. Check the existing record before retrying.');
  } else if (['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code)) {
    result = localized('محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'Too many attempts. Wait a moment and try again.');
  } else if (message === 'At least one child is required') {
    result = localized('يجب إبقاء طفل واحد على الأقل في الطلب.', 'Keep at least one child in the application.');
  } else if (message === 'Application cannot be changed after submission') {
    result = localized('لا يمكن تعديل الطلب بعد إرساله للمراجعة.', 'The application cannot be changed after submission.');
  } else if (message === 'Only draft or needs-info applications can be deleted by the applicant') {
    result = localized('يمكنك حذف المسودة أو الطلب المعاد لاستكمال البيانات فقط.', 'You can only delete a draft or an application returned for more information.');
  } else if (/^(Failed to fetch|NetworkError|Load failed)$/.test(message)) {
    result = localized('تعذر الاتصال. تحقق من الإنترنت ثم حاول مجددًا.', 'Unable to connect. Check your internet connection and try again.');
  } else {
    result = localized('تعذر إتمام العملية. حاول مجددًا، وإذا استمرت المشكلة تواصل مع إدارة الأكاديمية.', 'Unable to complete this action. Try again, or contact academy management if the problem continues.');
  }
  return result[lang];
}
