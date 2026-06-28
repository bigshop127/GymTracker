
export default function Progress() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 mb-4 flex items-center justify-center bg-emerald-100 text-emerald-600 rounded-2xl text-2xl shadow-sm animate-pulse">
        📈
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">進度圖表</h1>
      <p className="text-slate-500 text-sm mb-6 max-w-xs">
        追蹤你的 E1RM、總容量趨勢以及身體體重變化。
      </p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
        🚧 施工中 (Phase 5)
      </span>
    </div>
  );
}
