import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  Fingerprint,
  Home,
  Lock,
  Moon,
  Settings,
  Sun,
  Users,
  Wallet,
} from 'lucide-react';
import { AccountsView } from './components/AccountsView';
import { AttendanceView } from './components/AttendanceView';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { MemberDetailModal, MemberFormModal, PaymentModal } from './components/MemberModals';
import { MembersView } from './components/MembersView';
import { Modal } from './components/Modal';
import { SettingsView } from './components/SettingsView';
import type {
  Expense,
  ExpenseCategory,
  GymSettings,
  LockState,
  Member,
  MemberFilter,
  Role,
  TabId,
} from './types';
import { authenticateBiometric } from './utils/biometric';
import { hashPassword } from './utils/crypto';
import { getMemberStatus, today } from './utils/date';
import { formatRs, getBalanceDue } from './utils/format';
import {
  getBioSetting,
  getLockState,
  loadExpenses,
  loadMembers,
  loadSettings,
  loadTheme,
  saveExpenses,
  saveLockState,
  saveMembers,
  saveSettings,
  saveTheme,
  syncToGoogleSheet,
} from './utils/storage';

export default function App() {
  const [settings, setSettings] = useState<GymSettings>(() => loadSettings());
  const [members, setMembers] = useState<Member[]>(() => loadMembers());
  const [expenses, setExpenses] = useState<Expense[]>(() => loadExpenses());
  const [lock, setLock] = useState<LockState>(() => getLockState());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadTheme());

  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState('');
  const [tab, setTab] = useState<TabId>('home');
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [query, setQuery] = useState('');
  const [attDate, setAttDate] = useState(() => today());
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [payingMember, setPayingMember] = useState<Member | null>(null);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);

  // Sensitive action verification modal
  const [sensitiveAction, setSensitiveAction] = useState<{
    label: string;
    run: () => void;
  } | null>(null);
  const [sensitiveVerifyInput, setSensitiveVerifyInput] = useState('');
  const [sessionUnlockedAt, setSessionUnlockedAt] = useState<number>(0);

  const idleTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // Theme sync with <html> class and theme-color meta
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0B0F14' : '#F4F6F8');
    }
    saveTheme(theme);
  }, [theme]);

  const logout = useCallback(
    (msg?: string) => {
      setRole(null);
      setUser('');
      setSessionUnlockedAt(0);
      setFormOpen(false);
      setEditingMember(null);
      setPayingMember(null);
      setDetailMember(null);
      setDeletingMember(null);
      setSensitiveAction(null);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      if (msg) showToast(msg);
    },
    [showToast]
  );

  // 5-minute inactivity auto-logout
  const bumpIdle = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (role) {
      idleTimerRef.current = window.setTimeout(() => {
        logout('Logged out after 5 minutes of inactivity');
      }, 300000);
    }
  }, [role, logout]);

  useEffect(() => {
    if (!role) return;
    bumpIdle();
    const events = ['click', 'keydown', 'touchstart'] as const;
    events.forEach((ev) => document.addEventListener(ev, bumpIdle, true));
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, bumpIdle, true));
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [role, bumpIdle]);

  // 60s background tab visibility lock
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (role && hiddenAtRef.current && Date.now() - hiddenAtRef.current > 60000) {
        logout('Locked. Please sign in again.');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [role, logout]);

  const runSync = useCallback(
    async (manual: boolean, currentMembers = members, currentExpenses = expenses, sheetUrl = settings.sheet) => {
      if (!sheetUrl) {
        if (manual) showToast('Add the Google Sheet link in Settings first');
        return;
      }
      try {
        const res = await syncToGoogleSheet(sheetUrl, currentMembers, currentExpenses);
        if (res.ok) {
          setLastSync(new Date().toLocaleString());
          if (manual) showToast('Synced to Google Sheet');
        } else {
          throw new Error('Sync returned not ok');
        }
      } catch {
        if (manual) showToast('Sync failed. Check the link and try again');
      }
    },
    [members, expenses, settings.sheet, showToast]
  );

  const scheduleSync = useCallback(
    (nextMembers: Member[], nextExpenses: Expense[], sheetUrl = settings.sheet) => {
      if (!sheetUrl) return;
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        void runSync(false, nextMembers, nextExpenses, sheetUrl);
      }, 2500);
    },
    [settings.sheet, runSync]
  );

  const guardSensitive = (label: string, action: () => void) => {
    const recentlyVerified = Date.now() - sessionUnlockedAt < 120000;
    if (!settings.requireBioForSensitive || recentlyVerified) {
      action();
      return;
    }
    setSensitiveVerifyInput('');
    setSensitiveAction({ label, run: action });
  };

  const handleSensitiveBiometric = async () => {
    const res = await authenticateBiometric();
    if (res.ok) {
      setSessionUnlockedAt(Date.now());
      const act = sensitiveAction;
      setSensitiveAction(null);
      act?.run();
    } else {
      showToast(res.message || 'Fingerprint verification failed');
    }
  };

  const handleSensitiveCredentialVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sensitiveAction) return;
    let verified = false;
    if (settings.pin && /^\d{4,6}$/.test(sensitiveVerifyInput)) {
      verified = (await hashPassword(sensitiveVerifyInput, settings.pin.s)) === settings.pin.h;
    }
    if (!verified && settings.owner) {
      verified = (await hashPassword(sensitiveVerifyInput, settings.owner.s)) === settings.owner.h;
    }
    if (verified) {
      setSessionUnlockedAt(Date.now());
      const act = sensitiveAction;
      setSensitiveAction(null);
      setSensitiveVerifyInput('');
      act.run();
    } else {
      showToast('Incorrect PIN or owner password');
    }
  };

  const handleSaveSettings = (next: GymSettings) => {
    setSettings(next);
    saveSettings(next);
    scheduleSync(members, expenses, next.sheet);
  };

  const handleUpdateLock = (next: LockState) => {
    setLock(next);
    saveLockState(next);
  };

  const handleSaveMember = (saved: Member) => {
    const exists = members.some((x) => x.id === saved.id);
    const next = exists
      ? members.map((x) => (x.id === saved.id ? saved : x))
      : [...members, saved];
    setMembers(next);
    saveMembers(next);
    if (detailMember?.id === saved.id) setDetailMember(saved);
    scheduleSync(next, expenses);
  };

  const handleDeleteMember = (id: string) => {
    if (role !== 'owner') return;
    const next = members.filter((x) => x.id !== id);
    setMembers(next);
    saveMembers(next);
    scheduleSync(next, expenses);
    showToast('Member deleted');
  };

  const handleMarkAttendance = (memberId: string, markState: 'P' | 'A') => {
    const d = attDate || today();
    const next = members.map((m) => {
      if (m.id !== memberId) return m;
      const attList = (m.att || []).filter((x) => x !== d);
      const absList = (m.abs || []).filter((x) => x !== d);
      const wasP = (m.att || []).includes(d);
      const wasA = (m.abs || []).includes(d);
      const current = wasP ? 'P' : wasA ? 'A' : '';
      if (current !== markState) {
        if (markState === 'P') attList.push(d);
        else absList.push(d);
      }
      return {
        ...m,
        att: attList.sort().slice(-90),
        abs: absList.sort().slice(-90),
      };
    });
    setMembers(next);
    saveMembers(next);
    scheduleSync(next, expenses);
  };

  const handleQuickCheckIn = (member: Member) => {
    const d = tab === 'att' ? attDate : today();
    const alreadyPresent = (member.att || []).includes(d);
    if (alreadyPresent) {
      showToast(`${member.name} is already marked Present for ${d}`);
      return;
    }

    const next = members.map((m) => {
      if (m.id !== member.id) return m;
      return {
        ...m,
        att: [...(m.att || []).filter((x) => x !== d), d].sort().slice(-90),
        abs: (m.abs || []).filter((x) => x !== d),
      };
    });
    setMembers(next);
    saveMembers(next);
    scheduleSync(next, expenses);

    const isExpired = getMemberStatus(member) === 'expired';
    const due = getBalanceDue(member);
    if (isExpired) {
      showToast(`${member.name} checked in — WARNING: Membership expired!`);
    } else if (due > 0) {
      showToast(`${member.name} checked in — Balance due: ${formatRs(due)}`);
    } else {
      showToast(`${member.name} checked in (${d})`);
    }
  };

  const handleMarkUnmarkedAbsent = (dateStr: string) => {
    const next = members.map((m) => {
      const hasMark = (m.att || []).includes(dateStr) || (m.abs || []).includes(dateStr);
      if (hasMark) return m;
      return {
        ...m,
        abs: [...(m.abs || []), dateStr].sort().slice(-90),
      };
    });
    setMembers(next);
    saveMembers(next);
    scheduleSync(next, expenses);
  };

  const handleAddExpense = (title: string, amt: number, category: ExpenseCategory) => {
    const next = [...expenses, { id: `x${Date.now()}`, d: today(), title, amt, category }];
    setExpenses(next);
    saveExpenses(next);
    scheduleSync(members, next);
  };

  const handleDeleteExpense = (id: string) => {
    if (role !== 'owner') return;
    const next = expenses.filter((x) => x.id !== id);
    setExpenses(next);
    saveExpenses(next);
    scheduleSync(members, next);
  };

  const handleImportData = (nextMembers: Member[], nextExpenses?: Expense[]) => {
    setMembers(nextMembers);
    saveMembers(nextMembers);
    const finalExpenses = nextExpenses ?? expenses;
    if (nextExpenses) {
      setExpenses(nextExpenses);
      saveExpenses(nextExpenses);
    }
    scheduleSync(nextMembers, finalExpenses);
  };

  const handleSelectTab = (nextTab: TabId) => {
    if ((nextTab === 'acc' || (nextTab === 'set' && role === 'owner')) && settings.requireBioForSensitive) {
      guardSensitive(`Open ${nextTab === 'acc' ? 'Accounts' : 'Settings'}`, () => {
        setTab(nextTab);
        window.scrollTo(0, 0);
      });
      return;
    }
    setTab(nextTab);
    window.scrollTo(0, 0);
  };

  const isOwner = role === 'owner';
  const navItems: Array<{ id: TabId; label: string; icon: React.FC<{ className?: string }> }> = isOwner
    ? [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'list', label: 'Members', icon: Users },
        { id: 'att', label: 'Attendance', icon: CalendarCheck },
        { id: 'acc', label: 'Accounts', icon: Wallet },
        { id: 'set', label: 'Settings', icon: Settings },
      ]
    : [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'list', label: 'Members', icon: Users },
        { id: 'att', label: 'Attendance', icon: CalendarCheck },
        { id: 'set', label: 'Account', icon: Settings },
      ];

  const activeTab = navItems.some((n) => n.id === tab) ? tab : 'home';
  const hasEnrolledBio = Boolean(getBioSetting());

  return (
    <>
      {!role ? (
        <AuthView
          settings={settings}
          lock={lock}
          onSaveSettings={handleSaveSettings}
          onAuthenticated={(r, u) => {
            setRole(r);
            setUser(u);
            setTab('home');
          }}
          onUpdateLock={handleUpdateLock}
          onToast={showToast}
        />
      ) : (
        <div className="min-h-screen bg-[#F4F6F8] dark:bg-[#0B0F14] text-slate-900 dark:text-[#EEF1F4] flex flex-col lg:flex-row">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-[#151B22] border-r border-slate-200 dark:border-[#27303A] p-5 justify-between">
            <div>
              <div className="flex items-center gap-3 pb-5 mb-5 border-b border-slate-200 dark:border-[#27303A]">
                {!logoFailed ? (
                  <img
                    src="/assets/aistudio/ic_launcher_329629c3.png"
                    alt="Muscle Max Gym logo"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoFailed(true)}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-[#27303A] shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#D62828] flex items-center justify-center font-display text-lg font-bold text-white shrink-0">
                    MM
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-display text-xl font-bold tracking-wide text-slate-900 dark:text-white truncate">
                    {settings.gym}
                  </div>
                </div>
              </div>

              <nav className="space-y-1.5" aria-label="Primary navigation">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-[#D62828] text-white'
                          : 'text-slate-600 dark:text-[#9AA6B4] hover:bg-slate-100 dark:hover:bg-[#1E2630] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-[#27303A] space-y-2">
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-xs font-semibold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E2630] cursor-pointer"
              >
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => logout('Screen locked')}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-xs font-semibold text-[#C62828] dark:text-[#FF7B72] flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
              >
                <span className="truncate">Lock ({user})</span>
                <Lock className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </aside>

          {/* Mobile Sticky Header (compact <= 56px) */}
          <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-white/95 dark:bg-[#151B22]/95 backdrop-blur-md border-b-2 border-[#D62828] flex items-center justify-between gap-4">
            <div className="font-display text-xl font-bold tracking-wide text-slate-900 dark:text-white truncate">
              {settings.gym}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label="Toggle theme"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#27303A] text-slate-700 dark:text-[#EEF1F4] cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => logout('Screen locked')}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock</span>
              </button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 lg:pl-64">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
              {activeTab === 'home' && (
                <DashboardView
                  members={members}
                  settings={settings}
                  isOwner={isOwner}
                  onAddMember={() => {
                    setEditingMember(null);
                    setFormOpen(true);
                  }}
                  onOpenPay={(m) => setPayingMember(m)}
                  onOpenDetail={(m) => setDetailMember(m)}
                  onQuickCheckIn={handleQuickCheckIn}
                />
              )}

              {activeTab === 'list' && (
                <MembersView
                  members={members}
                  settings={settings}
                  isOwner={isOwner}
                  query={query}
                  filter={filter}
                  onQueryChange={setQuery}
                  onFilterChange={setFilter}
                  onAddMember={() => {
                    setEditingMember(null);
                    setFormOpen(true);
                  }}
                  onOpenPay={(m) => setPayingMember(m)}
                  onOpenEdit={(m) => {
                    setEditingMember(m);
                    setFormOpen(true);
                  }}
                  onOpenDetail={(m) => setDetailMember(m)}
                  onDeleteMember={(m) => guardSensitive(`Delete ${m.name}`, () => setDeletingMember(m))}
                  onQuickCheckIn={handleQuickCheckIn}
                />
              )}

              {activeTab === 'att' && (
                <AttendanceView
                  members={members}
                  selectedDate={attDate}
                  onDateChange={setAttDate}
                  onMark={handleMarkAttendance}
                  onQuickCheckIn={handleQuickCheckIn}
                  onMarkUnmarkedAbsent={handleMarkUnmarkedAbsent}
                  onToast={showToast}
                />
              )}

              {activeTab === 'acc' && isOwner && (
                <AccountsView
                  members={members}
                  expenses={expenses}
                  onAddExpense={handleAddExpense}
                  onDeleteExpense={(id) =>
                    guardSensitive('Delete expense', () => handleDeleteExpense(id))
                  }
                  onToast={showToast}
                />
              )}

              {activeTab === 'set' && (
                <SettingsView
                  settings={settings}
                  members={members}
                  expenses={expenses}
                  role={role}
                  user={user}
                  lastSync={lastSync}
                  onSaveSettings={handleSaveSettings}
                  onImportMembers={handleImportData}
                  onSyncNow={(manual) => runSync(manual)}
                  onToast={showToast}
                />
              )}
            </div>
          </main>

          {/* Mobile Fixed Bottom Tab Bar */}
          <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#151B22]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#27303A] flex items-center"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`flex-1 min-h-[54px] py-2 px-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                    active ? 'text-[#D62828] dark:text-[#FF4D4D]' : 'text-slate-500 dark:text-[#9AA6B4]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="truncate max-w-full">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Member Modals */}
          <MemberFormModal
            open={formOpen}
            member={editingMember}
            members={members}
            settings={settings}
            currentUser={user}
            onClose={() => {
              setFormOpen(false);
              setEditingMember(null);
            }}
            onSave={handleSaveMember}
            onToast={showToast}
          />

          <PaymentModal
            member={payingMember}
            settings={settings}
            currentUser={user}
            onClose={() => setPayingMember(null)}
            onConfirmPayment={handleSaveMember}
          />

          <MemberDetailModal
            member={detailMember}
            settings={settings}
            onClose={() => setDetailMember(null)}
            onUpdateMember={handleSaveMember}
            onToast={showToast}
          />

          <Modal
            open={Boolean(deletingMember)}
            onClose={() => setDeletingMember(null)}
            title="Delete member"
          >
            <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
              Delete <strong className="text-slate-900 dark:text-white">{deletingMember?.name}</strong> permanently?
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deletingMember) handleDeleteMember(deletingMember.id);
                  setDeletingMember(null);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
              >
                Yes, delete
              </button>
            </div>
          </Modal>

          {/* Sensitive Action Security Verification Modal */}
          <Modal
            open={Boolean(sensitiveAction)}
            onClose={() => setSensitiveAction(null)}
            title="Security verification required"
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
                Verify your identity to proceed with: <strong className="text-slate-900 dark:text-white">{sensitiveAction?.label}</strong>
              </p>

              {hasEnrolledBio && (
                <button
                  type="button"
                  onClick={handleSensitiveBiometric}
                  className="w-full min-h-[46px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Fingerprint className="w-5 h-5" />
                  <span>Verify with fingerprint</span>
                </button>
              )}

              <form onSubmit={handleSensitiveCredentialVerify} className="space-y-3">
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4]">
                  {settings.pin ? 'Or enter Quick PIN / Owner password' : 'Enter Owner password'}
                </label>
                <input
                  type="password"
                  value={sensitiveVerifyInput}
                  onChange={(e) => setSensitiveVerifyInput(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSensitiveAction(null)}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#27303A] text-white text-sm font-semibold cursor-pointer"
                  >
                    Verify
                  </button>
                </div>
              </form>
            </div>
          </Modal>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 bottom-20 lg:bottom-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#EEF1F4] text-white dark:text-[#0B0F14] text-sm font-medium shadow-lg max-w-[90vw] text-center"
        >
          {toastMsg}
        </div>
      )}
    </>
  );
}
