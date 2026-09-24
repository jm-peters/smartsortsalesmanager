import React from 'react';
import { formatKES, type KES } from '../lib/money';

interface MoneyProps {
  amount: KES | number;
  className?: string;
  showCurrency?: boolean;
}

export const Money: React.FC<MoneyProps> = ({
  amount,
  className = '',
  showCurrency = true,
}) => {
  const formatted = formatKES(amount);
  const display = showCurrency ? formatted : formatted.replace('KES ', '');

  return (
    <span className={`tabular-nums font-semibold ${className}`}>
      {display}
    </span>
  );
};
