interface SheetHeaderProps {
  title: string;
  subtitle?: string;
  /** 「上一步」要做的事：回上一層，或直接關掉這張全屏頁。 */
  onBack: () => void;
  /** 右上角的 ✕；省略就不顯示（例如上一步已經等於關閉時） */
  onClose?: () => void;
}

/**
 * 全屏 Sheet 的標頭。這種頁蓋掉整個畫面（含 header 的前一步／下一步），
 * 所以每一張都要自己帶一個看得到的「上一步」。
 */
export default function SheetHeader({ title, subtitle, onBack, onClose }: SheetHeaderProps) {
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 shrink-0">
      {/* 內容跟頁面本體一樣收在 max-w-md 裡，桌機才不會標題貼最左、✕ 貼最右 */}
      <div className="max-w-md mx-auto w-full flex justify-between items-start gap-2 px-5 py-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 mt-0.5 -ml-2 flex items-center gap-0.5 pl-1 pr-2 py-1 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            上一步
          </button>
          <div className="space-y-0.5 min-w-0">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{title}</h3>
            {subtitle && <p className="text-[11px] font-bold text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            title="關閉"
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
