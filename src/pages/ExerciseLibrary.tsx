import ExerciseList from '../components/ExerciseList';

export default function ExerciseLibrary() {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800">動作庫</h1>
        <p className="text-xs text-slate-400">
          瀏覽系統提供的內建健身動作，或者在此新增、編輯並管理個人的自訂健身動作。
        </p>
      </div>

      <ExerciseList mode="manage" />
    </div>
  );
}
