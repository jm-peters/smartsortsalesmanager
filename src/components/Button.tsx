import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'gradient';
  size?: 'sm' | 'md' | 'lg' | 'hero';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled = false,
  onClick,
  children,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
    onClick?.(e);
  };

  const baseStyles =
    'inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98] select-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

  const sizeStyles = {
    sm: 'min-h-[44px] px-3 text-sm min-w-[44px]',
    md: 'min-h-[48px] px-4 text-base min-w-[48px]', // Meets 48px touch target
    lg: 'min-h-[52px] px-5 text-lg min-w-[52px]',
    hero: 'min-h-[56px] px-6 text-lg font-bold min-w-[56px]', // 56px primary action
  }[size];

  const variantStyles = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm active:bg-emerald-800',
    gradient: 'bg-brand-gradient text-white shadow-md hover:opacity-95 active:opacity-90',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
    outline: 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
};
