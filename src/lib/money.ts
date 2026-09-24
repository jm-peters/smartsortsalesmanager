/**
 * Money & Arithmetic Rules for SmartSort Sales Manager
 *
 * Rule: All monetary values MUST be stored and transmitted as integers representing
 * whole Kenya Shillings (KES). Never float, never numeric, never JS number through division.
 * Profit is derived: (unit_price_at_sale - unit_cost_at_sale) * qty
 */

export type KES = number & { readonly __brand: 'KES' };

/**
 * Coerce a number to KES integer (floors/rounds to whole shillings)
 */
export function toKES(amount: number): KES {
  if (isNaN(amount) || !isFinite(amount)) return 0 as KES;
  return Math.round(amount) as KES;
}

export function addKES(a: KES, b: KES): KES {
  return ((a || 0) + (b || 0)) as KES;
}

export function subKES(a: KES, b: KES): KES {
  return ((a || 0) - (b || 0)) as KES;
}

export function mulKES(unit: KES, qty: number): KES {
  return Math.round((unit || 0) * (qty || 0)) as KES;
}

export function sumKES(items: KES[]): KES {
  return items.reduce((acc, curr) => (acc + (curr || 0)) as KES, 0 as KES);
}

/**
 * Format KES with Kenyan locale formatting: "KES 1,250"
 */
export function formatKES(amount: KES | number): string {
  const val = Math.round(amount || 0);
  const formatted = new Intl.NumberFormat('en-KE', {
    maximumFractionDigits: 0,
  }).format(val);
  return `KES ${formatted}`;
}

/**
 * Calculate derived profit for a line item
 */
export function calculateLineProfit(
  unitPrice: KES,
  unitCost: KES | null | undefined,
  qty: number
): { lineProfit: KES; costUnknown: boolean } {
  if (unitCost === null || unitCost === undefined || unitCost <= 0) {
    // When buying price is not provided, cost is unknown and profit calculation is skipped/optional
    return {
      lineProfit: 0 as KES,
      costUnknown: true,
    };
  }

  const marginPerUnit = (unitPrice - unitCost) as KES;
  return {
    lineProfit: mulKES(marginPerUnit, qty),
    costUnknown: false,
  };
}

/**
 * Calculate percentage margin
 */
export function calculateMarginPercent(selling: KES, buying: KES): number {
  if (selling <= 0) return 0;
  const profit = selling - buying;
  return Math.round((profit / selling) * 100);
}
