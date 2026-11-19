import type { GymSettings, Member, PlanDef } from '../types';
import { daysLeft } from './date';

export function parsePlans(rawPlans: string): PlanDef[] {
  return rawPlans
    .split('\n')
    .map((line) => {
      const parts = line.split(',').map((x) => x.trim());
      const duration = (parts[1] || '').toLowerCase();
      const num = parseInt(duration, 10);
      if (!parts[0] || !num) return null;
      return {
        n: parts[0],
        m: /m$/.test(duration) ? num : 0,
        d: /d$/.test(duration) ? num : 0,
        f: Number(parts[2]) || 0,
      };
    })
    .filter((x): x is PlanDef => x !== null);
}

export function serializePlans(plans: PlanDef[]): string {
  return plans
    .map((p) => `${p.n},${p.d ? `${p.d}d` : `${p.m}m`},${p.f}`)
    .join('\n');
}

export function normalizePhone(phone: string, countryCode = '92'): string {
  let digits = String(phone).replace(/\D/g, '');
  const cc = countryCode || '92';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = cc + digits.slice(1);
  } else if (digits.length <= 10) {
    digits = cc + digits;
  }
  return digits;
}

export function getBalanceDue(member: Pick<Member, 'fee' | 'balance_due' | 'payment_status'>): number {
  if (typeof member.balance_due === 'number' && member.balance_due > 0) {
    return member.balance_due;
  }
  return member.payment_status === 'Pending' ? Number(member.fee) || 0 : 0;
}

export function fillTemplate(
  template: string,
  member: Pick<Member, 'name' | 'fee' | 'balance_due' | 'payment_status' | 'expiry_date'>,
  settings: Pick<GymSettings, 'gym' | 'phone'>
): string {
  const d = daysLeft(member.expiry_date);
  const due = getBalanceDue(member) || member.fee;
  return template
    .replace(/\{fee\}/g, String(due))
    .replace(/\{balance\}/g, String(due))
    .replace(/\{name\}/g, member.name)
    .replace(/\{gym\}/g, settings.gym)
    .replace(/\{date\}/g, member.expiry_date)
    .replace(/\{phone\}/g, settings.phone)
    .replace(/\{left\}/g, d === 0 ? 'aaj' : `${d} days left`);
}

export function buildWhatsAppUrl(phone: string, text: string, countryCode = '92'): string {
  return `https://wa.me/${normalizePhone(phone, countryCode)}?text=${encodeURIComponent(text)}`;
}

export function formatRs(amount: number): string {
  return `Rs ${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function generateMemberCode(members: Member[]): string {
  let maxNum = 1000;
  members.forEach((m) => {
    const match = (m.member_code || '').match(/(\d+)$/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) maxNum = val;
    }
  });
  return `MM-${maxNum + 1}`;
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function exportMembersCsv(members: Member[]): string {
  const columns: Array<keyof Member> = [
    'member_code',
    'name',
    'phone',
    'plan',
    'fee',
    'balance_due',
    'start_date',
    'expiry_date',
    'payment_status',
    'last_payment_date',
    'goal',
    'trainer',
    'note',
  ];
  const header = columns.join(',');
  const rows = members.map((m) =>
    columns
      .map((col) => `"${String(m[col] == null ? '' : m[col]).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export function triggerDownload(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
