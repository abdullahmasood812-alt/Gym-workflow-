import type { BioSetting, Expense, GymSettings, LockState, Member } from '../types';

export const DEFAULT_T1 =
  'Assalam o Alaikum {name},\n\nUmeed hai aap khairiyat se hain. Aapki {gym} ki membership {date} ko khatam ho rahi hai ({left}).\n\nApni fitness journey jaari rakhne ke liye barah-e-meherbani waqt par renew karwa lein. Gym tashreef layein ya {phone} par rabta karein.\n\nShukriya!\n{gym}';

export const DEFAULT_T2 =
  'Assalam o Alaikum {name}, aapki {gym} ki membership {date} ko khatam ho chuki hai. Dobara shuru karne ke liye gym aayein ya {phone} par rabta karein. Shukriya!';

export const DEFAULT_T3 =
  'Assalam o Alaikum {name}, aapki {gym} ki Rs {fee} fees abhi baqi hai. Barah-e-meherbani jald ada karein ya {phone} par rabta karein. Shukriya!';

export const DEFAULT_PLANS =
  '1 Din Pass,1d,300\nWeekly,7d,1000\nMonthly,1m,3000\nQuarterly,3m,8000\nHalf-yearly,6m,15000\nYearly,12m,28000';

export const DEFAULT_SETTINGS: GymSettings = {
  gym: 'MUSCLE MAX GYM',
  phone: '03229482184',
  cc: '92',
  t1: DEFAULT_T1,
  t2: DEFAULT_T2,
  t3: DEFAULT_T3,
  plans: DEFAULT_PLANS,
  owner: null,
  staff: null,
  sheet: '',
  rec: null,
  pin: null,
  requireBioForSensitive: false,
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function loadSettings(): GymSettings {
  const saved = lsGet<Partial<GymSettings>>('mm_settings', {});
  const merged: GymSettings = { ...DEFAULT_SETTINGS, ...saved };
  if (/^Assalam o Alaikum \{name\}, aapki/.test(merged.t1 || '')) {
    merged.t1 = DEFAULT_T1;
  }
  if (!merged.t3) {
    merged.t3 = DEFAULT_T3;
  }
  return merged;
}

export function saveSettings(settings: GymSettings): void {
  lsSet('mm_settings', settings);
}

export function loadMembers(): Member[] {
  return lsGet<Member[]>('mm_members', []);
}

export function saveMembers(members: Member[]): void {
  lsSet('mm_members', members);
}

export function loadExpenses(): Expense[] {
  return lsGet<Expense[]>('mm_expenses', []);
}

export function saveExpenses(expenses: Expense[]): void {
  lsSet('mm_expenses', expenses);
}

export function getLockState(): LockState {
  return lsGet<LockState>('mm_lock', {});
}

export function saveLockState(lock: LockState): void {
  lsSet('mm_lock', lock);
}

export function getBioSetting(): BioSetting | null {
  return lsGet<BioSetting | null>('mm_bio', null);
}

export function setBioSetting(bio: BioSetting | null): void {
  if (!bio) {
    try {
      localStorage.removeItem('mm_bio');
    } catch {
      // ignore
    }
    return;
  }
  lsSet('mm_bio', bio);
}

export function loadTheme(): 'dark' | 'light' {
  try {
    const t = localStorage.getItem('mm_theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    // ignore
  }
  return 'dark';
}

export function saveTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem('mm_theme', theme);
  } catch {
    // ignore
  }
}

export async function syncToGoogleSheet(
  sheetUrl: string,
  members: Member[],
  expenses: Expense[]
): Promise<{ ok: boolean }> {
  const payments: Array<[string, string, string, number, string, string]> = [];
  const attendance: Array<[string, string, string, string]> = [];

  const formattedMembers = members.map((m) => {
    (m.payments || []).forEach((p) => {
      payments.push([p.d, m.name, m.phone, p.amt, p.mode, p.by || '']);
    });
    (m.att || []).forEach((d) => {
      attendance.push([d, m.name, m.phone, 'Present']);
    });
    (m.abs || []).forEach((d) => {
      attendance.push([d, m.name, m.phone, 'Absent']);
    });

    return {
      code: m.member_code || '',
      name: m.name,
      phone: m.phone,
      plan: m.plan,
      fee: m.fee,
      balance_due: m.balance_due || 0,
      start: m.start_date,
      expiry: m.expiry_date,
      status: m.payment_status,
      paid_on: m.last_payment_date || '',
      visits: (m.att || []).length,
      goal: m.goal || '',
      note: m.note || '',
    };
  });

  const res = await fetch(sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      members: formattedMembers,
      payments,
      attendance,
      backup: { members, expenses },
    }),
  });
  const json = (await res.json()) as { ok?: boolean };
  return { ok: Boolean(json?.ok) };
}

export async function restoreFromGoogleSheet(
  sheetUrl: string
): Promise<{ members?: Member[]; expenses?: Expense[] }> {
  const sep = sheetUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${sheetUrl}${sep}action=backup`);
  return (await res.json()) as { members?: Member[]; expenses?: Expense[] };
}
