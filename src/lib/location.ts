/** Google Maps link / GPS pin helpers (mirrors normalize_maps_link() in SQL). */

const COORDS = /^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/;
const MAPS_URL = [
  /^https:\/\/(www\.)?google\.[a-z.]+\/maps(\/|\?|$)/i,
  /^https:\/\/maps\.google\.[a-z.]+(\/|\?|$)/i,
  /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+/i,
  /^https:\/\/goo\.gl\/maps\/[A-Za-z0-9_-]+/i,
];

/** Returns a clickable https link, or null when the input is not a valid Maps link / lat,lng pin. */
export function normalizeMapsLink(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (COORDS.test(v)) return `https://www.google.com/maps?q=${v.replace(/\s+/g, '')}`;
  return MAPS_URL.some((re) => re.test(v)) ? v : null;
}

export const MAPS_LINK_ERROR =
  'A valid Google Maps link (or GPS pin like 9.0320, 38.7469) is required so the driver can navigate. / ትክክለኛ የGoogle Maps ሊንክ ወይም GPS ያስገቡ።';

/** CBE reference numbers look like FT24123ABCDE. */
export const CBE_TXN_ID_PATTERN = /^FT[A-Z0-9]{8,14}$/;

export function isValidCbeTxnId(v: string): boolean {
  return CBE_TXN_ID_PATTERN.test(v.trim().toUpperCase());
}

export const CBE_TXN_ID_ERROR =
  'Invalid CBE Transaction ID. It must look like FT24123ABCDE (starts with FT). / የተሳሳተ የCBE የግብይት መለያ ቁጥር። እባክዎን ከደረሰኙ ላይ በትክክል ያስገቡ።';
export const CBE_TXN_ID_REQUIRED = 'CBE Transaction ID is required. / የCBE የግብይት መለያ ቁጥር ያስፈልጋል።';
