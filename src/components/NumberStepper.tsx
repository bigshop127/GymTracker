import React from 'react';

interface NumberStepperProps {
  value: number;
  onChange: (val: number) => void;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
}

export default function NumberStepper({
  value,
  onChange,
  step,
  min = 0,
  max,
  decimals = 0,
}: NumberStepperProps) {
  const handleDecrement = () => {
    let newVal = value - step;
    if (min !== undefined && newVal < min) newVal = min;
    onChange(Number(newVal.toFixed(decimals)));
  };

  const handleIncrement = () => {
    let newVal = value + step;
    if (max !== undefined && newVal > max) newVal = max;
    onChange(Number(newVal.toFixed(decimals)));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    
    let sanitizedVal = val;
    if (min !== undefined && sanitizedVal < min) sanitizedVal = min;
    if (max !== undefined && sanitizedVal > max) sanitizedVal = max;
    
    onChange(Number(sanitizedVal.toFixed(decimals)));
  };

  return (
    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition duration-150 h-9">
      {/* 減少按鈕 */}
      <button
        type="button"
        onClick={handleDecrement}
        className="px-2.5 h-full bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-bold border-r border-slate-200 select-none transition cursor-pointer flex items-center justify-center"
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>

      {/* 數值輸入框 */}
      <input
        type="number"
        value={value || ''}
        onChange={handleInputChange}
        className="w-full text-center text-xs font-semibold text-slate-800 focus:outline-none bg-transparent h-full px-1"
        placeholder="0"
        step={step}
        min={min}
        max={max}
      />

      {/* 增加按鈕 */}
      <button
        type="button"
        onClick={handleIncrement}
        className="px-2.5 h-full bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-bold border-l border-slate-200 select-none transition cursor-pointer flex items-center justify-center"
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
        </svg>
      </button>
    </div>
  );
}
