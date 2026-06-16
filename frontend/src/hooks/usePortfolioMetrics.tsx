import { useMemo } from 'react';
import { calcPayback, calcBreakEven, calcPortfolioInterest } from '../metrics';
import { fmtPeriod } from '../utils';

// Define TypeScript interfaces for the data shapes
interface Property {
  id: number;
  name: string;
  poss_date?: string;
  market_price?: number;
  loan_amount?: number;
  purchase_price?: number;
  [key: string]: any;
}

interface AvgMonthly {
  income: number;
  expenses: number;
  cashflow: number;
  noi: number;
  noiExpenses: number;
  mortgage: number;
}

interface PortfolioAggregates {
  market: number;
  expNOI: number | null;
  totalExpectedOpEx: number;
  totalMonthlyRent: number;
  expenses: number;
  income: number;
  sellingProfit: number;
  monthlyApprAgg: number;
  totalExpCF: number;
  expApprMo?: number;
  [key: string]: any;
}

/**
 * usePortfolioMetrics — derive all portfolio-level display metrics from shared aggregates.
 *
 * Eliminates the ~40 lines of identical derived-value computation that was
 * copy-pasted between Dashboard and Analytics.
 *
 * @param {Property[]} properties — full property list (needed for ICR interest sum)
 * @param {AvgMonthly} avg        — result of avgMonthly(income, expenses, window)
 * @param {PortfolioAggregates} agg — result of usePortfolioAggregates(...)
 * @param {number} ml         — months left in year (from monthsLeftInYear())
 */
export default function usePortfolioMetrics(
  properties: Property[],
  avg: AvgMonthly,
  agg: PortfolioAggregates,
  ml: number
) {
  return useMemo(() => {
    const annualNOI = avg.noi * 12;

    // Cap Rate & OER
    const capRate = agg.market > 0 ? annualNOI / agg.market : null;
    const expCap  = agg.expNOI != null && agg.market > 0 ? agg.expNOI * 12 / agg.market : null;
    const oer     = avg.income > 0 ? avg.noiExpenses / avg.income : null;
    const expOER  = agg.totalExpectedOpEx > 0 && agg.totalMonthlyRent > 0
      ? agg.totalExpectedOpEx / agg.totalMonthlyRent : null;

    // DSCR
    const dscr    = avg.mortgage > 0 ? avg.noi / avg.mortgage : null;
    const expDSCR = agg.expNOI != null && avg.mortgage > 0 ? agg.expNOI / avg.mortgage : null;

    // ICR
    const totalAnnualInterest = calcPortfolioInterest(properties);
    const icr    = totalAnnualInterest > 0 ? annualNOI / totalAnnualInterest : null;
    const expICR = totalAnnualInterest > 0 && agg.expNOI != null
      ? agg.expNOI * 12 / totalAnnualInterest : null;

    // Expected cash flow / monthly gain
    const expCF = agg.expNOI != null ? agg.expNOI - avg.mortgage : null;
    const expMG = expCF != null ? expCF + (agg.expApprMo ?? 0) : null;
    const mg    = avg.cashflow + agg.monthlyApprAgg;

    // Year-end projection
    const runRate  = agg.sellingProfit + avg.cashflow * ml + agg.monthlyApprAgg * ml;
    const budgeted = expMG != null ? agg.sellingProfit + expMG * ml : null;

    // Payback & Break-even
    const outstanding = agg.expenses - agg.income;
    const payback     = calcPayback(outstanding, avg.cashflow);
    const expPPMonths = agg.totalExpCF > 0
      ? (outstanding <= 0 ? 0 : outstanding / agg.totalExpCF) : null;
    const expPPLabel  = expPPMonths != null
      ? (expPPMonths <= 0 ? 'Exp: Recovered' : 'Exp: ' + fmtPeriod(expPPMonths)) : null;

    const netPos      = agg.sellingProfit;
    const breakEven   = calcBreakEven(netPos, mg);
    const expBEMonths = expMG != null && expMG > 0 && netPos < 0 ? -netPos / expMG : null;
    const expBELabel  = netPos >= 0 ? 'Exp: Reached'
      : expBEMonths != null ? 'Exp: ' + fmtPeriod(expBEMonths) : null;

    return {
      annualNOI,
      capRate, expCap,
      oer, expOER,
      dscr, expDSCR,
      icr, expICR, totalAnnualInterest,
      expCF, expMG, mg,
      runRate, budgeted,
      outstanding, payback, expPPLabel,
      netPos, breakEven, expBELabel,
    };
  }, [properties, avg, agg, ml]);
}