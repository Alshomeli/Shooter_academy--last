/** Encode untrusted text as a spreadsheet-safe CSV cell. */
export function csvCell(value: unknown): string {
 const text = Array.from(String(value ?? ''), char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('');
 const safe = /^\s*[=+@-]/.test(text) ? "'" + text : text;
 return '"' + safe.replace(/"/g, '""') + '"';
}
