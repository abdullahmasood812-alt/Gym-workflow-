import React, { useState } from 'react';
import { Check, Search, UserCheck, X } from 'lucide-react';
import type { Member } from '../types';
import { getAttendanceState, getMemberStatus, today } from '../utils/date';
import { formatRs, getBalanceDue } from '../utils/format';
import { Modal } from './Modal';

interface AttendanceViewProps {
  members: Member[];
  selectedDate: string;
  onDateChange: (d: string) => void;
  onMark: (memberId: string, state: 'P' | 'A') => void;
  onQuickCheckIn: (member: Member) => void;
  onMarkUnmarkedAbsent: (dateStr: string) => void;
  onToast: (msg: string) => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  members,
  selectedDate,
  onDateChange,
  onMark,
  onQuickCheckIn,
  onMarkUnmarkedAbsent,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [quickCode, setQuickCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sorted = members
    .slice()
    .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));

  let presentCount = 0;
  let absentCount = 0;
  sorted.forEach((m) => {
    const s = getAttendanceState(m, selectedDate);
    if (s === 'P') presentCount++;
    if (s === 'A') absentCount++;
  });

  const qLower = search.toLowerCase();
  const visible = sorted.filter(
    (m) =>
      !qLower ||
      `${m.member_code || ''} ${m.name} ${m.phone}`.toLowerCase().includes(qLower)
  );

  const handleQuickDeskCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    const term = quickCode.trim().toLowerCase();
    if (!term) return;
    const match =
      members.find((m) => (m.member_code || '').toLowerCase() === term) ||
      members.find((m) => m.phone.replace(/\D/g, '').endsWith(term.replace(/\D/g, '')) && term.replace(/\D/g, '').length >= 4) ||
      members.find((m) => m.name.toLowerCase() === term) ||
      members.find((m) => m.name.toLowerCase().includes(term));

    if (!match) {
      onToast('No matching member found for quick check-in');
      return;
    }

    onQuickCheckIn(match);
    setQuickCode('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Attendance
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">
            Fast check-ins, daily headcount, and expiry alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div>
            <label htmlFor="att-date" className="sr-only">
              Attendance Date
            </label>
            <input
              id="att-date"
              type="date"
              max={today()}
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value || today())}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={members.length === 0}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-sm font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            Mark unmarked as absent
          </button>
        </div>
      </div>

      {/* Quick Check-In Desk Bar */}
      <form
        onSubmit={handleQuickDeskCheckIn}
        className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
      >
        <div className="flex-1">
          <label htmlFor="quick-checkin" className="block text-xs font-medium text-slate-500 dark:text-[#9AA6B4] mb-1">
            Quick Desk Check-In (Member ID, phone last digits, or name)
          </label>
          <input
            id="quick-checkin"
            type="text"
            value={quickCode}
            onChange={(e) => setQuickCode(e.target.value)}
            placeholder="e.g. MM-1001, 82184, or Ali"
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
          />
        </div>
        <button
          type="submit"
          className="min-h-[44px] sm:mt-5 px-5 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <UserCheck className="w-4 h-4" />
          <span>Check in</span>
        </button>
      </form>

      {/* Present / Absent Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md">
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#168A4F] dark:text-[#4CC38A]">
            {presentCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Present</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#C62828] dark:text-[#FF7B72]">
            {absentCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Absent</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter list by name, phone, or ID"
          aria-label="Filter attendance list"
          className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
        />
      </div>

      {/* Member Rows */}
      {visible.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-6 text-sm text-slate-500 dark:text-[#9AA6B4]">
          No members found.
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] divide-y divide-slate-200 dark:divide-[#27303A]">
          {visible.map((m) => {
            const state = getAttendanceState(m, selectedDate);
            const expired = getMemberStatus(m) === 'expired';
            const due = getBalanceDue(m);

            return (
              <div
                key={m.id}
                className="p-3.5 sm:px-5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {m.name}
                    </span>
                    {expired && (
                      <span className="text-xs font-semibold text-[#C62828] dark:text-[#FF7B72]">
                        · Expired
                      </span>
                    )}
                    {due > 0 && (
                      <span className="text-xs font-semibold text-[#B26A00] dark:text-[#E3A008] tabular-nums">
                        · Due {formatRs(due)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5 tabular-nums">
                    {m.member_code ? `${m.member_code} · ` : ''}
                    {m.phone} · {(m.att || []).length} visits
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMark(m.id, 'P')}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer ${
                      state === 'P'
                        ? 'bg-[#168A4F] border-[#168A4F] text-white'
                        : 'border-slate-200 dark:border-[#27303A] text-slate-700 dark:text-[#EEF1F4] hover:bg-slate-50 dark:hover:bg-[#1E2630]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Present</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onMark(m.id, 'A')}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer ${
                      state === 'A'
                        ? 'bg-[#C62828] border-[#C62828] text-white'
                        : 'border-slate-200 dark:border-[#27303A] text-slate-700 dark:text-[#EEF1F4] hover:bg-slate-50 dark:hover:bg-[#1E2630]'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Absent</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Mark unmarked as absent">
        <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
          Mark every unmarked member as absent on <strong className="text-slate-900 dark:text-white tabular-nums">{selectedDate}</strong>?
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onMarkUnmarkedAbsent(selectedDate);
              setConfirmOpen(false);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
          >
            Yes, mark absent
          </button>
        </div>
      </Modal>
    </div>
  );
};
