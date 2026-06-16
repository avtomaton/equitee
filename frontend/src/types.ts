/**
 * types.ts — Shared TypeScript interfaces for the application.
 *
 * Central location for all data model interfaces to avoid duplication
 * across components, hooks, and contexts.
 */

// ── User & Authentication ────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface User {
  email: string;
  tenant_id: string;
  is_admin: boolean;
  tenant?: Tenant;
  email_verified?: boolean;
  [key: string]: unknown;
}

// ── Renter/Tenant Person ─────────────────────────────────────────────────────
// Represents a person who rents a property (not the organization/tenant)

export interface Renter {
  id?: number;
  name?: string;
  property_id?: number;
  property_name?: string;
  status?: string;
  phone?: string;
  email?: string;
  lease_start?: string;
  lease_end?: string;
  rent?: number;
  deposit?: number;
  notes?: string;
  [key: string]: unknown;
}

// ── Portfolio Data ───────────────────────────────────────────────────────────

export interface Property {
  id: number;
  name: string;
  type?: string;
  city?: string;
  province?: string;
  address?: string;
  status?: string;
  market_price?: number;
  purchase_price?: number;
  total_income?: number;
  total_expenses?: number;
  loan_amount?: number;
  monthly_rent?: number;
  notes?: string;
  poss_date?: string;
  is_archived?: boolean;
  expected_condo_fees?: number;
  expected_insurance?: number;
  expected_utilities?: number;
  expected_misc_expenses?: number;
  annual_property_tax?: number;
  expected_appreciation_pct?: number;
  mortgage_rate?: number;
  mortgage_payment?: number;
  mortgage_frequency?: string;
  [key: string]: unknown;
}

export interface Income {
  id: number;
  property_id: number;
  property_name?: string;
  amount?: number;
  income_date?: string;
  income_type?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface Expense {
  id: number;
  property_id: number;
  property_name?: string;
  amount?: number;
  expense_date?: string;
  expense_category?: string;
  expense_type?: string;
  notes?: string;
  tax_deductible?: boolean;
  loan_amount?: number;
  [key: string]: unknown;
}

export interface Event {
  id: number;
  property_id: number;
  property_name?: string;
  column_name?: string;
  old_value?: string | number | null;
  new_value?: string | number | null;
  description?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Group {
  id: number;
  name: string;
  is_default?: boolean;
  is_builtin?: boolean;
  property_ids?: number[];
  [key: string]: unknown;
}

// ── API Response Types ───────────────────────────────────────────────────────

export interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  user: {
    email: string;
    tenant_id: string;
    is_admin?: boolean;
    id?: number;
    role?: string;
    email_verified?: boolean;
  };
  tenant?: Tenant;
}

export interface ApiError {
  error: string;
  code?: string;
  email?: string;
}

// ── Metrics & Aggregates ─────────────────────────────────────────────────────

export interface AvgMonthly {
  income: number;
  expenses: number;
  cashflow: number;
  noi: number;
  noiExpenses: number;
  mortgage: number;
}

export interface PortfolioAggregates {
  market: number;
  purchase: number;
  loan: number;
  income: number;
  expenses: number;
  equity: number;
  appr: number;
  apprPct: number | null;
  equityPct: number | null;
  loanPct: number | null;
  netBalance: number;
  roi: number | null;
  occupancyPct: number | null;
  occupied: number;
  sellingProfit: number;
  balance: number;
  totalExpectedOpEx: number;
  expNOI: number | null;
  totalExpectedYearlyAppr: number;
  expYearlyApprPct: number | null;
  projectedYE: number;
  perPropAvg: Record<string, { cashflow: number | null; noi: number | null }>;
}

export interface PortfolioMetrics {
  capRate: number | null;
  expCap: number | null;
  oer: number | null;
  expOER: number | null;
  dscr: number | null;
  expDSCR: number | null;
  icr: number | null;
  expICR: number | null;
  mg: number | null;
  expMG: number | null;
  payback: number | null;
  expPPLabel: string | null;
  outstanding: number;
  breakEven: number | null;
  expBELabel: string | null;
  runRate: number;
  budgeted: number;
}

// ── Component Props ──────────────────────────────────────────────────────────

export interface NavigableProps {
  onNavigate: (view: string) => void;
}

export interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ── Modal Types ──────────────────────────────────────────────────────────────

export type ModalType = 'property' | 'expense' | 'income' | 'tenant';

export interface ModalState<T = unknown, C = unknown> {
  type: ModalType;
  data: T | null;
  context: C | null;
}

// ── Transaction Record Types ─────────────────────────────────────────────────

export interface TransactionRecord {
  id: number;
  property_id: number;
  property_name?: string;
  amount: number;
  [key: string]: unknown;
}

export type IncomeRecord = TransactionRecord & {
  income_date?: string;
  income_type?: string;
  notes?: string;
};

export type ExpenseRecord = TransactionRecord & {
  expense_date?: string;
  expense_category?: string;
  expense_type?: string;
  notes?: string;
  tax_deductible?: boolean;
  loan_amount?: number;
};
