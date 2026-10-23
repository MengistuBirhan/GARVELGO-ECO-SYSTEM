export const fmtETB = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

export const fmtNum = (n: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

import { fmtEthDate, fmtEthDateTime } from './ethiopianDate';

export const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtEthDateTime(d);
};

export const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtEthDate(d);
};

export const todayBounds = (): { from: string; to: string } => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
};

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
