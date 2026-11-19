import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Expense, ExpenseCategory, Member } from '../types';
import { getLast6Months, today } from '../utils/date';
import { formatRs, getBalanceDue } from '../utils/format';
import { Modal } from './Modal';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Electricity & Utilities',
  'Staff Salary',
  'Equipment & Maintenance',
  'Supplies',
  'Other',
];

interface AccountsViewProps {
  members: Member[];
  expenses: Expense[];
  onAddExpense: (title: string, amount: number, category: ExpenseCategory) => void;
  onDeleteExpense: (id: string) => void;
  onToast: (msg: string) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  members,
  expenses,
  onAddExpense,
  onDeleteExpense,
  onToast,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(() => today().slice(0, 7));
  const [addOpen, setAddOpen] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Rent');
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  let monthRevenue = 0;
  let pendingTotal = 0;
  const modeTotals: Record<string, number> = {};

  members.forEach((m) => {
    (m.payments || []).forEach((p) => {
      if (p.d.slice(0, 7) === selectedMonth) {
        const amt = Number(p.amt) || 0;
        monthRevenue += amt;
        modeTotals[p.mode] = (modeTotals[p.mode] || 0) + amt;
      }
    });
    pendingTotal += getBalanceDue(m);
  });

  const monthExpensesList = expenses
    .filter((x) => x.d.slice(0, 7) === selectedMonth)
    .sort((a, b) => (a.d < b.d ? 1 : -1));

  const monthExpensesTotal = monthExpensesList.reduce((sum, x) => sum + (Number(x.amt) || 0), 0);
  const netProfit = monthRevenue - monthExpensesTotal;

  const categoryTotals: Record<string, number> = {};
  monthExpensesList.forEach((x) => {
    const cat = x.category || 'Other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(x.amt) || 0);
  });

  // 6-month trend
  const months = getLast6Months();
  const revByMonth: Record<string, number> = {};
  const expByMonth: Record<string, number> = {};
  months.forEach((k) => {
    revByMonth[k] = 0;
    expByMonth[k] = 0;
  });

  members.forEach((m) => {
    (m.payments || []).forEach((p) => {
      const k = p.d.slice(0, 7);
      const amt = Number(p.amt) || 0;
      if (k in revByMonth) revByMonth[k] += amt;
    });
  });

  expenses.forEach((x) => {
    const k = x.d.slice(0, 7);
    if (k in expByMonth) expByMonth[k] += Number(x.amt) || 0;
  });

  const maxTrend = Math.max(
    1,
    ...months.map((k) => Math.max(revByMonth[k], expByMonth[k]))
  );

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const title = expTitle.trim();
    const amt = Number(expAmt);
    if (!title || !amt) {
      onToast('Enter expense title and amount');
      return;
    }
    onAddExpense(title, amt, expCategory);
    setExpTitle('');
    setExpAmt('');
    setExpCategory('Rent');
    setAddOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Accounts
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#9AA6B4] tabular-nums">
            Financial ledger for {selectedMonth}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div>
            <label htmlFor="acc-month" className="sr-only">
              Select Month
            </label>
            <input
              id="acc-month"
              type="month"
              max={today().slice(0, 7)}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || today().slice(0, 7))}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add expense</span>
          </button>
        </div>
      </div>

      {/* Monthly KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#168A4F] dark:text-[#4CC38A]">
            {formatRs(monthRevenue)}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Collection</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#C62828] dark:text-[#FF7B72]">
            {formatRs(monthExpensesTotal)}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Expenses</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatRs(netProfit)}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Net profit</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-4">
          <div className="font-display text-3xl font-bold tabular-nums text-[#B26A00] dark:text-[#E3A008]">
            {formatRs(pendingTotal)}
          </div>
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-1">Total balance due</div>
        </div>
      </div>

      {/* Trend & Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Last 6 months
            </h2>
            <div className="text-xs text-slate-500 dark:text-[#9AA6B4]">
              Green: collected · Red: spent
            </div>
          </div>

          <div className="space-y-4">
            {months.map((k) => {
              const revPct = Math.round((revByMonth[k] / maxTrend) * 100);
              const expPct = Math.round((expByMonth[k] / maxTrend) * 100);
              return (
                <div key={k} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-[#9AA6B4] tabular-nums">
                    <span className="font-mono font-medium">{k}</span>
                    <span>
                      {formatRs(revByMonth[k])} / {formatRs(expByMonth[k])}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div
                      className="h-2 rounded-sm bg-[#168A4F] dark:bg-[#4CC38A]"
                      style={{ width: `${Math.max(revByMonth[k] > 0 ? 2 : 0.5, revPct)}%` }}
                    />
                    <div
                      className="h-2 rounded-sm bg-[#C62828] dark:bg-[#FF7B72]"
                      style={{ width: `${Math.max(expByMonth[k] > 0 ? 2 : 0.5, expPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-3">
              Payment modes ({selectedMonth})
            </h2>
            {Object.keys(modeTotals).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">
                No payments recorded for this month.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#27303A]">
                {Object.entries(modeTotals).map(([mode, total]) => (
                  <div key={mode} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-[#9AA6B4]">{mode}</span>
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatRs(total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-5">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-3">
              Expense categories
            </h2>
            {Object.keys(categoryTotals).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">
                No categorized expenses this month.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#27303A]">
                {Object.entries(categoryTotals).map(([cat, total]) => (
                  <div key={cat} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-[#9AA6B4]">{cat}</span>
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatRs(total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Expenses Ledger */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Expenses ({monthExpensesList.length})
        </h2>
        {monthExpensesList.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] p-6 text-sm text-slate-500 dark:text-[#9AA6B4]">
            No expenses recorded for {selectedMonth}.
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] divide-y divide-slate-200 dark:divide-[#27303A]">
            {monthExpensesList.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-sm text-slate-900 dark:text-white">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-[#9AA6B4] mt-0.5 tabular-nums">
                    {item.d} · {item.category || 'Other'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm tabular-nums text-slate-900 dark:text-white">
                    {formatRs(item.amt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    aria-label={`Delete expense ${item.title}`}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#27303A] text-[#C62828] dark:text-[#FF7B72] hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Expense Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add expense">
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="exp-cat">
              Category
            </label>
            <select
              id="exp-cat"
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="exp-title">
              Description (e.g. Monthly rent, AC repair...)
            </label>
            <input
              id="exp-title"
              type="text"
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="exp-amt">
              Amount (Rs)
            </label>
            <input
              id="exp-amt"
              type="number"
              inputMode="numeric"
              value={expAmt}
              onChange={(e) => setExpAmt(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Expense Modal */}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete expense">
        <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
          Delete expense <strong className="text-slate-900 dark:text-white">{deleteTarget?.title}</strong>?
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (deleteTarget) onDeleteExpense(deleteTarget.id);
              setDeleteTarget(null);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
          >
            Yes, delete
          </button>
        </div>
      </Modal>
    </div>
  );
};
