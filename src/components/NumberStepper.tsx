import React, { useState } from 'react';

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
  const [prevValue, setPrevValue] = useState(value);
  const [prevDecimals, setPrevDecimals] = useState(decimals);
  const [draft, setDraft] = useState(() => value !== undefined && value !== null ? value.toFixed(decimals) : '');
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // 同步外部 value 到 draft，僅在未聚焦時執行（在 render 階段直接處理以避免 useEffect lint 警告）
  if (value !== prevValue || decimals !== prevDecimals) {
    setPrevValue(value);
    setPrevDecimals(decimals);
    if (!isFocused) {
      setDraft(value !== undefined && value !== null ? value.toFixed(decimals) : '');
    }
  }

  const clamp = (val: number) => {
    let res = val;
    if (min !== undefined && res < min) res = min;
    if (max !== undefined && res > max) res = max;
    return res;
  };

  const getNumericValue = (): number => {
    const parsed = parseFloat(draft);
    if (isNaN(parsed)) return value;
    return parsed;
  };

  const handleDecrement = () => {
    const current = getNumericValue();
    const newVal = clamp(current - step);
    const formatted = newVal.toFixed(decimals);
    setDraft(formatted);
    onChange(Number(formatted));
  };

  const handleIncrement = () => {
    const current = getNumericValue();
    const newVal = clamp(current + step);
    const formatted = newVal.toFixed(decimals);
    setDraft(formatted);
    onChange(Number(formatted));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputStr = e.target.value;
    
    // 只允許數字與小數點
    const filtered = inputStr.replace(/[^0-9.]/g, '');
    const parts = filtered.split('.');
    const sanitized = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');

    setDraft(sanitized);

    // 空字串或單獨 "." 先不回寫
    if (sanitized === '' || sanitized === '.') {
      return;
    }

    const parsed = parseFloat(sanitized);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    let parsed = parseFloat(draft);
    if (isNaN(parsed)) {
      parsed = min !== undefined ? min : 0;
    }
    const clamped = clamp(parsed);
    const formatted = clamped.toFixed(decimals);
    setDraft(formatted);
    onChange(Number(formatted));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // 一聚焦就全選，讓使用者直接打字取代既有值（避免在預設 "0"/"0.0" 後面接字）
    e.target.select();
  };

  return (
    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition duration-150 h-9 w-full">
      {/* 減少按鈕 */}
      <button
        type="button"
        onClick={handleDecrement}
        className="w-9 h-full bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-bold border-r border-slate-200 select-none transition cursor-pointer flex items-center justify-center shrink-0"
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>

      {/* 數值輸入框 */}
      <input
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        value={draft}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-full text-center text-xs font-semibold text-slate-800 focus:outline-none bg-transparent h-full px-1 min-w-0"
        placeholder="0"
      />

      {/* 增加按鈕 */}
      <button
        type="button"
        onClick={handleIncrement}
        className="w-9 h-full bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-bold border-l border-slate-200 select-none transition cursor-pointer flex items-center justify-center shrink-0"
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
        </svg>
      </button>
    </div>
  );
}
