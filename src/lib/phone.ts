export function normalizeWhatsappPhone(phone: string): string {
 const digits = phone.replace(/[^0-9]/g, '');
 if (digits.length === 8) return '973' + digits;
 return digits.startsWith('00') ? digits.slice(2) : digits;
}
