
export default function History() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 mb-4 flex items-center justify-center bg-violet-100 text-violet-600 rounded-2xl text-2xl shadow-sm animate-pulse">
        📅
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">訓練歷史</h1>
      <p className="text-slate-500 text-sm mb-6 max-w-xs">
        查看你過去所有的健身紀錄與容量統計。
      </p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
        🚧 施工中 (Phase 4)
      </span>
    </div>
  );
}
