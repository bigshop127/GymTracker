
export default function ExerciseLibrary() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 mb-4 flex items-center justify-center bg-blue-100 text-blue-600 rounded-2xl text-2xl shadow-sm animate-pulse">
        📚
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">動作庫</h1>
      <p className="text-slate-500 text-sm mb-6 max-w-xs">
        瀏覽並管理超過 50 個內建動作，或新增你專屬的客製化健身動作。
      </p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
        🚧 施工中 (Phase 2)
      </span>
    </div>
  );
}
