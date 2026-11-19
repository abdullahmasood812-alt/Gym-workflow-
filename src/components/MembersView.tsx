import React from 'react';
import { Check, Search, UserPlus } from 'lucide-react';
import type { GymSettings, Member, MemberFilter } from '../types';
import { daysLeft, getMemberStatus, today } from '../utils/date';
import { buildWhatsAppUrl, fillTemplate, formatRs, getBalanceDue } from '../utils/format';

interface MembersViewProps {
  members: Member[];
  settings: GymSettings;
  isOwner: boolean;
  query: string;
  filter: MemberFilter;
  onQueryChange: (q: string) => void;
  onFilterChange: (f: MemberFilter) => void;
  onAddMember: () => void;
  onOpenPay: (member: Member) => void;
  onOpenEdit: (member: Member) => void;
  onOpenDetail: (member: Member) => void;
  onDeleteMember: (member: Member) => void;
  onQuickCheckIn: (member: Member) => void;
}

const FILTERS: Array<{ id: MemberFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'soon', label: 'Expiring Soon' },
  { id: 'expired', label: 'Expired' },
  { id: 'pending', label: 'Pending / Due' },
];

export const MembersView: React.FC<MembersViewProps> = ({
  members,
  settings,
  isOwner,
  query,
  filter,
  onQueryChange,
  onFilterChange,
  onAddMember,
  onOpenPay,
  onOpenEdit,
  onOpenDetail,
  onDeleteMember,
  onQuickCheckIn,
}) => {
  const t = today();
  const qLower = query.toLowerCase();
  const filtered = members
    .filter((m) => {
      const status = getMemberStatus(m);
      const due = getBalanceDue(m);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && status !== 'expired') ||
        (filter === 'soon' && status === 'soon') ||
        (filter === 'expired' && status === 'expired') ||
        (filter === 'pending' && (m.payment_status !== 'Paid' || due > 0));
      const matchesQuery =
        !qLower || `${m.member_code || ''} ${m.name} ${m.phone}`.toLowerCase().includes(qLower);
      return matchesFilter && matchesQuery;
    })
    .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Members
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#9AA6B4] tabular-nums">
            Showing {filtered.length} of {members.length} members
          </p>
        </div>
        <button
          type="button"
          onClick={onAddMember}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>New member</span>
        </button>
      </div>

      {/* Search and Segmented Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search name, phone, or ID (MM-...)"
            aria-label="Search members by name, phone, or ID"
            className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
          />
        </div>

        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] overflow-x-auto"
          role="group"
          aria-label="Filter members"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === f.id
                  ? 'bg-[#D62828] text-white'
                  : 'text-slate-600 dark:text-[#9AA6B4] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">
            {members.length === 0
              ? 'No members yet. Add your first member to start tracking plans and attendance.'
              : 'No members match your current search or filter.'}
          </p>
          {members.length === 0 && (
            <button
              type="button"
              onClick={onAddMember}
              className="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add first member</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((m) => {
            const status = getMemberStatus(m);
            const d = daysLeft(m.expiry_date);
            const due = getBalanceDue(m);
            const checkedInToday = (m.att || []).includes(t);
            const statusLabel = m.frozen_at
              ? 'Paused'
              : status === 'expired'
              ? 'Expired'
              : d === 0
              ? 'Expires today'
              : `${d} days left`;

            const template = due > 0 ? settings.t3 : d < 0 ? settings.t2 : settings.t1;
            const waLink = buildWhatsAppUrl(
              m.phone,
              fillTemplate(template, m, settings),
              settings.cc
            );

            return (
              <div
                key={m.id}
                className={`rounded-xl border p-4 flex flex-col justify-between transition-colors ${
                  m.payment_status === 'Paid' && due === 0
                    ? 'bg-emerald-50/70 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/35'
                    : 'bg-white dark:bg-[#151B22] border-slate-200 dark:border-[#27303A]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(m)}
                        className="text-base font-bold text-slate-900 dark:text-white hover:underline text-left cursor-pointer"
                      >
                        {m.name}
                      </button>
                      <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1 tabular-nums">
                        {m.member_code ? `${m.member_code} · ` : ''}
                        {m.plan} · {formatRs(m.fee)} · {m.phone}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5 tabular-nums">
                        Expiry: {m.expiry_date} · Visits: {(m.att || []).length}
                        {m.goal ? ` · ${m.goal}` : ''}
                      </div>
                      {m.note && (
                        <div className="text-xs text-slate-600 dark:text-[#9AA6B4] mt-1.5">
                          Note: {m.note}
                        </div>
                      )}
                    </div>

                    <div className="text-right text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums">
                      <div
                        className={
                          m.frozen_at
                            ? 'text-slate-500 dark:text-[#9AA6B4]'
                            : status === 'expired'
                            ? 'text-[#C62828] dark:text-[#FF7B72]'
                            : status === 'soon'
                            ? 'text-[#B26A00] dark:text-[#E3A008]'
                            : 'text-[#168A4F] dark:text-[#4CC38A]'
                        }
                      >
                        {statusLabel}
                      </div>
                      <div
                        className={`mt-1 ${
                          due === 0 && m.payment_status === 'Paid'
                            ? 'text-[#168A4F] dark:text-[#4CC38A]'
                            : 'text-[#B26A00] dark:text-[#E3A008]'
                        }`}
                      >
                        {due > 0 ? `Due ${formatRs(due)}` : m.payment_status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-200/70 dark:border-[#27303A]">
                  <button
                    type="button"
                    onClick={() => onQuickCheckIn(m)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                      checkedInToday
                        ? 'bg-[#168A4F] border-[#168A4F] text-white'
                        : 'border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{checkedInToday ? 'Present' : 'Check in'}</span>
                  </button>
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#168A4F] hover:bg-[#127241] text-white text-xs font-semibold inline-flex items-center whitespace-nowrap"
                  >
                    WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenPay(m)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#D62828] hover:bg-[#b91c1c] text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                  >
                    {due > 0 ? 'Collect / Renew' : 'Payment / Renew'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEdit(m)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] text-xs font-medium hover:bg-slate-50 dark:hover:bg-[#1E2630] whitespace-nowrap cursor-pointer"
                  >
                    Edit
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => onDeleteMember(m)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] text-xs font-medium text-[#C62828] dark:text-[#FF7B72] hover:bg-red-50 dark:hover:bg-red-500/10 whitespace-nowrap cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
