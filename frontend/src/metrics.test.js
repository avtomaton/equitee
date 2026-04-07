/**
 * Tests for metrics.js - financial calculation helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  calcMortgagePayment,
  calcIRR,
  monthlyMortgageEquiv,
  calcExpected,
  expGapCls,
  yearsHeld,
} from './metrics.js';

describe('calcMortgagePayment', () => {
  it('calculates payment for standard loan', () => {
    const payment = calcMortgagePayment(300000, 5.0, 25);
    expect(payment).toBeGreaterThan(0);
    // Monthly payment for 300k at 5% over 25 years should be ~1754
    expect(payment).toBeCloseTo(1753.35, 0);
  });

  it('handles 0% interest rate', () => {
    const payment = calcMortgagePayment(300000, 0, 25);
    expect(payment).toBe(1000); // 300000 / (25 * 12)
  });

  it('returns 0 for missing principal', () => {
    expect(calcMortgagePayment(0, 5.0, 25)).toBe(0);
    expect(calcMortgagePayment(null, 5.0, 25)).toBe(0);
  });

  it('returns 0 for missing amortization', () => {
    expect(calcMortgagePayment(300000, 5.0, 0)).toBe(0);
    expect(calcMortgagePayment(300000, 5.0, null)).toBe(0);
  });

  it('higher rate means higher payment', () => {
    const low = calcMortgagePayment(300000, 3.0, 25);
    const high = calcMortgagePayment(300000, 7.0, 25);
    expect(high).toBeGreaterThan(low);
  });

  it('shorter amortization means higher payment', () => {
    const short = calcMortgagePayment(300000, 5.0, 15);
    const long = calcMortgagePayment(300000, 5.0, 25);
    expect(short).toBeGreaterThan(long);
  });
});

describe('calcIRR', () => {
  it('returns null for single cash flow', () => {
    expect(calcIRR([1000])).toBeNull();
  });

  it('returns null for all positive cash flows', () => {
    expect(calcIRR([100, 200, 300])).toBeNull();
  });

  it('returns null for all negative cash flows', () => {
    expect(calcIRR([-100, -200, -300])).toBeNull();
  });

  it('calculates IRR for simple investment', () => {
    // Invest 1000, get back 100/month for 12 months
    const cashFlows = [-1000, ...new Array(12).fill(100)];
    const irr = calcIRR(cashFlows);
    expect(irr).not.toBeNull();
    // Monthly IRR should be around 2.9%, annualized ~41%
    expect(irr).toBeGreaterThan(0);
  });

  it('returns null for empty array', () => {
    expect(calcIRR([])).toBeNull();
  });
});

describe('monthlyMortgageEquiv', () => {
  it('returns payment for monthly frequency', () => {
    expect(monthlyMortgageEquiv(1000, 'monthly')).toBe(1000);
  });

  it('doubles for semi-monthly', () => {
    expect(monthlyMortgageEquiv(500, 'semi-monthly')).toBe(1000);
  });

  it('calculates bi-weekly correctly', () => {
    expect(monthlyMortgageEquiv(500, 'bi-weekly')).toBeCloseTo(500 * 26 / 12);
  });

  it('calculates weekly correctly', () => {
    expect(monthlyMortgageEquiv(250, 'weekly')).toBeCloseTo(250 * 52 / 12);
  });

  it('defaults to monthly for missing frequency', () => {
    expect(monthlyMortgageEquiv(1000, null)).toBe(1000);
    expect(monthlyMortgageEquiv(1000, '')).toBe(1000);
  });

  it('returns 0 for missing payment', () => {
    expect(monthlyMortgageEquiv(0, 'monthly')).toBe(0);
    expect(monthlyMortgageEquiv(null, 'monthly')).toBe(0);
  });
});

describe('calcExpected', () => {
  const baseProperty = {
    monthly_rent: 2500,
    expected_condo_fees: 300,
    expected_insurance: 150,
    expected_utilities: 100,
    expected_misc_expenses: 50,
    annual_property_tax: 4000,
    expected_appreciation_pct: 3.0,
    purchase_price: 500000,
    market_price: 550000,
    loan_amount: 400000,
    mortgage_payment: 0,
    mortgage_frequency: 'monthly',
  };

  it('returns null if no expected costs entered', () => {
    const empty = { ...baseProperty, expected_condo_fees: 0, expected_insurance: 0, expected_utilities: 0, expected_misc_expenses: 0, annual_property_tax: 0 };
    expect(calcExpected(empty, 0)).toBeNull();
  });

  it('returns null if no monthly rent', () => {
    const noRent = { ...baseProperty, monthly_rent: 0 };
    expect(calcExpected(noRent, 0)).toBeNull();
  });

  it('calculates expected metrics when data is available', () => {
    const result = calcExpected(baseProperty, 2000);
    expect(result).not.toBeNull();
    expect(result.monthlyOpEx).toBeGreaterThan(0);
    expect(result.monthlyNOI).toBeLessThan(baseProperty.monthly_rent);
  });
});

describe('expGapCls', () => {
  it('returns empty for null values', () => {
    expect(expGapCls(100, null)).toEqual({ cls: '', gapStr: null });
    expect(expGapCls(null, 100)).toEqual({ cls: '', gapStr: null });
  });

  it('returns empty for both near zero', () => {
    expect(expGapCls(10, 15)).toEqual({ cls: '', gapStr: null });
  });

  it('returns success when actual better than expected (higher is better)', () => {
    const result = expGapCls(120, 100, true);
    expect(result.cls).toBe('text-success');
    expect(result.gapStr).toContain('better');
  });

  it('returns danger when actual worse than expected (higher is better)', () => {
    const result = expGapCls(80, 100, true);
    expect(result.cls).toBe('text-danger');
    expect(result.gapStr).toContain('worse');
  });

  it('returns success when actual lower than expected (lower is better)', () => {
    const result = expGapCls(80, 100, false);
    expect(result.cls).toBe('text-success');
  });

  it('returns danger when actual higher than expected (lower is better)', () => {
    const result = expGapCls(120, 100, false);
    expect(result.cls).toBe('text-danger');
  });
});

describe('yearsHeld', () => {
  it('returns null if no poss_date', () => {
    expect(yearsHeld({})).toBeNull();
    expect(yearsHeld({ poss_date: null })).toBeNull();
  });

  it('returns positive years for past possession', () => {
    const result = yearsHeld({ poss_date: '2020-01-01' });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeGreaterThan(4); // At least 4+ years since 2020
  });

  it('returns null for future possession', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const futureStr = `${future.getFullYear()}-01-01`;
    expect(yearsHeld({ poss_date: futureStr })).toBeNull();
  });
});
