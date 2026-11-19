import React, { useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, Plus, Ruler } from 'lucide-react';
import type { GymSettings, MeasurementEntry, Member, PaymentStatus } from '../types';
import { addDays, addMonths, daysLeft, extendExpiry, today } from '../utils/date';
import {
  buildWhatsAppUrl,
  formatRs,
  generateMemberCode,
  getBalanceDue,
  normalizePhone,
  parsePlans,
} from '../utils/format';
import { Modal } from './Modal';

const GOAL_OPTIONS = [
  'Muscle Gain',
  'Fat Loss',
  'Strength & Conditioning',
  'General Fitness',
  'Athletic Performance',
];

interface MemberFormModalProps {
  open: boolean;
  member: Member | null;
  members: Member[];
  settings: GymSettings;
  currentUser: string;
  onClose: () => void;
  onSave: (member: Member) => void;
  onToast: (msg: string) => void;
}

export const MemberFormModal: React.FC<MemberFormModalProps> = ({
  open,
  member,
  members,
  settings,
  currentUser,
  onClose,
  onSave,
  onToast,
}) => {
  const plans = parsePlans(settings.plans);
  const isNew = !member;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [planIndex, setPlanIndex] = useState(0);
  const [fee, setFee] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paidNow, setPaidNow] = useState('');
  const [paymentOption, setPaymentOption] = useState<'full' | 'partial' | 'pending'>('full');
  const [startDate, setStartDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState('');
  const [goal, setGoal] = useState('Muscle Gain');
  const [trainer, setTrainer] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const pList = parsePlans(settings.plans);
    if (member) {
      const idx = Math.max(0, pList.findIndex((x) => x.n === member.plan));
      setName(member.name);
      setPhone(member.phone);
      setPlanIndex(idx);
      setFee(String(member.fee));
      setDiscount('0');
      setPaidNow('');
      setStartDate(member.start_date);
      setExpiryDate(member.expiry_date);
      setGoal(member.goal || 'Muscle Gain');
      setTrainer(member.trainer || '');
      setNote(member.note || '');
    } else {
      const defaultIdx = pList.findIndex((x) => x.n.toLowerCase() === 'monthly');
      const idx = defaultIdx >= 0 ? defaultIdx : 0;
      const plan = pList[idx];
      const start = today();
      setName('');
      setPhone('');
      setPlanIndex(idx);
      setFee(plan ? String(plan.f) : '');
      setDiscount('0');
      setPaidNow(plan ? String(plan.f) : '');
      setPaymentOption('full');
      setStartDate(start);
      setExpiryDate(plan ? (plan.d ? addDays(start, plan.d) : addMonths(start, plan.m)) : start);
      setGoal('Muscle Gain');
      setTrainer('');
      setNote('');
    }
  }, [open, member, settings.plans]);

  const handlePlanChange = (nextIdx: number) => {
    setPlanIndex(nextIdx);
    const plan = plans[nextIdx];
    if (!plan) return;
    setFee(String(plan.f));
    if (paymentOption === 'full') setPaidNow(String(Math.max(0, plan.f - (Number(discount) || 0))));
    if (startDate) {
      setExpiryDate(plan.d ? addDays(startDate, plan.d) : addMonths(startDate, plan.m));
    }
  };

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    const plan = plans[planIndex];
    if (plan && nextStart) {
      setExpiryDate(plan.d ? addDays(nextStart, plan.d) : addMonths(nextStart, plan.m));
    }
  };

  const netFee = Math.max(0, (Number(fee) || 0) - (Number(discount) || 0));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const p = phone.trim();
    const plan = plans[planIndex];
    if (!n || !p || !startDate || !expiryDate || !plan) {
      onToast('Name, phone, plan, start and expiry are required');
      return;
    }

    const np = normalizePhone(p, settings.cc);
    if (np.length < 11) {
      onToast('Phone number looks invalid');
      return;
    }

    const duplicate = members.find(
      (x) => normalizePhone(x.phone, settings.cc) === np && x.id !== member?.id
    );
    if (duplicate) {
      onToast(`This number already exists: ${duplicate.name}`);
      return;
    }

    const t = today();
    const feeNum = Number(fee) || 0;
    const discNum = Math.max(0, Number(discount) || 0);
    const payable = Math.max(0, feeNum - discNum);

    let status: PaymentStatus = 'Paid';
    let balanceDue = 0;
    let initialPaymentAmt = payable;

    if (isNew) {
      if (paymentOption === 'pending') {
        status = 'Pending';
        balanceDue = payable;
        initialPaymentAmt = 0;
      } else if (paymentOption === 'partial') {
        const paid = Math.max(0, Math.min(payable, Number(paidNow) || 0));
        initialPaymentAmt = paid;
        balanceDue = Math.max(0, payable - paid);
        status = balanceDue === 0 ? 'Paid' : paid === 0 ? 'Pending' : 'Partial';
      }
    }

    const nextMember: Member = member
      ? {
          ...member,
          member_code: member.member_code || generateMemberCode(members),
          name: n,
          phone: p,
          plan: plan.n,
          plan_months: plan.m,
          plan_days: plan.d,
          fee: feeNum,
          start_date: startDate,
          expiry_date: expiryDate,
          goal: goal.trim(),
          trainer: trainer.trim(),
          note: note.trim(),
        }
      : {
          id: `m${Date.now()}`,
          member_code: generateMemberCode(members),
          name: n,
          phone: p,
          plan: plan.n,
          plan_months: plan.m,
          plan_days: plan.d,
          fee: payable,
          balance_due: balanceDue,
          start_date: startDate,
          expiry_date: expiryDate,
          payment_status: status,
          last_payment_date: initialPaymentAmt > 0 ? t : '',
          goal: goal.trim(),
          trainer: trainer.trim(),
          note: note.trim(),
          payments:
            initialPaymentAmt > 0
              ? [
                  {
                    d: t,
                    amt: initialPaymentAmt,
                    mode: 'Cash',
                    by: currentUser,
                    discount: discNum || undefined,
                  },
                ]
              : [],
          att: [],
          measurements: [],
        };

    onSave(nextMember);
    onClose();
    onToast('Member saved');
  };

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'New member' : 'Edit member'}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-name">
              Name
            </label>
            <input
              id="m-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-phone">
              Phone (03XX... or with code)
            </label>
            <input
              id="m-phone"
              type="text"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-plan">
              Plan
            </label>
            <select
              id="m-plan"
              value={planIndex}
              onChange={(e) => handlePlanChange(Number(e.target.value))}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            >
              {plans.map((p, idx) => (
                <option key={p.n} value={idx}>
                  {p.n} (Rs {p.f})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-fee">
              Plan Fee (Rs)
            </label>
            <input
              id="m-fee"
              type="number"
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>

          {isNew && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-disc">
                Discount (Rs)
              </label>
              <input
                id="m-disc"
                type="number"
                inputMode="numeric"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-start">
              Start date
            </label>
            <input
              id="m-start"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-exp">
              Expiry date
            </label>
            <input
              id="m-exp"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
        </div>

        {isNew && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-ps">
                Payment status (Net: {formatRs(netFee)})
              </label>
              <select
                id="m-ps"
                value={paymentOption}
                onChange={(e) => {
                  const val = e.target.value as 'full' | 'partial' | 'pending';
                  setPaymentOption(val);
                  if (val === 'full') setPaidNow(String(netFee));
                  if (val === 'partial') setPaidNow(String(Math.round(netFee / 2)));
                }}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              >
                <option value="full">Paid in full ({formatRs(netFee)})</option>
                <option value="partial">Partial payment (balance due)</option>
                <option value="pending">Pay later (Pending)</option>
              </select>
            </div>

            {paymentOption === 'partial' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-paid-now">
                  Paid now (Rs)
                </label>
                <input
                  id="m-paid-now"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={netFee}
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-goal">
              Fitness goal
            </label>
            <select
              id="m-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            >
              {GOAL_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-trainer">
              Trainer (optional)
            </label>
            <input
              id="m-trainer"
              type="text"
              value={trainer}
              onChange={(e) => setTrainer(e.target.value)}
              placeholder="e.g. Coach Bilal"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="m-note">
            Note (optional: medical notes, timing shift...)
          </label>
          <input
            id="m-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
};

interface PaymentModalProps {
  member: Member | null;
  settings: GymSettings;
  currentUser: string;
  onClose: () => void;
  onConfirmPayment: (updatedMember: Member) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  member,
  settings,
  currentUser,
  onClose,
  onConfirmPayment,
}) => {
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [mode, setMode] = useState('Cash');
  const [receipt, setReceipt] = useState<{
    member: Member;
    amt: number;
    mode: string;
    newExpiry: string;
    remaining: number;
  } | null>(null);

  useEffect(() => {
    if (member) {
      const due = getBalanceDue(member);
      setAmount(String(due > 0 ? due : member.fee));
      setDiscount('0');
      setMode('Cash');
      setReceipt(null);
    }
  }, [member]);

  if (!member) return null;

  const currentDue = getBalanceDue(member);
  const isSettlingExistingDue =
    currentDue > 0 &&
    (member.payment_status === 'Partial' ||
      (!member.last_payment_date && member.payment_status === 'Pending' && daysLeft(member.expiry_date) >= 0));

  const targetTotal = isSettlingExistingDue ? currentDue : member.fee;
  const discNum = Math.max(0, Number(discount) || 0);
  const netTarget = Math.max(0, targetTotal - discNum);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const t = today();
    const amtNum = Math.max(0, Number(amount) || 0);
    const remaining = Math.max(0, netTarget - amtNum);
    const nextStatus: PaymentStatus =
      remaining === 0 ? 'Paid' : amtNum > 0 ? 'Partial' : member.payment_status;

    const nextExpiry = isSettlingExistingDue
      ? member.expiry_date
      : extendExpiry(member.expiry_date > t ? member.expiry_date : t, member);

    const updated: Member = {
      ...member,
      expiry_date: nextExpiry,
      payment_status: nextStatus,
      balance_due: remaining,
      last_payment_date: amtNum > 0 ? t : member.last_payment_date,
      payments: [
        ...(member.payments || []),
        {
          d: t,
          amt: amtNum,
          mode,
          by: currentUser,
          discount: discNum || undefined,
        },
      ],
    };

    onConfirmPayment(updated);
    setReceipt({ member: updated, amt: amtNum, mode, newExpiry: nextExpiry, remaining });
  };

  if (receipt) {
    const balanceNote =
      receipt.remaining > 0 ? ` Baqi balance: Rs ${receipt.remaining}.` : '';
    const receiptMsg = `Assalam o Alaikum ${receipt.member.name}, Rs ${receipt.amt} (${receipt.mode}) mil gaye.${balanceNote} Aapki membership ab ${receipt.newExpiry} tak valid hai. Shukriya! - ${settings.gym}, ${settings.phone}`;
    const waUrl = buildWhatsAppUrl(receipt.member.phone, receiptMsg, settings.cc);

    return (
      <Modal open={true} onClose={onClose} title="Payment recorded">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
            <strong className="text-slate-900 dark:text-white">{receipt.member.name}</strong>: new expiry{' '}
            <strong className="text-slate-900 dark:text-white tabular-nums">{receipt.newExpiry}</strong>
            {receipt.remaining > 0 && (
              <span className="block mt-1 text-[#B26A00] dark:text-[#E3A008] font-medium tabular-nums">
                Remaining balance due: {formatRs(receipt.remaining)}
              </span>
            )}
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#168A4F] hover:bg-[#127241] text-white text-sm font-semibold inline-flex items-center"
            >
              Send receipt on WhatsApp
            </a>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title={`${member.name}: payment`}>
      <form onSubmit={handleConfirm} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
          Current expiry: <span className="tabular-nums font-medium">{member.expiry_date}</span>.{' '}
          {isSettlingExistingDue
            ? `Settling pending balance of ${formatRs(currentDue)}; expiry date stays unchanged.`
            : `Confirming will extend expiry as per the ${member.plan} plan.`}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="pay-amt">
              Amount paying now (Rs)
            </label>
            <input
              id="pay-amt"
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="pay-disc">
              Discount (Rs)
            </label>
            <input
              id="pay-disc"
              type="number"
              inputMode="numeric"
              min={0}
              value={discount}
              onChange={(e) => {
                const d = Math.max(0, Number(e.target.value) || 0);
                setDiscount(e.target.value);
                setAmount(String(Math.max(0, targetTotal - d)));
              }}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1" htmlFor="pay-mode">
            Mode
          </label>
          <select
            id="pay-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
          >
            <option value="Cash">Cash</option>
            <option value="Online/UPI">Online/UPI</option>
            <option value="Bank">Bank</option>
          </select>
        </div>

        {Number(amount) < netTarget && (
          <div className="text-xs text-[#B26A00] dark:text-[#E3A008] font-medium tabular-nums">
            Remaining balance after this payment: {formatRs(Math.max(0, netTarget - (Number(amount) || 0)))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
          >
            Confirm payment
          </button>
        </div>
      </form>
    </Modal>
  );
};

interface MemberDetailModalProps {
  member: Member | null;
  settings: GymSettings;
  onClose: () => void;
  onUpdateMember: (updated: Member) => void;
  onToast: (msg: string) => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  member,
  settings,
  onClose,
  onUpdateMember,
  onToast,
}) => {
  const [tab, setTab] = useState<'overview' | 'body'>('overview');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');

  useEffect(() => {
    if (member) {
      setTab('overview');
      setWeight('');
      setHeight('');
      setWaist('');
      setChest('');
    }
  }, [member?.id]);

  if (!member) return null;

  const t = today();
  const mo = t.slice(0, 7);
  const presentMonth = (member.att || []).filter((x) => x.slice(0, 7) === mo).length;
  const absentMonth = (member.abs || []).filter((x) => x.slice(0, 7) === mo).length;
  const payments = (member.payments || []).slice().reverse();
  const measurements = (member.measurements || []).slice().reverse();
  const due = getBalanceDue(member);

  const handleToggleFreeze = () => {
    if (member.frozen_at) {
      // Resume membership & extend expiry by days frozen
      const frozenDays = Math.max(0, -daysLeft(member.frozen_at));
      const extended = frozenDays > 0 ? addDays(member.expiry_date, frozenDays) : member.expiry_date;
      onUpdateMember({
        ...member,
        frozen_at: undefined,
        expiry_date: extended,
      });
      onToast(
        frozenDays > 0
          ? `Membership resumed (+${frozenDays} frozen days added to expiry)`
          : 'Membership resumed'
      );
    } else {
      onUpdateMember({
        ...member,
        frozen_at: t,
      });
      onToast('Membership paused/frozen');
    }
  };

  const handleAddMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weight);
    const h = Number(height);
    const wa = Number(waist);
    const ch = Number(chest);
    if (!w && !h && !wa && !ch) {
      onToast('Enter at least one measurement');
      return;
    }
    const entry: MeasurementEntry = {
      d: t,
      weightKg: w || undefined,
      heightCm: h || undefined,
      waistIn: wa || undefined,
      chestIn: ch || undefined,
    };
    onUpdateMember({
      ...member,
      measurements: [...(member.measurements || []), entry],
    });
    setWeight('');
    setHeight('');
    setWaist('');
    setChest('');
    onToast('Body progress recorded');
  };

  const passMsg = `Assalam o Alaikum ${member.name}, aapka ${settings.gym} Member Pass:\nID: ${member.member_code || member.id}\nPlan: ${member.plan}\nValid till: ${member.expiry_date}`;

  return (
    <Modal open={true} onClose={onClose} title={member.name} maxWidthClass="max-w-xl">
      <div className="space-y-4">
        {/* Sub-navigation */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-slate-500 dark:text-[#9AA6B4] tabular-nums">
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {member.member_code || 'Member'}
            </span>{' '}
            · {member.phone} · {member.plan} · Expiry {member.expiry_date}
          </div>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A]">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'overview' ? 'bg-[#D62828] text-white' : 'text-slate-600 dark:text-[#9AA6B4]'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setTab('body')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'body' ? 'bg-[#D62828] text-white' : 'text-slate-600 dark:text-[#9AA6B4]'
              }`}
            >
              Body Progress
            </button>
          </div>
        </div>

        {tab === 'overview' ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A] p-3">
                <div className="text-xs text-slate-500 dark:text-[#9AA6B4]">This month</div>
                <div className="text-sm font-semibold mt-0.5 tabular-nums">
                  <span className="text-[#168A4F] dark:text-[#4CC38A]">{presentMonth}P</span> ·{' '}
                  <span className="text-[#C62828] dark:text-[#FF7B72]">{absentMonth}A</span>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A] p-3">
                <div className="text-xs text-slate-500 dark:text-[#9AA6B4]">Goal / Trainer</div>
                <div className="text-sm font-semibold mt-0.5 truncate">
                  {member.goal || 'Fitness'}
                  {member.trainer ? ` · ${member.trainer}` : ''}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A] p-3 col-span-2 sm:col-span-1">
                <div className="text-xs text-slate-500 dark:text-[#9AA6B4]">Balance due</div>
                <div
                  className={`text-sm font-semibold mt-0.5 tabular-nums ${
                    due > 0 ? 'text-[#B26A00] dark:text-[#E3A008]' : 'text-[#168A4F] dark:text-[#4CC38A]'
                  }`}
                >
                  {due > 0 ? formatRs(due) : 'Cleared'}
                </div>
              </div>
            </div>

            {/* Freeze / Pass actions */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleFreeze}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] hover:bg-slate-50 dark:hover:bg-[#1E2630] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {member.frozen_at ? (
                  <>
                    <PlayCircle className="w-4 h-4 text-[#168A4F]" />
                    <span>Resume membership (Frozen since {member.frozen_at})</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-4 h-4 text-[#B26A00]" />
                    <span>Freeze / Pause membership</span>
                  </>
                )}
              </button>

              <a
                href={buildWhatsAppUrl(member.phone, passMsg, settings.cc)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#168A4F] hover:bg-[#127241] text-white text-xs font-semibold inline-flex items-center"
              >
                Send Member ID Pass
              </a>
            </div>

            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-2">
                Payments ({payments.length})
              </h3>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">No payments yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-[#27303A] border-t border-slate-200 dark:border-[#27303A]">
                  {payments.map((p, idx) => (
                    <div key={`${p.d}-${idx}`} className="py-2.5 flex items-center justify-between text-sm tabular-nums">
                      <span className="text-slate-600 dark:text-[#9AA6B4]">
                        {p.d} ({p.mode})
                        {p.discount ? ` · Disc ${formatRs(p.discount)}` : ''}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatRs(p.amt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleAddMeasurement} className="rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A] p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-[#D62828]" />
                <span>Log body measurements</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Weight (kg)"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-xs tabular-nums"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Height (cm)"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-xs tabular-nums"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Waist (in)"
                  value={waist}
                  onChange={(e) => setWaist(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-xs tabular-nums"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Chest (in)"
                  value={chest}
                  onChange={(e) => setChest(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27303A] bg-white dark:bg-[#151B22] text-xs tabular-nums"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#D62828] hover:bg-[#b91c1c] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add measurement</span>
              </button>
            </form>

            {measurements.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">No measurements logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#27303A] border-t border-slate-200 dark:border-[#27303A]">
                {measurements.map((entry, idx) => {
                  const bmi =
                    entry.weightKg && entry.heightCm
                      ? (entry.weightKg / Math.pow(entry.heightCm / 100, 2)).toFixed(1)
                      : null;
                  return (
                    <div key={`${entry.d}-${idx}`} className="py-2.5 flex items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="font-mono text-slate-500 dark:text-[#9AA6B4]">{entry.d}</span>
                      <span className="text-slate-900 dark:text-white font-medium">
                        {[
                          entry.weightKg ? `${entry.weightKg} kg` : null,
                          entry.heightCm ? `${entry.heightCm} cm` : null,
                          bmi ? `BMI ${bmi}` : null,
                          entry.waistIn ? `Waist ${entry.waistIn}"` : null,
                          entry.chestIn ? `Chest ${entry.chestIn}"` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
