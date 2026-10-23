/*
# Ethiopian calendar (የኢትዮጵያ አቆጣጠር) date conversion

Converts Gregorian dates to the Ethiopian calendar without any external
dependency, using the standard Julian Day Number (JDN) bridge. The
Ethiopian calendar has 12 months of 30 days each plus a 13th month
(ጳጉሜ) of 5 or 6 days. Ethiopian leap years fall every 4 years (when
year % 4 == 3) and the new year is Sept 11 (or Sept 12 after an
Ethiopian leap year).
*/

const ETH_MONTHS = [
  'መስከረም',
  'ጥቅምት',
  'ህዳር',
  'ታህሳስ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜ',
] as const;

export interface EthiopianDate {
  year: number;
  month: number; // 1–13
  day: number; // 1–30 (or 1–6 for month 13)
  monthName: string;
}

/** Convert a Gregorian date to its Julian Day Number. */
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

// Ethiopian epoch: 1 መስከረም 1 EC = JDN 1724221 (Aug 29, 8 CE proleptic Gregorian).
const ETH_EPOCH = 1724221;

/**
 * Convert a JDN to an Ethiopian date.
 *
 * The Ethiopian calendar uses 4-year cycles of 1461 days. Within each
 * cycle the third year (index 2, i.e. year % 4 == 3) is the leap year
 * with 366 days; the other three have 365.
 */
function jdnToEthiopian(jdn: number): EthiopianDate {
  const r = jdn - ETH_EPOCH; // days since Ethiopian epoch (0-indexed)
  const n4 = Math.floor(r / 1461); // complete 4-year cycles
  const rem = r % 1461; // days into the current cycle

  let yearInCycle: number;
  let dayOfYear: number; // 0-indexed day within the Ethiopian year

  if (rem < 365) {
    yearInCycle = 0;
    dayOfYear = rem;
  } else if (rem < 730) {
    yearInCycle = 1;
    dayOfYear = rem - 365;
  } else if (rem < 1096) {
    // leap year — 366 days
    yearInCycle = 2;
    dayOfYear = rem - 730;
  } else {
    yearInCycle = 3;
    dayOfYear = rem - 1096;
  }

  const year = 4 * n4 + yearInCycle + 1;
  const month = Math.floor(dayOfYear / 30) + 1;
  const day = (dayOfYear % 30) + 1;

  return { year, month, day, monthName: ETH_MONTHS[month - 1] ?? '' };
}

/** Convert any JS Date to an Ethiopian date. */
export function toEthiopian(date: Date): EthiopianDate {
  const jdn = gregorianToJdn(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return jdnToEthiopian(jdn);
}

/** Format an Ethiopian date as "11 ጥቅምት 2019 ዓ.ም." */
export function fmtEthDate(date: Date): string {
  const e = toEthiopian(date);
  return `${e.day} ${e.monthName} ${e.year} ዓ.ም.`;
}

/** Format an Ethiopian date+time as "11 ጥቅምት 2019 ዓ.ም. 14:30" */
export function fmtEthDateTime(date: Date): string {
  const e = toEthiopian(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${e.day} ${e.monthName} ${e.year} ዓ.ም. ${hh}:${mm}`;
}
