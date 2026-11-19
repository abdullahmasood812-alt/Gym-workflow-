import React, { useEffect, useState } from 'react';
import {
  CloudDownload,
  CloudUpload,
  Download,
  Fingerprint,
  KeyRound,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import type { Expense, GymSettings, Member, PlanDef, Role } from '../types';
import { RECOVERY_QUESTIONS, isStrongPassword, makeCredentials } from '../utils/crypto';
import { authenticateBiometric, canUseBiometrics, enrollBiometric } from '../utils/biometric';
import { addDays, addMonths, today } from '../utils/date';
import {
  exportMembersCsv,
  normalizePhone,
  parsePlans,
  serializePlans,
  splitCsvLine,
  triggerDownload,
} from '../utils/format';
import {
  DEFAULT_T1,
  DEFAULT_T2,
  DEFAULT_T3,
  getBioSetting,
  restoreFromGoogleSheet,
  setBioSetting,
} from '../utils/storage';
import { Modal } from './Modal';

const COUNTRY_CODES = [
  { code: '92', label: 'Pakistan (+92)' },
  { code: '91', label: 'India (+91)' },
  { code: '971', label: 'UAE (+971)' },
  { code: '966', label: 'Saudi Arabia (+966)' },
  { code: '44', label: 'UK (+44)' },
  { code: '1', label: 'US / Canada (+1)' },
];

interface SettingsViewProps {
  settings: GymSettings;
  members: Member[];
  expenses: Expense[];
  role: Role;
  user: string;
  lastSync: string | null;
  onSaveSettings: (next: GymSettings) => void;
  onImportMembers: (nextMembers: Member[], nextExpenses?: Expense[]) => void;
  onSyncNow: (manual: boolean) => Promise<void>;
  onToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  members,
  expenses,
  role,
  user,
  lastSync,
  onSaveSettings,
  onImportMembers,
  onSyncNow,
  onToast,
}) => {
  const isOwner = role === 'owner';

  // Gym details & visual plans
  const [gym, setGym] = useState(settings.gym);
  const [phone, setPhone] = useState(settings.phone);
  const [cc, setCc] = useState(settings.cc);
  const [planList, setPlanList] = useState<PlanDef[]>(() => parsePlans(settings.plans));
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanQty, setNewPlanQty] = useState('1');
  const [newPlanUnit, setNewPlanUnit] = useState<'m' | 'd'>('m');
  const [newPlanFee, setNewPlanFee] = useState('');

  // WhatsApp templates & Sheet URL
  const [t1, setT1] = useState(settings.t1);
  const [t2, setT2] = useState(settings.t2);
  const [t3, setT3] = useState(settings.t3 || DEFAULT_T3);
  const [sheet, setSheet] = useState(settings.sheet || '');

  // Staff login form
  const [staffUser, setStaffUser] = useState('');
  const [staffPw, setStaffPw] = useState('');
  const [removeStaffOpen, setRemoveStaffOpen] = useState(false);

  // Recovery form
  const [recQ, setRecQ] = useState(settings.rec?.i ?? 0);
  const [recAns, setRecAns] = useState('');

  // Change password form
  const [newPw, setNewPw] = useState('');

  // Security: Biometric + Quick PIN + Sensitive action lock
  const [bioEnabled, setBioEnabled] = useState(Boolean(getBioSetting()));
  const [bioStatus, setBioStatus] = useState<{ available: boolean; mode: string; reason?: string }>({
    available: false,
    mode: 'none',
  });
  const [quickPin, setQuickPin] = useState('');
  const [requireSensitiveLock, setRequireSensitiveLock] = useState(
    Boolean(settings.requireBioForSensitive)
  );

  // Import/restore modal
  const [importMode, setImportMode] = useState<'csv' | 'json' | null>(null);
  const [importText, setImportText] = useState('');
  const [sheetRestoreOpen, setSheetRestoreOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void canUseBiometrics().then((res) => setBioStatus(res));
  }, []);

  const handleAddPlan = () => {
    const name = newPlanName.trim();
    const qty = parseInt(newPlanQty, 10);
    const fee = Number(newPlanFee) || 0;
    if (!name || !qty || qty < 1) {
      onToast('Enter plan name and valid duration');
      return;
    }
    const nextPlan: PlanDef = {
      n: name,
      m: newPlanUnit === 'm' ? qty : 0,
      d: newPlanUnit === 'd' ? qty : 0,
      f: fee,
    };
    setPlanList((prev) => [...prev, nextPlan]);
    setNewPlanName('');
    setNewPlanQty('1');
    setNewPlanFee('');
  };

  const handleRemovePlan = (idx: number) => {
    if (planList.length <= 1) {
      onToast('Keep at least one membership plan');
      return;
    }
    setPlanList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveGymSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    if (planList.length === 0) {
      onToast('Add at least one plan');
      return;
    }

    onSaveSettings({
      ...settings,
      gym: gym.trim() || settings.gym,
      phone: phone.trim(),
      cc: cc.replace(/\D/g, '') || '92',
      plans: serializePlans(planList),
      t1: t1 || DEFAULT_T1,
      t2: t2 || DEFAULT_T2,
      t3: t3 || DEFAULT_T3,
      sheet: sheet.trim(),
    });
    onToast('Settings saved');
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    const u = staffUser.trim().toLowerCase();
    if (!u || u === settings.owner?.u || !isStrongPassword(staffPw)) {
      onToast('Use a different username and a strong password (8+, letters + numbers)');
      return;
    }
    const creds = await makeCredentials(u, staffPw);
    onSaveSettings({ ...settings, staff: creds });
    setStaffUser('');
    setStaffPw('');
    onToast('Staff login saved');
  };

  const handleRemoveStaff = () => {
    if (!isOwner) return;
    onSaveSettings({ ...settings, staff: null });
    setRemoveStaffOpen(false);
    onToast('Staff login removed');
  };

  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const ans = recAns.trim().toLowerCase();
    if (ans.length < 3) {
      onToast('Enter an answer (3+ characters)');
      return;
    }
    const rr = await makeCredentials('x', ans);
    onSaveSettings({ ...settings, rec: { i: recQ, s: rr.s, h: rr.h } });
    setRecAns('');
    onToast('Recovery question saved');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStrongPassword(newPw)) {
      onToast('8+ characters with letters and numbers required');
      return;
    }
    const currentCreds = settings[role];
    if (!currentCreds) return;
    const updated = await makeCredentials(currentCreds.u, newPw);
    onSaveSettings({ ...settings, [role]: updated });
    setNewPw('');
    onToast('Password changed');
  };

  const handleEnableBio = async () => {
    const res = await enrollBiometric(role, user);
    if (res.ok) {
      setBioEnabled(true);
    }
    onToast(res.message);
  };

  const handleTestBio = async () => {
    const res = await authenticateBiometric();
    if (res.ok) {
      onToast('Fingerprint verified successfully');
    } else {
      onToast(res.message || 'Fingerprint test failed');
    }
  };

  const handleDisableBio = () => {
    setBioSetting(null);
    setBioEnabled(false);
    onToast('Fingerprint unlock turned off');
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(quickPin)) {
      onToast('Enter a 4 to 6 digit numeric PIN');
      return;
    }
    const pinCreds = await makeCredentials('pin', quickPin);
    onSaveSettings({ ...settings, pin: { s: pinCreds.s, h: pinCreds.h } });
    setQuickPin('');
    onToast('Quick Security PIN saved');
  };

  const handleRemovePin = () => {
    onSaveSettings({ ...settings, pin: null });
    onToast('Quick Security PIN removed');
  };

  const handleToggleSensitiveLock = () => {
    const next = !requireSensitiveLock;
    setRequireSensitiveLock(next);
    onSaveSettings({ ...settings, requireBioForSensitive: next });
    onToast(
      next
        ? 'Sensitive action lock enabled for Accounts, Settings, and Deletions'
        : 'Sensitive action lock disabled'
    );
  };

  const handleCsvImport = () => {
    const lines = importText.trim().split(/\r?\n/);
    if (lines.length < 2) {
      onToast('CSV is empty');
      return;
    }
    const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const plansList = parsePlans(settings.plans);
    const updated = members.slice();
    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = splitCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || '').trim();
      });
      if (!row.name || !row.phone) continue;

      const np = normalizePhone(row.phone, settings.cc);
      const existingIdx = updated.findIndex((x) => normalizePhone(x.phone, settings.cc) === np);
      const plan = plansList.find((p) => p.n === row.plan) || plansList[0];
      const base: Member =
        existingIdx >= 0
          ? { ...updated[existingIdx] }
          : {
              id: `m${Date.now()}${i}`,
              name: '',
              phone: '',
              plan: plan.n,
              plan_months: plan.m,
              plan_days: plan.d,
              fee: plan.f,
              start_date: today(),
              expiry_date: today(),
              payment_status: 'Pending',
              last_payment_date: '',
              note: '',
              payments: [],
              att: [],
            };

      base.name = row.name;
      base.phone = row.phone;
      base.plan = plan.n;
      base.plan_months = plan.m;
      base.plan_days = plan.d;
      base.fee = Number(row.fee) || plan.f;
      base.start_date = row.start_date || today();
      base.expiry_date =
        row.expiry_date ||
        (plan.d ? addDays(base.start_date, plan.d) : addMonths(base.start_date, plan.m));
      if (row.payment_status === 'Paid') {
        base.payment_status = 'Paid';
        base.last_payment_date = row.last_payment_date || base.start_date;
      }
      base.note = row.note || base.note || '';

      if (existingIdx >= 0) updated[existingIdx] = base;
      else updated.push(base);
      importedCount++;
    }

    onImportMembers(updated);
    setImportMode(null);
    setImportText('');
    onToast(`${importedCount} members imported`);
  };

  const handleJsonRestore = () => {
    try {
      const parsed = JSON.parse(importText) as { members?: Member[]; expenses?: Expense[] };
      const nextMembers = members.slice();
      let count = 0;
      (parsed.members || []).forEach((m) => {
        if (m.id && m.name) {
          const idx = nextMembers.findIndex((x) => x.id === m.id);
          if (idx >= 0) nextMembers[idx] = m;
          else nextMembers.push(m);
          count++;
        }
      });
      const nextExpenses = expenses.slice();
      (parsed.expenses || []).forEach((x) => {
        if (x.id) {
          const idx = nextExpenses.findIndex((e) => e.id === x.id);
          if (idx >= 0) nextExpenses[idx] = x;
          else nextExpenses.push(x);
        }
      });
      onImportMembers(nextMembers, nextExpenses);
      setImportMode(null);
      setImportText('');
      onToast(`${count} members restored`);
    } catch {
      onToast('Invalid backup JSON');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleRestoreFromSheet = async () => {
    if (!settings.sheet) {
      onToast('Add the Google Sheet link first');
      return;
    }
    setSyncing(true);
    try {
      const j = await restoreFromGoogleSheet(settings.sheet);
      const nextMembers = members.slice();
      let count = 0;
      (j.members || []).forEach((m) => {
        if (m.id && m.name) {
          const idx = nextMembers.findIndex((x) => x.id === m.id);
          if (idx >= 0) nextMembers[idx] = m;
          else nextMembers.push(m);
          count++;
        }
      });
      const nextExpenses = expenses.slice();
      (j.expenses || []).forEach((x) => {
        if (x.id) {
          const idx = nextExpenses.findIndex((e) => e.id === x.id);
          if (idx >= 0) nextExpenses[idx] = x;
          else nextExpenses.push(x);
        }
      });
      onImportMembers(nextMembers, nextExpenses);
      setSheetRestoreOpen(false);
      onToast(`${count} members restored from Google Sheet`);
    } catch {
      onToast('Could not read the sheet backup');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {isOwner ? 'Security & Gym Settings' : 'Account & Security'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">
          {isOwner
            ? 'Configure fingerprint security, membership plans, WhatsApp templates, staff access, and backups.'
            : 'Manage your password and fingerprint unlock.'}
        </p>
      </div>

      {/* Fingerprint & Security Section */}
      <section className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-[#D62828]" />
              <span>Fingerprint &amp; Access Security</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">
              {bioStatus.available
                ? `Biometric hardware ready (${bioStatus.mode === 'native' ? 'Android Fingerprint' : 'Device Biometrics / Passkey'}).`
                : bioStatus.reason || 'Checking biometric hardware...'}
            </p>
          </div>
          <div className="text-xs font-semibold">
            {bioEnabled ? (
              <span className="text-[#168A4F] dark:text-[#4CC38A]">Fingerprint Active</span>
            ) : (
              <span className="text-slate-500 dark:text-[#9AA6B4]">Fingerprint Off</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleEnableBio}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Fingerprint className="w-4 h-4" />
            <span>{bioEnabled ? 'Re-enroll fingerprint' : 'Enable fingerprint'}</span>
          </button>
          {bioEnabled && (
            <>
              <button
                type="button"
                onClick={handleTestBio}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium cursor-pointer"
              >
                Test fingerprint
              </button>
              <button
                type="button"
                onClick={handleDisableBio}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium text-[#C62828] dark:text-[#FF7B72] hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
              >
                Turn off
              </button>
            </>
          )}
        </div>

        {isOwner && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-[#27303A]">
            <form onSubmit={handleSavePin} className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-[#D62828]" />
                  <span>Quick Security PIN (4–6 digits)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5">
                  {settings.pin
                    ? 'A Quick PIN is active for instant front-desk unlock and sensitive actions.'
                    : 'Optional backup PIN for devices without a fingerprint sensor.'}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={quickPin}
                  onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 4-6 digits"
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#27303A] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {settings.pin ? 'Change PIN' : 'Set PIN'}
                </button>
                {settings.pin && (
                  <button
                    type="button"
                    onClick={handleRemovePin}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-xs font-medium text-[#C62828] dark:text-[#FF7B72] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            <div className="flex flex-col justify-between rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A] p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#168A4F]" />
                  <span>Protect Sensitive Actions</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">
                  Require fingerprint or PIN before opening Accounts, Settings, or deleting a member.
                </p>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleToggleSensitiveLock}
                  className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    requireSensitiveLock
                      ? 'bg-[#168A4F] text-white'
                      : 'border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-slate-700 dark:text-[#EEF1F4]'
                  }`}
                >
                  {requireSensitiveLock ? 'Protection Enabled' : 'Enable Protection'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {isOwner && (
        <>
          {/* Gym Details, Visual Plan Builder & Templates */}
          <form
            onSubmit={handleSaveGymSettings}
            className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 sm:p-6 space-y-5"
          >
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Gym details &amp; Membership plans
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-gym">
                  Gym name
                </label>
                <input
                  id="set-gym"
                  type="text"
                  value={gym}
                  onChange={(e) => setGym(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-phone">
                  Gym WhatsApp number
                </label>
                <input
                  id="set-phone"
                  type="text"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-cc">
                  Country code
                </label>
                <select
                  id="set-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Visual Plan Builder */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#27303A]">
              <div className="text-xs font-semibold text-slate-700 dark:text-[#EEF1F4]">
                Membership Plans ({planList.length})
              </div>
              <div className="divide-y divide-slate-200 dark:divide-[#27303A] rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14]">
                {planList.map((pl, idx) => (
                  <div key={`${pl.n}-${idx}`} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{pl.n}</span>
                      <span className="text-xs text-slate-500 dark:text-[#9AA6B4] tabular-nums">
                        {pl.d ? `${pl.d} day(s)` : `${pl.m} month(s)`} · Rs {pl.f.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePlan(idx)}
                      aria-label={`Remove ${pl.n}`}
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#C62828] dark:text-[#FF7B72] hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input
                  type="text"
                  placeholder="Plan name"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="col-span-2 sm:col-span-2 min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs"
                />
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={newPlanQty}
                    onChange={(e) => setNewPlanQty(e.target.value)}
                    className="w-16 min-h-[42px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs tabular-nums"
                  />
                  <select
                    value={newPlanUnit}
                    onChange={(e) => setNewPlanUnit(e.target.value as 'm' | 'd')}
                    className="flex-1 min-h-[42px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs"
                  >
                    <option value="m">Months</option>
                    <option value="d">Days</option>
                  </select>
                </div>
                <input
                  type="number"
                  placeholder="Fee (Rs)"
                  value={newPlanFee}
                  onChange={(e) => setNewPlanFee(e.target.value)}
                  className="min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleAddPlan}
                  className="min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-100 dark:hover:bg-[#1E2630] text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add plan</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200 dark:border-[#27303A]">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-t1">
                  Reminder (before expiry)
                </label>
                <textarea
                  id="set-t1"
                  rows={4}
                  value={t1}
                  onChange={(e) => setT1(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-t2">
                  Message (already expired)
                </label>
                <textarea
                  id="set-t2"
                  rows={4}
                  value={t2}
                  onChange={(e) => setT2(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-t3">
                  Message (fee pending / balance due)
                </label>
                <textarea
                  id="set-t3"
                  rows={4}
                  value={t3}
                  onChange={(e) => setT3(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#9AA6B4] font-mono">
              Placeholders: {'{name} {gym} {date} {phone} {left} {fee} {balance}'}
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="set-sheet">
                Google Sheet link (Apps Script web app URL — optional cloud backup)
              </label>
              <input
                id="set-sheet"
                type="url"
                autoCapitalize="none"
                value={sheet}
                onChange={(e) => setSheet(e.target.value)}
                placeholder="https://script.google.com/macros/s/..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              />
            </div>

            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save settings</span>
            </button>
          </form>

          {/* Data Export, Import & Google Sheet Sync */}
          <section className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Data &amp; Backups
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5">
                {lastSync ? `Last Google Sheet sync: ${lastSync}` : 'Export CSV/JSON backups anytime.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => triggerDownload(`muscle_max_members_${today()}.csv`, exportMembersCsv(members), 'text/csv;charset=utf-8')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Members CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportText('');
                  setImportMode('csv');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>CSV import</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    `muscle_max_backup_${today()}.json`,
                    JSON.stringify({ members, expenses }, null, 2),
                    'application/json'
                  )
                }
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Full backup</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportText('');
                  setImportMode('json');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Restore backup</span>
              </button>
            </div>

            {settings.sheet && (
              <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-200 dark:border-[#27303A]">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void onSyncNow(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#27303A] hover:bg-slate-800 dark:hover:bg-[#323d49] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>Sync to Google Sheet</span>
                </button>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => setSheetRestoreOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>Restore from Sheet</span>
                </button>
              </div>
            )}
          </section>

          {/* Staff Login Management */}
          <form
            onSubmit={handleCreateStaff}
            className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-[#D62828]" />
                <span>Staff login</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">
                Staff can add members, take payments, and mark attendance, but cannot delete, view accounts, settings, or export.
                {settings.staff && (
                  <>
                    {' '}
                    Current staff username: <strong className="text-slate-900 dark:text-white">{settings.staff.u}</strong>
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="staff-u">
                  Staff username
                </label>
                <input
                  id="staff-u"
                  type="text"
                  autoCapitalize="none"
                  value={staffUser}
                  onChange={(e) => setStaffUser(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="staff-p">
                  Staff password (8+ chars, letters &amp; numbers)
                </label>
                <input
                  id="staff-p"
                  type="password"
                  value={staffPw}
                  onChange={(e) => setStaffPw(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
              >
                Create / change staff login
              </button>
              {settings.staff && (
                <button
                  type="button"
                  onClick={() => setRemoveStaffOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium text-[#C62828] dark:text-[#FF7B72] hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                >
                  Remove staff
                </button>
              )}
            </div>
          </form>

          {/* Recovery Question */}
          <form
            onSubmit={handleSaveRecovery}
            className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Password recovery
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5">
                {settings.rec
                  ? 'A recovery question is set.'
                  : 'Not set yet. Set one to reset a forgotten owner password.'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select
                value={recQ}
                onChange={(e) => setRecQ(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              >
                {RECOVERY_QUESTIONS.map((q, idx) => (
                  <option key={q} value={idx}>
                    {q}
                  </option>
                ))}
              </select>
              <input
                type="text"
                autoComplete="off"
                value={recAns}
                onChange={(e) => setRecAns(e.target.value)}
                placeholder="Answer (3+ characters)"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium cursor-pointer"
            >
              Save recovery question
            </button>
          </form>
        </>
      )}

      {/* Change Password */}
      <form
        onSubmit={handleChangePassword}
        className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 sm:p-6 space-y-4 max-w-md"
      >
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-[#D62828]" />
          <span>Change password</span>
        </h2>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="new-pw">
            New password (8+ chars, letters &amp; numbers)
          </label>
          <input
            id="new-pw"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
          />
        </div>
        <button
          type="submit"
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium cursor-pointer"
        >
          Update password
        </button>
      </form>

      {/* Remove Staff Confirm Modal */}
      <Modal open={removeStaffOpen} onClose={() => setRemoveStaffOpen(false)} title="Remove staff login">
        <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
          Remove the current staff login account? They will no longer be able to sign in.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setRemoveStaffOpen(false)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRemoveStaff}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
          >
            Yes, remove
          </button>
        </div>
      </Modal>

      {/* CSV / JSON Import Modal */}
      <Modal
        open={importMode !== null}
        onClose={() => setImportMode(null)}
        title={importMode === 'csv' ? 'CSV import' : 'Restore JSON backup'}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-[#9AA6B4]">
            {importMode === 'csv'
              ? 'Headings: name,phone,plan,fee,start_date. A row with an existing phone number updates that member.'
              : 'Upload a backup .json file or paste the full JSON backup below.'}
          </p>
          <input
            type="file"
            accept={importMode === 'csv' ? '.csv,text/csv' : '.json,application/json'}
            onChange={handleFileUpload}
            className="block w-full text-xs text-slate-600 dark:text-[#9AA6B4] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-200 dark:file:border-[#27303A] file:text-xs file:font-semibold file:bg-slate-50 dark:file:bg-[#0B0F14] file:text-slate-900 dark:file:text-white cursor-pointer"
          />
          <textarea
            rows={7}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={importMode === 'csv' ? 'Paste CSV content...' : 'Paste JSON backup...'}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setImportMode(null)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={importMode === 'csv' ? handleCsvImport : handleJsonRestore}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
            >
              Import
            </button>
          </div>
        </div>
      </Modal>

      {/* Restore from Google Sheet Confirm Modal */}
      <Modal
        open={sheetRestoreOpen}
        onClose={() => setSheetRestoreOpen(false)}
        title="Restore from Google Sheet"
      >
        <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
          Load members from the Google Sheet backup? Matching members will be overwritten.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setSheetRestoreOpen(false)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={handleRestoreFromSheet}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            Yes, restore
          </button>
        </div>
      </Modal>
    </div>
  );
};
