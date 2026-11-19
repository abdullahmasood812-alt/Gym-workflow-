import type { Member } from '../types';

export function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

export function addMonths(iso: string, months: number): string {
  const parts = iso.split('-').map(Number);
  const totalMonths = parts[1] - 1 + months;
  const ny = parts[0] + Math.floor(totalMonths / 12);
  const nm = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(parts[2], lastDay)).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const parts = iso.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return d.toISOString().slice(0, 10);
}

export function daysLeft(iso: string): number {
  const a = iso.split('-').map(Number);
  const b = today().split('-').map(Number);
  return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 864e5);
}

export function extendExpiry(base: string, member: Pick<Member, 'plan_days' | 'plan_months'>): string {
  return member.plan_days ? addDays(base, Number(member.plan_days)) : addMonths(base, Number(member.plan_months) || 1);
}

export function getMemberStatus(member: Pick<Member, 'expiry_date'>): 'expired' | 'soon' | 'active' {
  const d = daysLeft(member.expiry_date);
  return d < 0 ? 'expired' : d <= 3 ? 'soon' : 'active';
}

export function getLastVisit(member: Pick<Member, 'att' | 'start_date'>): string {
  const sorted = (member.att || []).slice().sort();
  return sorted.length ? sorted[sorted.length - 1] : member.start_date;
}

export function getAttendanceState(member: Pick<Member, 'att' | 'abs'>, dateStr: string): 'P' | 'A' | '' {
  if ((member.att || []).includes(dateStr)) return 'P';
  if ((member.abs || []).includes(dateStr)) return 'A';
  return '';
}

export function getLast6Months(): string[] {
  const t = today();
  const y = Number(t.slice(0, 4));
  const mo = Number(t.slice(5, 7));
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    months.push(new Date(Date.UTC(y, mo - 1 - i, 1)).toISOString().slice(0, 7));
  }
  return months;
}
