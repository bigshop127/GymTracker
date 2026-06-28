import { useEffect, useState } from 'react';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { useSettingsStore } from '../store/settings';
import { useRestTimerStore } from '../store/restTimer';
import { listExercises } from '../db/exercises';
import { type Exercise } from '../db/schema';
import NumberStepper from '../components/NumberStepper';
import ExerciseList from '../components/ExerciseList';

export default function WorkoutLogger() {
  const {
    activeWorkout,
    isLoading,
    startNewWorkout,
    cancelWorkout,
    finishWorkout,
    addExerciseToWorkout,
    removeExerciseFromWorkout,
    addSetToEntry,
    removeSetFromEntry,
    updateSet,
    updateWorkoutNotes,
    updateWorkoutTitle,
    updateEntryDefaultRestSeconds,
  } = useActiveWorkoutStore();

  const { settings } = useSettingsStore();
  const { startTimer } = useRestTimerStore();

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // 取得動作庫以供顯示對應動作資訊 (僅在動作個數改變時更新，以避免每次鍵盤輸入重複讀取 DB)
  useEffect(() => {
    listExercises().then((list) => {
      setAllExercises(list);
    });
  }, [activeWorkout?.entries.length]);

  useEffect(() => {
    if (activeWorkout) {
      const t1 = setTimeout(() => {
        setSaveStatus('saving');
      }, 0);
      const t2 = setTimeout(() => {
        setSaveStatus('saved');
      }, 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [activeWorkout]);

  const handleStart = async () => {
    await startNewWorkout('今日訓練');
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    await addExerciseToWorkout(exercise.id);
    setIsSelectorOpen(false);
  };

  const currentUnit = settings?.unit || 'kg';

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* 載入狀態 */}
      {isLoading && (
        <div className="text-center py-12 text-slate-400 font-semibold animate-pulse">
          正在載入進行中的訓練草稿...
        </div>
      )}

      {/* 狀態 A：無進行中的訓練 */}
      {!isLoading && !activeWorkout && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center text-4xl shadow-inner animate-bounce">
            🏋️
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">開始你的健身訓練</h2>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
              記錄每一組訓練重量與次數，組間自動計時，資料即時備份。
            </p>
          </div>
          <button
            onClick={handleStart}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-2xl shadow-lg shadow-indigo-150 transition transform hover:-translate-y-0.5"
          >
            開始新訓練
          </button>
        </div>
      )}

      {/* 狀態 B：進行中的訓練 */}
      {!isLoading && activeWorkout && (
        <div className="space-y-6 pb-24">
          {/* 訓練標題與自動儲存狀態 */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <input
                type="text"
                value={activeWorkout.title || ''}
                onChange={(e) => updateWorkoutTitle(e.target.value)}
                className="text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none w-2/3 transition"
                placeholder="訓練名稱 (例如：推日/拉日)"
              />
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${saveStatus === 'saved' ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
                <span className="text-slate-400 font-medium select-none">
                  {saveStatus === 'saved' ? '已自動儲存' : '儲存中...'}
                </span>
              </span>
            </div>

            <textarea
              value={activeWorkout.notes || ''}
              onChange={(e) => updateWorkoutNotes(e.target.value)}
              className="w-full text-xs text-slate-600 border border-slate-100 hover:border-slate-200 focus:border-indigo-400 focus:outline-none rounded-xl p-3 resize-none bg-slate-50/50"
              placeholder="新增此訓練的備註或說明..."
              rows={2}
            />
          </div>

          {/* 動作清單 (WorkoutEntry) */}
          <div className="space-y-4">
            {activeWorkout.entries.map((entry) => {
              const exercise = allExercises.find((ex) => ex.id === entry.exerciseId);
              return (
                <div key={entry.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden space-y-3 pb-3">
                  {/* 動作標頭 */}
                  <div className="bg-slate-50/80 px-4 py-3 flex justify-between items-center border-b border-slate-100">
                    <div className="space-y-0.5">
                      <h3 className="font-bold text-slate-800 text-sm">
                        {exercise ? exercise.name : '讀取中...'}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500 bg-slate-200/50 font-bold px-1.5 py-0.5 rounded">
                          {exercise ? `${exercise.muscleGroup} / ${exercise.equipment}` : ''}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeExerciseFromWorkout(entry.id)}
                      className="text-xs text-rose-500 hover:text-rose-700 font-semibold transition"
                    >
                      移除動作
                    </button>
                  </div>

                  {/* 休息時間設定與控制 */}
                  <div className="px-4 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400 font-bold">⏱️ 組間休息時間</span>
                    <select
                      value={entry.defaultRestSeconds ?? ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || undefined;
                        updateEntryDefaultRestSeconds(entry.id, val);
                      }}
                      className="border border-slate-200 rounded-lg p-1.5 bg-white text-slate-700 font-semibold focus:outline-none focus:border-indigo-500 text-xs"
                    >
                      <option value="">全域預設 ({settings?.defaultRestSeconds ?? 90}秒)</option>
                      <option value="30">30 秒</option>
                      <option value="45">45 秒</option>
                      <option value="60">60 秒</option>
                      <option value="90">90 秒</option>
                      <option value="120">120 秒</option>
                      <option value="150">150 秒</option>
                      <option value="180">180 秒</option>
                      <option value="240">240 秒</option>
                      <option value="300">300 秒</option>
                    </select>
                  </div>

                  {/* 組數明細 */}
                  <div className="px-4 space-y-2.5">
                    {entry.sets.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4 italic">尚未新增任何組數</p>
                    ) : (
                      <div className="space-y-2">
                        {/* 欄位表頭 */}
                        <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 text-center uppercase tracking-wider">
                          <span className="col-span-1">組</span>
                          <span className="col-span-3">重量 ({currentUnit})</span>
                          <span className="col-span-3">次數 (Reps)</span>
                          <span className="col-span-2">RPE</span>
                          <span className="col-span-2">類別</span>
                          <span className="col-span-1">完</span>
                        </div>

                        {/* 組輸入列 */}
                        {entry.sets.map((setLog, idx) => (
                          <div
                            key={setLog.id}
                            className={`grid grid-cols-12 gap-1 items-center py-1.5 px-1 rounded-xl border border-transparent transition duration-200 ${
                              setLog.completed
                                ? 'bg-emerald-50/40 border-emerald-100/50'
                                : 'bg-slate-50/30'
                            }`}
                          >
                            {/* 組序 */}
                            <span className="col-span-1 text-center text-xs text-slate-400 font-bold">
                              {idx + 1}
                            </span>

                            {/* 重量 Stepper */}
                            <div className="col-span-3">
                              <NumberStepper
                                value={setLog.weight}
                                onChange={(val) => updateSet(entry.id, setLog.id, { weight: val })}
                                step={2.5}
                                min={0}
                                decimals={1}
                              />
                            </div>

                            {/* 次數 Stepper */}
                            <div className="col-span-3">
                              <NumberStepper
                                value={setLog.reps}
                                onChange={(val) => updateSet(entry.id, setLog.id, { reps: val })}
                                step={1}
                                min={0}
                                decimals={0}
                              />
                            </div>

                            {/* RPE 下拉選單 */}
                            <div className="col-span-2">
                              <select
                                value={setLog.rpe || ''}
                                onChange={(e) =>
                                  updateSet(entry.id, setLog.id, {
                                    rpe: parseFloat(e.target.value) || undefined,
                                  })
                                }
                                className="w-full text-center border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500 font-bold text-slate-700 h-9"
                              >
                                <option value="">無</option>
                                <option value="10">10</option>
                                <option value="9.5">9.5</option>
                                <option value="9">9</option>
                                <option value="8.5">8.5</option>
                                <option value="8">8</option>
                                <option value="7.5">7.5</option>
                                <option value="7">7</option>
                                <option value="6.5">6.5</option>
                                <option value="6">6</option>
                              </select>
                            </div>

                            {/* 暖身組 Toggle Badges */}
                            <div className="col-span-2 flex justify-center">
                              <button
                                type="button"
                                onClick={() =>
                                  updateSet(entry.id, setLog.id, { isWarmup: !setLog.isWarmup })
                                }
                                className={`px-2 py-1 rounded-md text-[10px] font-extrabold select-none transition cursor-pointer ${
                                  setLog.isWarmup
                                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                }`}
                              >
                                {setLog.isWarmup ? '暖身' : '正式'}
                              </button>
                            </div>

                            {/* 完成打勾 Checkbox (觸發 RestTimer 關鍵) */}
                            <div className="col-span-1 flex justify-center">
                              <input
                                type="checkbox"
                                checked={setLog.completed}
                                onChange={(e) => {
                                  const isCompleted = e.target.checked;
                                  updateSet(entry.id, setLog.id, { completed: isCompleted });
                                  if (isCompleted) {
                                    // 觸發休息倒數
                                    const restSecs =
                                      entry.defaultRestSeconds ??
                                      settings?.defaultRestSeconds ??
                                      90;
                                    startTimer(restSecs);
                                  }
                                }}
                                className="w-5 h-5 text-emerald-600 border-slate-300 rounded-full focus:ring-emerald-500 accent-emerald-500 cursor-pointer shadow-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 組操作按鈕 */}
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => addSetToEntry(entry.id)}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                      >
                        ＋ 增加一組 (自動複製)
                      </button>
                      {entry.sets.length > 0 && (
                        <button
                          onClick={() =>
                            removeSetFromEntry(entry.id, entry.sets[entry.sets.length - 1].id)
                          }
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl transition"
                        >
                          － 刪除一組
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 新增動作觸發按鈕 */}
          <button
            onClick={() => setIsSelectorOpen(true)}
            className="w-full py-3.5 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 font-bold rounded-2xl border border-dashed border-indigo-200 flex items-center justify-center gap-2 transition"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
            </svg>
            加入訓練動作
          </button>

          {/* 底部完成與取消控制鈕 */}
          <div className="flex gap-3 pt-6 border-t border-slate-100">
            <button
              onClick={() => {
                if (window.confirm('確定要取消本次訓練嗎？這將刪除目前的草稿記錄。')) {
                  cancelWorkout();
                }
              }}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold rounded-xl text-sm transition"
            >
              取消訓練
            </button>
            <button
              onClick={finishWorkout}
              className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-100 transition"
            >
              完成訓練
            </button>
          </div>
        </div>
      )}

      {/* 動作選擇器 (Slide Up Drawer) */}
      {isSelectorOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setIsSelectorOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">選擇要加入的動作</h3>
              <button onClick={() => setIsSelectorOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* 複用 Phase 2 寫好的 ExerciseList 元件，設為 select 模式 */}
            <div className="overflow-y-auto max-h-[65vh]">
              <ExerciseList mode="select" onSelect={handleSelectExercise} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
