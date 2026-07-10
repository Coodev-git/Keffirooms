import { digitsOnly, normalizeNigerianPhone } from './phone.js';
import { AppError } from './errors.js';

const PHONE_PATTERNS = [
  /\b0[789]\d{9}\b/g,
  /\b234[789]\d{9}\b/g,
  /\b\+234[789]\d{9}\b/g,
  /\b(?:\+?234[\s.-]?|0)[789][\s.-]?\d{3}[\s.-]?\d{4}\b/gi,
];
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CONTACT_LINK_RE = /\b(?:wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com|t\.me|telegram\.me)\/\S+/gi;
const CONTACT_PHRASE_RE = /\b(?:call|text|whatsapp|dm|reach|contact)\s+(?:me|us)\s+(?:on|at|via)\b/gi;
const MY_CONTACT_RE = /\bmy\s+(?:number|phone|line|whatsapp|contact)\s*(?:is|:)\b/gi;
const SOCIAL_HANDLE_RE = /(?:^|\s)@[A-Z0-9._]{3,}\b/gi;

const LISTING_TEXT_FIELDS = ['title', 'description', 'landmark'];

function textContainsAgentPhone(text, agentPhone) {
  const norm = normalizeNigerianPhone(agentPhone);
  if (!norm || !text) return false;
  const hay = digitsOnly(text);
  const needle = digitsOnly(norm);
  if (!needle) return false;
  return hay.includes(needle) || hay.includes(needle.slice(1));
}

export function findContactViolations(text) {
  if (!text || !String(text).trim()) return [];
  const found = new Set();
  const value = String(text);

  for (const re of PHONE_PATTERNS) {
    if (re.test(value)) found.add('phone number');
    re.lastIndex = 0;
  }

  if (EMAIL_RE.test(value)) found.add('email address');
  EMAIL_RE.lastIndex = 0;

  if (CONTACT_LINK_RE.test(value)) found.add('contact link');
  CONTACT_LINK_RE.lastIndex = 0;

  if (CONTACT_PHRASE_RE.test(value)) found.add('direct contact phrase');
  CONTACT_PHRASE_RE.lastIndex = 0;

  if (MY_CONTACT_RE.test(value)) found.add('direct contact phrase');
  MY_CONTACT_RE.lastIndex = 0;

  if (SOCIAL_HANDLE_RE.test(value)) found.add('social handle');
  SOCIAL_HANDLE_RE.lastIndex = 0;

  return [...found];
}

export function assertListingContentSafe(data, { agentPhone } = {}) {
  const violations = [];

  for (const field of LISTING_TEXT_FIELDS) {
    const value = data[field];
    if (!value) continue;

    const types = findContactViolations(value);
    if (types.length) {
      violations.push({ field, types });
    }
    if (agentPhone && textContainsAgentPhone(value, agentPhone)) {
      violations.push({ field, types: ['your personal phone number'] });
    }
  }

  if (!violations.length) return;

  const fields = [...new Set(violations.map((v) => v.field))];
  throw new AppError(
    'Listings cannot include phone numbers, email, WhatsApp links, or other direct contact details. KeffiRooms coordinates all inquiries.',
    400,
    'CONTACT_INFO_NOT_ALLOWED',
    violations
  );
}
