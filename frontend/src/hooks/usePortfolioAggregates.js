import { useMemo } from 'react';
import { yearsHeld, avgMonthly, calcExpected, principalInRange, extractRateHistory } from '../metrics.js';
import { makeInTrailingYear, trailingYear } from '../utils.js';

/**
 * usePortfolioAggregates — compute portfolio-level aggregates from property records
 * plus loaded income/expense arrays.
 *
 * Both Dashboard and Analytics use this hook so the logic lives in one place.
 *
 * @param {object[]} properties  — property records (include total_income, total_expenses, etc.)
 * @param {object[]} allIncome   — flat income records with income_date and amount
 * @param {object[]} allExpenses — flat expense records with expense_date, amount, property_id
 * @returns {object} agg — all aggregated values
 */
export function usePortfolioAggregates(properties, allIncome, allExpenses, allEvents = {}) {
  return useMemo(() => {
    const market   = properties.reduce((s, p) => s + p.market_price,   0);
    const purchase = properties.reduce((s, p) => s + p.purchase_price, 0);
    const loan     = properties.reduce((s, p) => s + p.loan_amount,    0);
    const income   = properties.reduce((s, p) => s + p.total_income,   0);
    const expenses = properties.reduce((s, p) => s + p.total_expenses, 0);

    const equity    = market - loan;
    const equityPct = market > 0 ? equity / market * 100 : null;
    const loanPct   = market > 0 ? loan   / market * 100 : null;
    const appr      = market - purchase;
    const apprPct   = purchase > 0 ? appr / purchase * 100 : null;

    const yearlyAppr = properties.reduce((s, p) => {
      const yrs = yearsHeld(p);
      return yrs ? s + (p.market_price - p.purchase_price) / yrs : s;
    }, 0);
    const yearlyApprPct  = purchase > 0 ? yearlyAppr / purchase * 100 : null;
    const monthlyApprAgg = yearlyAppr / 12;

    const now      = new Date();
    const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
    const projectedYE = market + yearlyAppr * (1 - yearFrac);

    const allTimePrin = properties.reduce((sum, p) => {
      const pe       = allExpenses.filter(r => r.property_id === p.id);
      const rateHist = extractRateHistory(allEvents[p.id] ?? []);
      return sum + principalInRange(pe, p.loan_amount, p.mortgage_rate || 0, new Date(0), new Date(), rateHist);
    }, 0);

    // Net Expenses = Total Expenses − allTimePrin
    // allTimePrin = all Principal-category expenses (down payment + mortgage principal repayments)
    const totalNetExp   = expenses - allTimePrin;
    const balance       = income - expenses;
    const netBalance    = income - totalNetExp;
    const roi           = market > 0 ? netBalance / market * 100 : null;
    const sellingProfit = properties.reduce((s, p) =>
      s + p.market_price + p.total_income - p.total_expenses - p.loan_amount, 0);

    // YTD (trailing 12 months)
    const { start: ytdStart, end: ytdEnd } = trailingYear();
    const inYTD = makeInTrailingYear();

    const ytdInc  = allIncome.filter(r   => inYTD(r.income_date)).reduce((s, r) => s + r.amount, 0);
    const ytdExp  = allExpenses.filter(r => inYTD(r.expense_date)).reduce((s, r) => s + r.amount, 0);
    const ytdBal  = ytdInc - ytdExp;
    const ytdPrin = properties.reduce((sum, p) => {
      const pe       = allExpenses.filter(r => r.property_id === p.id);
      const rateHist = extractRateHistory(allEvents[p.id] ?? []);
      return sum + principalInRange(pe, p.loan_amount, p.mortgage_rate || 0, ytdStart, ytdEnd, rateHist);
    }, 0);
    const ytdNetExp     = ytdExp  - ytdPrin;
    const ytdNetBalance = ytdInc  - ytdNetExp;

    // Per-property YTD income (for PropertyCard badges)
    const ytdIncomeByProp = {};
    properties.forEach(p => {
      ytdIncomeByProp[p.id] = allIncome
        .filter(r => r.property_id === p.id && inYTD(r.income_date))
        .reduce((s, r) => s + r.amount, 0);
    });

    const occupied     = properties.filter(p => p.status !== 'Vacant').length;
    const occupancyPct = properties.length > 0 ? occupied / properties.length * 100 : null;

    // Expected / budgeted aggregates
    const totalMonthlyRent = properties.reduce((s, p) => s + (p.monthly_rent || 0), 0);

    const totalExpectedOpEx = properties.reduce((s, p) => {
      const v = (p.expected_condo_fees    || 0)
              + (p.expected_insurance     || 0)
              + (p.expected_utilities     || 0)
              + (p.expected_misc_expenses || 0)
              + (p.annual_property_tax    || 0) / 12;
      return v > 0 ? s + v : s;
    }, 0);

    const propertiesWithExpected = properties.filter(p =>
      (p.expected_condo_fees    || 0) +
      (p.expected_insurance     || 0) +
      (p.expected_utilities     || 0) +
      (p.expected_misc_expenses || 0) +
      (p.annual_property_tax    || 0) > 0
    ).length;

    const totalExpectedYearlyAppr = properties.reduce((s, p) =>
      p.expected_appreciation_pct > 0
        ? s + p.purchase_price * p.expected_appreciation_pct / 100
        : s
    , 0);

    const expYearlyApprPct = purchase > 0 && totalExpectedYearlyAppr > 0
      ? totalExpectedYearlyAppr / purchase * 100 : null;

    // Expected monthly NOI and appreciation — window-independent, reused by components
    // to compute expCF = expNOI - avg.mortgage and expMG = expCF + expApprMo
    const expNOI    = totalExpectedOpEx > 0 ? totalMonthlyRent - totalExpectedOpEx : null;
    const expApprMo = totalExpectedYearlyAppr > 0 ? totalExpectedYearlyAppr / 12 : null;

    // Per-property 3-month average (used for expected payback / break-even)
    const perPropAvg = {};
    for (const p of properties) {
      const inc = allIncome.filter(r   => r.property_id === p.id);
      const exp = allExpenses.filter(r => r.property_id === p.id);
      perPropAvg[p.id] = avgMonthly(inc, exp, 3);
    }

    // Total expected monthly cash flow (sum across properties with budget data)
    const totalExpCF = properties.reduce((s, p) => {
      const e = calcExpected(p, perPropAvg[p.id]?.mortgage ?? 0);
      return e ? s + e.monthlyCF : s;
    }, 0);

    return {
      market, purchase, loan, income, expenses,
      equity, equityPct, loanPct,
      appr, apprPct,
      yearlyAppr, yearlyApprPct, monthlyApprAgg, projectedYE,
      totalNetExp, balance, netBalance, roi, sellingProfit,
      allTimePrin,
      ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdNetBalance,
      ytdIncomeByProp,
      occupied, occupancyPct,
      totalMonthlyRent, totalExpectedOpEx, propertiesWithExpected,
      totalExpectedYearlyAppr, expYearlyApprPct,
      expNOI, expApprMo, perPropAvg, totalExpCF,
    };
  }, [properties, allIncome, allExpenses, allEvents]);
}
