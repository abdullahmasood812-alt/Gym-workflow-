export type Role = 'owner' | 'staff';

export type TabId = 'home' | 'list' | 'att' | 'acc' | 'set';

export type MemberFilter = 'all' | 'active' | 'soon' | 'expired' | 'pending';

export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';

export type PaymentMode = 'Cash' | 'Online/UPI' | 'Bank';

export type ExpenseCategory =
  | 'Rent'
  | 'Electricity & Utilities'
  | 'Staff Salary'
  | 'Equipment & Maintenance'
  | 'Supplies'
  | 'Other';

export interface Payment {
  d: string;
  amt: number;
  mode: string;
  by: string;
  discount?: number;
  note?: string;
}

export interface MeasurementEntry {
  d: string;
  weightKg?: number;
  heightCm?: number;
  waistIn?: number;
  chestIn?: number;
  note?: string;
}

export interface Member {
  id: string;
  member_code?: string;
  name: string;
  phone: string;
  plan: string;
  plan_months: number;
  plan_days: number;
  fee: number;
  balance_due?: number;
  start_date: string;
  expiry_date: string;
  payment_status: PaymentStatus;
  last_payment_date: string;
  goal?: string;
  trainer?: string;
  frozen_at?: string;
  note: string;
  payments: Payment[];
  att: string[];
  abs?: string[];
  measurements?: MeasurementEntry[];
}

export interface Expense {
  id: string;
  d: string;
  title: string;
  amt: number;
  category?: ExpenseCategory;
}

export interface UserCredentials {
  u: string;
  s: string;
  h: string;
}

export interface RecoveryConfig {
  i: number;
  s: string;
  h: string;
}

export interface PinConfig {
  s: string;
  h: string;
}

export interface GymSettings {
  gym: string;
  phone: string;
  cc: string;
  t1: string;
  t2: string;
  t3: string;
  plans: string;
  owner: UserCredentials | null;
  staff: UserCredentials | null;
  sheet: string;
  rec: RecoveryConfig | null;
  pin?: PinConfig | null;
  requireBioForSensitive?: boolean;
}

export interface PlanDef {
  n: string;
  m: number;
  d: number;
  f: number;
}

export interface LockState {
  n?: number;
  until?: number;
}

export interface BioSetting {
  role: Role;
  user: string;
  credentialId?: string;
  mode?: 'native' | 'webauthn';
  enabledAt?: string;
}
