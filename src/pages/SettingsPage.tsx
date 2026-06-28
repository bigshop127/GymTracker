
export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 mb-4 flex items-center justify-center bg-slate-100 text-slate-600 rounded-2xl text-2xl shadow-sm animate-pulse">
        ⚙️
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">全域設定</h1>
      <p className="text-slate-500 text-sm mb-6 max-w-xs">
        調整計量單位 (kg/lb)、預設組間休息時間、E1RM 計算公式及主題外觀。
      </p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
        🚧 施工中 (Phase 6)
      </span>
    </div>
  );
}
