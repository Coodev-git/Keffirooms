export function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** Nigerian mobile numbers usable on WhatsApp (080/081/070/090/091 etc.) */
export function isNigerianWhatsAppPhone(phone) {
  const d = digitsOnly(phone);
  return /^0[789]\d{9}$/.test(d) || /^234[789]\d{9}$/.test(d);
}

/** Store as local 11-digit format e.g. 08012345678 */
export function normalizeNigerianPhone(phone) {
  const d = digitsOnly(phone);
  if (/^0[789]\d{9}$/.test(d)) return d;
  if (/^234[789]\d{9}$/.test(d)) return `0${d.slice(3)}`;
  return null;
}

/** wa.me format e.g. 2348012345678 */
export function toWhatsAppIntl(phone) {
  const d = digitsOnly(phone);
  if (/^0[789]\d{9}$/.test(d)) return `234${d.slice(1)}`;
  if (/^234[789]\d{9}$/.test(d)) return d;
  return null;
}
