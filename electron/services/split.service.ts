import type { SplitBillInput, SplitBillResult } from '../types';

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSplit(input: SplitBillInput): SplitBillResult {
  const rowsWithConsumption = input.rows.map((row) => ({
    ...row,
    consumed_unit: Math.max(0, row.present_reading - row.previous_reading),
  }));

  const totalConsumed = rowsWithConsumption.reduce((sum, row) => sum + row.consumed_unit, 0);

  const rows = rowsWithConsumption.map((row) => {
    const ratio = totalConsumed > 0 ? row.consumed_unit / totalConsumed : 0;
    const fixed_charge_calc = input.bill.fixed_charge * ratio;
    const extra_charge_calc = input.bill.extra_charge * ratio;
    const interest_charge_calc = input.bill.interest_charge * ratio;
    const other_charge_calc = input.bill.other_charge * ratio;
    const energy_charge = row.consumed_unit * input.bill.energy_unit_price;
    const fixed_total = fixed_charge_calc + row.fixed_adjust;
    const extra_total = extra_charge_calc + row.extra_adjust;
    const interest_total = interest_charge_calc + row.interest_adjust;
    const tax = (fixed_total + energy_charge + extra_total) * (input.split.tax_rate / 100);
    const sub_total = fixed_total + energy_charge + extra_total + tax;
    const payable = sub_total + interest_total + other_charge_calc;

    return {
      ...row,
      ratio,
      fixed_charge_calc: round(fixed_charge_calc),
      energy_charge: round(energy_charge),
      extra_charge_calc: round(extra_charge_calc),
      tax: round(tax),
      sub_total: round(sub_total),
      interest_charge_calc: round(interest_charge_calc),
      other_charge_calc: round(other_charge_calc),
      payable: round(payable),
      consumed_unit: round(row.consumed_unit),
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      consumed_unit: round(acc.consumed_unit + row.consumed_unit),
      fixed_charge_calc: round(acc.fixed_charge_calc + row.fixed_charge_calc),
      energy_charge: round(acc.energy_charge + row.energy_charge),
      extra_charge_calc: round(acc.extra_charge_calc + row.extra_charge_calc),
      tax: round(acc.tax + row.tax),
      sub_total: round(acc.sub_total + row.sub_total),
      interest_charge_calc: round(acc.interest_charge_calc + row.interest_charge_calc),
      other_charge_calc: round(acc.other_charge_calc + row.other_charge_calc),
      payable: round(acc.payable + row.payable),
    }),
    {
      consumed_unit: 0,
      fixed_charge_calc: 0,
      energy_charge: 0,
      extra_charge_calc: 0,
      tax: 0,
      sub_total: 0,
      interest_charge_calc: 0,
      other_charge_calc: 0,
      payable: 0,
    },
  );

  return {
    rows,
    totals,
    reconciliation: {
      fixed_diff: round(input.bill.fixed_charge - totals.fixed_charge_calc),
      energy_diff: round(input.bill.energy_charge - totals.energy_charge),
      extra_diff: round(input.bill.extra_charge - totals.extra_charge_calc),
      tax_diff: round(input.bill.tax - totals.tax),
      interest_diff: round(input.bill.interest_charge - totals.interest_charge_calc),
      other_diff: round(input.bill.other_charge - totals.other_charge_calc),
    },
  };
}
