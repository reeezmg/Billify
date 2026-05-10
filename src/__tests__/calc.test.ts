import { describe, expect, it } from 'vitest';
import { calculateSplit } from '../lib/calc';

describe('calculateSplit', () => {
  it('keeps zero-consumption row at zero for proportional charges', () => {
    const result = calculateSplit({
      bill: { fixed_charge: 100, energy_charge: 100, energy_unit_price: 10, extra_charge: 20, tax: 5, interest_charge: 10, other_charge: 0 },
      split: { tax_rate: 5 },
      rows: [
        { tenant_id: 1, previous_reading: 0, present_reading: 0, fixed_adjust: 0, extra_adjust: 0, interest_adjust: 0 },
        { tenant_id: 2, previous_reading: 0, present_reading: 10, fixed_adjust: 0, extra_adjust: 0, interest_adjust: 0 },
      ],
    });
    expect(result.rows[0].fixed_charge_calc).toBe(0);
    expect(result.rows[0].extra_charge_calc).toBe(0);
    expect(result.rows[0].interest_charge_calc).toBe(0);
  });

  it('adds adjustments on top of calculated values', () => {
    const result = calculateSplit({
      bill: { fixed_charge: 100, energy_charge: 100, energy_unit_price: 10, extra_charge: 20, tax: 0, interest_charge: 10, other_charge: 0 },
      split: { tax_rate: 0 },
      rows: [{ tenant_id: 1, previous_reading: 0, present_reading: 10, fixed_adjust: 50, extra_adjust: 5, interest_adjust: 7 }],
    });
    expect(result.rows[0].payable).toBeGreaterThan(result.rows[0].sub_total - 1);
  });

  it('keeps energy calculated while applying other final adjustments', () => {
    const result = calculateSplit({
      bill: { fixed_charge: 0, energy_charge: 100, energy_unit_price: 10, extra_charge: 0, tax: 0, interest_charge: 0, other_charge: 20 },
      split: { tax_rate: 0 },
      rows: [
        {
          tenant_id: 1,
          previous_reading: 0,
          present_reading: 10,
          fixed_adjust: 0,
          extra_adjust: 0,
          interest_adjust: 0,
          other_adjust: 5,
        },
      ],
    });

    expect(result.rows[0].energy_charge_calc).toBe(100);
    expect(result.rows[0].energy_charge).toBe(100);
    expect(result.rows[0].other_charge_calc).toBe(20);
    expect(result.rows[0].other_charge).toBe(25);
  });

  it('uses adjusted final amounts when calculating bill differences', () => {
    const result = calculateSplit({
      bill: { fixed_charge: 100, energy_charge: 100, energy_unit_price: 10, extra_charge: 20, tax: 0, interest_charge: 10, other_charge: 5 },
      split: { tax_rate: 0 },
      rows: [
        {
          tenant_id: 1,
          previous_reading: 0,
          present_reading: 10,
          fixed_adjust: 20,
          extra_adjust: 5,
          interest_adjust: -2,
          other_adjust: 1,
        },
      ],
    });

    expect(result.reconciliation.fixed_diff).toBe(-20);
    expect(result.reconciliation.energy_diff).toBe(0);
    expect(result.reconciliation.extra_diff).toBe(-5);
    expect(result.reconciliation.interest_diff).toBe(2);
    expect(result.reconciliation.other_diff).toBe(-1);
  });
});
