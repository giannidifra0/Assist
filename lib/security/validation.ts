const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_STORAGE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length <= 254 && EMAIL_REGEX.test(value.trim());
}

export function isNonEmptyString(value: unknown, min = 1, max = 5000): value is string {
  if (typeof value !== 'string') return false;
  const len = value.trim().length;
  return len >= min && len <= max;
}

export function sanitizeOptionalText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function isValidId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 && (UUID_REGEX.test(trimmed) || /^[a-zA-Z0-9_-]+$/.test(trimmed));
}

export function isSafeStorageFilename(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  return SAFE_STORAGE_FILENAME_REGEX.test(name);
}

export function sanitizeFilename(name: string): string {
  const baseName = name.replace(/\.[^/.]+$/, '');
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'documento';
  return `${safeBase.slice(0, 120)}.pdf`;
}

export function hasPdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const bytes = new Uint8Array(buffer, 0, 5);
  // %PDF- => 0x25 0x50 0x44 0x46 0x2D
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}
