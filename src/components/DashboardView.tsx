import React from 'react';
import { Check, MessageCircle, UserPlus } from 'lucide-react';
import type { GymSettings, Member } from '../types';
import { daysLeft, getAttendanceState, getLastVisit, getMemberStatus, today } from '../utils/date';
import { buildWhatsAppUrl, fillTemplate, formatRs, getBalanceDue } from '../utils/format';

interface DashboardViewProps {
  members: Member[];
  settings: GymSettings;
  isOwner: boolean;
  onAddMember: () => void;
  onOpenPay: (member: Member) => void;
  onOpenDetail: (member: Member) => void;
  onQuickCheckIn: (member: Member) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  members,
  settings,
  isOwner,
  onAddMember,
  onOpenPay,
  onOpenDetail,
  onQuickCheckIn,
}) => {
  const t = today();
  const currentMonth = t.slice(0, 7);

  let activeCount = 0;
  let expiredCount = 0;
  let totalDueAmount = 0;
  let presentTodayCount = 0;
  let monthRevenue = 0;
  let todayRevenue = 0;

  members.forEach((m) => {
    if (getMemberStatus(m) === 'expired') expiredCount++;
    else activeCount++;
    totalDueAmount += getBalanceDue(m);
    if ((m.att || []).includes(t)) presentTodayCount++;
    (m.payments || []).forEach((p) => {
      if (p.d.slice(0, 7) === currentMonth) monthRevenue += Number(p.amt) || 0;
      if (p.d === t) todayRevenue += Number(p.amt) || 0;
    });
  });

  const dueMembers = members
    .filter((m) => !m.frozen_at && (daysLeft(m.expiry_date) <= 3 || getBalanceDue(m) > 0))
    .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));

  const inactiveMembers = members
    .filter((m) => !m.frozen_at && getMemberStatus(m) !== 'expired' && daysLeft(getLastVisit(m)) <= -7)
    .sort((a, b) => (getLastVisit(a) < getLastVisit(b) ? -1 : 1))
    .slice(0, 10);

  const handleDailyReport = () => {
    let p = 0;
    let ab = 0;
    let expiringSoon = 0;

    members.forEach((m) => {
      const state = getAttendanceState(m, t);
      if (state === 'P') p++;
      if (state === 'A') ab++;
      const d = daysLeft(m.expiry_date);
      if (d <= 3 && d >= 0) expiringSoon++;
    });

    const reportText = [
      `Daily report ${t}`,
      `Present: ${p} | Absent: ${ab}`,
      `Collected today: Rs ${todayRevenue}`,
      `Expiring in 3 days: ${expiringSoon}`,
      `Total balance due: Rs ${totalDueAmount}`,
    ].join('\n');

    const url = buildWhatsAppUrl(settings.phone, reportText, settings.cc);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Gym Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#9AA6B4] tabular-nums">
            Daily snapshot for {t}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onAddMember}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>New member</span>
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={handleDailyReport}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#168A4F] hover:bg-[#127241] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Daily report on WhatsApp</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {members.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Total members</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#168A4F] dark:text-[#4CC38A]">
            {activeCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Active memberships</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#C62828] dark:text-[#FF7B72]">
            {expiredCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Expired</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#B26A00] dark:text-[#E3A008]">
            {formatRs(totalDueAmount)}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Balance due</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {presentTodayCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Present today</div>
        </div>
        {isOwner && (
          <>
            <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
              <div className="font-display text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatRs(monthRevenue)}
              </div>
              <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Collected this month</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
              <div className="font-display text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatRs(todayRevenue)}
              </div>
              <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Collected today</div>
            </div>
          </>
        )}
      </div>

      {/* Two-Column Action Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Renewal & Due Queue */}
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              Renewals &amp; dues ({dueMembers.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9AA6B4]">
              Expiring within 3 days, expired, or pending balance.
            </p>
          </div>

          {dueMembers.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 text-sm text-slate-500 dark:text-[#9AA6B4]">
              All memberships and fees are up to date.
            </div>
          ) : (
            <div className="space-y-3">
              {dueMembers.map((m) => {
                const status = getMemberStatus(m);
                const d = daysLeft(m.expiry_date);
                const due = getBalanceDue(m);
                const checkedInToday = (m.att || []).includes(t);
                const statusLabel =
                  status === 'expired'
                    ? `Expired (${Math.abs(d)}d ago)`
                    : d === 0
                    ? 'Expires today'
                    : d <= 3
                    ? `${d} days left`
                    : `${d} days left`;
                const msgTemplate = due > 0 ? settings.t3 : d < 0 ? settings.t2 : settings.t1;
                const waLink = buildWhatsAppUrl(
                  m.phone,
                  fillTemplate(msgTemplate, m, settings),
                  settings.cc
                );

                return (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(m)}
                          className="text-left font-semibold text-slate-900 dark:text-white hover:underline cursor-pointer"
                        >
                          {m.name}
                        </button>
                        <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1 tabular-nums">
                          {m.member_code ? `${m.member_code} · ` : ''}
                          {m.plan} · {formatRs(m.fee)} · {m.phone}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5 tabular-nums">
                          Expiry: {m.expiry_date}
                          {due > 0 ? ` · Due: ${formatRs(due)}` : ''}
                        </div>
                      </div>
                      <div className="text-right text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums">
                        <div
                          className={
                            status === 'expired'
                              ? 'text-[#C62828] dark:text-[#FF7B72]'
                              : status === 'soon'
                              ? 'text-[#B26A00] dark:text-[#E3A008]'
                              : 'text-[#168A4F] dark:text-[#4CC38A]'
                          }
                        >
                          {statusLabel}
                        </div>
                        {due > 0 && (
                          <div className="mt-1 text-[#B26A00] dark:text-[#E3A008]">
                            {m.payment_status} ({formatRs(due)})
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
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
                        {due > 0 ? 'Collect balance' : 'Renew'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickCheckIn(m)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                          checkedInToday
                            ? 'bg-[#168A4F]/15 border-[#168A4F]/40 text-[#168A4F] dark:text-[#4CC38A]'
                            : 'border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{checkedInToday ? 'Checked in' : 'Check in'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Inactive 7+ Days */}
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              Not visited in 7+ days ({inactiveMembers.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9AA6B4]">
              Active members with no recent attendance. Send a friendly nudge.
            </p>
          </div>

          {inactiveMembers.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5 text-sm text-slate-500 dark:text-[#9AA6B4]">
              Everyone is visiting regularly.
            </div>
          ) : (
            <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] divide-y divide-slate-200 dark:divide-[#27303A]">
              {inactiveMembers.map((m) => {
                const last = getLastVisit(m);
                const msg = `Assalam o Alaikum ${m.name}, aap kaafi din se gym nahi aaye. ${settings.gym} aapko miss kar raha hai. Jald wapas aayein!`;
                return (
                  <div key={m.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(m)}
                        className="font-semibold text-sm text-slate-900 dark:text-white hover:underline cursor-pointer text-left"
                      >
                        {m.name}
                      </button>
                      <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5 tabular-nums">
                        Last visit: {last}
                      </div>
                    </div>
                    <a
                      href={buildWhatsAppUrl(m.phone, msg, settings.cc)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#168A4F] hover:bg-[#127241] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      WhatsApp
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
