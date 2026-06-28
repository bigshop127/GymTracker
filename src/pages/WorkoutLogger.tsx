import { useEffect, useState } from 'react';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { listExercises } from '../db/exercises';
import { type Exercise } from '../db/schema';
import { useSettingsStore } from '../store/settings';

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
  } = useActiveWorkoutStore();

  const { settings } = useSettingsStore();
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // 取得動作庫以供選擇新增
  useEffect(() => {
    listExercises().then((list) => {
      setAllExercises(list);
      if (list.length > 0) {
        setSelectedExerciseId(list[0].id);
      }
    });
  }, [activeWorkout]);

  // 監聽 activeWorkout 的變化，用以顯示「儲存狀態」動畫
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

  const handleAddExercise = async () => {
    if (!selectedExerciseId) return;
    await addExerciseToWorkout(selectedExerciseId);
  };

  const currentUnit = settings?.unit || 'kg';

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* 載入狀態 */}
      {isLoading && (
        <div className="text-center py-8 text-slate-500 font-medium animate-pulse">
          正在讀取訓練草稿...
        </div>
      )}

      {/* 草稿狀態：未開始訓練 */}
      {!isLoading && !activeWorkout && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-3xl shadow-inner animate-pulse">
            🏋️
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">開始新的一天</h2>
            <p className="text-slate-500 text-sm mt-1">
              建立一個訓練草稿，任何動作都將自動儲存
            </p>
          </div>
          <button
            onClick={handleStart}
            className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-lg shadow-indigo-100 transition duration-200 text-base"
          >
            開啟訓練紀錄
          </button>
          
          <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-left">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">已載入的動作庫 (Seed 驗證)</h3>
            <div className="max-h-32 overflow-y-auto text-xs text-slate-600 divide-y divide-slate-100">
              {allExercises.length === 0 ? (
                <span className="text-slate-400">正在加載動作庫...</span>
              ) : (
                allExercises.slice(0, 5).map((ex) => (
                  <div key={ex.id} className="py-1.5 flex justify-between">
                    <span className="font-medium text-slate-700">{ex.name}</span>
                    <span className="text-slate-400 font-semibold bg-white border border-slate-200 px-1.5 py-0.2 rounded-md scale-90">{ex.muscleGroup} / {ex.equipment}</span>
                  </div>
                ))
              )}
              {allExercises.length > 5 && (
                <div className="text-slate-400 pt-1.5 text-center font-medium">
                  還有其餘 {allExercises.length - 5} 個動作...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 草稿狀態：進行中訓練 */}
      {!isLoading && activeWorkout && (
        <div className="space-y-6 pb-20">
          {/* 頂部標題與狀態 */}
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <input
                type="text"
                value={activeWorkout.title || ''}
                onChange={(e) => updateWorkoutTitle(e.target.value)}
                className="text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none w-2/3"
                placeholder="訓練名稱"
              />
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${saveStatus === 'saved' ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
                <span className="text-slate-400 font-medium">
                  {saveStatus === 'saved' ? '已自動儲存' : '儲存中...'}
                </span>
              </span>
            </div>

            <textarea
              value={activeWorkout.notes || ''}
              onChange={(e) => updateWorkoutNotes(e.target.value)}
              className="w-full text-xs text-slate-500 border border-slate-100 hover:border-slate-200 focus:border-indigo-400 focus:outline-none rounded-lg p-2 resize-none bg-slate-50"
              placeholder="添加備註或說明..."
              rows={2}
            />
          </div>

          {/* 訓練內容 */}
          <div className="space-y-4">
            {activeWorkout.entries.map((entry) => {
              const exercise = allExercises.find((ex) => ex.id === entry.exerciseId);
              return (
                <div key={entry.id} className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                  {/* 動作標題 */}
                  <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-b border-slate-100">
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm">
                        {exercise ? exercise.name : '未知動作'}
                      </h3>
                      <span className="text-[10px] text-slate-400 bg-slate-200/50 font-medium px-1.5 py-0.5 rounded">
                        {exercise ? `${exercise.muscleGroup} / ${exercise.equipment}` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => removeExerciseFromWorkout(entry.id)}
                      className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                    >
                      移除動作
                    </button>
                  </div>

                  {/* 組數紀錄 */}
                  <div className="p-3 space-y-2">
                    {entry.sets.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2">尚未新增組數</p>
                    ) : (
                      <div className="space-y-2">
                        {/* 欄位表頭 */}
                        <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 text-center">
                          <span className="col-span-2">組</span>
                          <span className="col-span-3">重量 ({currentUnit})</span>
                          <span className="col-span-3">次數 (Reps)</span>
                          <span className="col-span-2">暖身</span>
                          <span className="col-span-2">完成</span>
                        </div>

                        {/* 組列表 */}
                        {entry.sets.map((setLog, idx) => (
                          <div
                            key={setLog.id}
                            className={`grid grid-cols-12 gap-1 items-center py-1 rounded transition duration-150 ${setLog.completed ? 'bg-emerald-50/30' : 'bg-transparent'}`}
                          >
                            {/* 組編號 */}
                            <span className="col-span-2 text-center text-xs text-slate-500 font-semibold">
                              {idx + 1}
                            </span>

                            {/* 重量輸入 */}
                            <input
                              type="number"
                              value={setLog.weight || ''}
                              onChange={(e) =>
                                updateSet(entry.id, setLog.id, { weight: parseFloat(e.target.value) || 0 })
                              }
                              className="col-span-3 text-xs border border-slate-200 rounded p-1 text-center focus:outline-none focus:border-indigo-500 bg-white"
                              placeholder="0"
                            />

                            {/* 次數輸入 */}
                            <input
                              type="number"
                              value={setLog.reps || ''}
                              onChange={(e) =>
                                updateSet(entry.id, setLog.id, { reps: parseInt(e.target.value) || 0 })
                              }
                              className="col-span-3 text-xs border border-slate-200 rounded p-1 text-center focus:outline-none focus:border-indigo-500 bg-white"
                              placeholder="0"
                            />

                            {/* 暖身 Toggle */}
                            <div className="col-span-2 flex justify-center">
                              <input
                                type="checkbox"
                                checked={setLog.isWarmup}
                                onChange={(e) =>
                                  updateSet(entry.id, setLog.id, { isWarmup: e.target.checked })
                                }
                                className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                              />
                            </div>

                            {/* 完成 Checkbox */}
                            <div className="col-span-2 flex justify-center">
                              <input
                                type="checkbox"
                                checked={setLog.completed}
                                onChange={(e) =>
                                  updateSet(entry.id, setLog.id, { completed: e.target.checked })
                                }
                                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 accent-emerald-500"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 增加組按鈕 */}
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => addSetToEntry(entry.id)}
                        className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                      >
                        ＋ 增加一組
                      </button>
                      {entry.sets.length > 0 && (
                        <button
                          onClick={() => removeSetFromEntry(entry.id, entry.sets[entry.sets.length - 1].id)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition"
                        >
                          － 刪除末組
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 新增動作區 */}
          <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex gap-2 items-center">
            <select
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg p-2 bg-white focus:outline-none focus:border-indigo-500 text-slate-700"
            >
              {allExercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.muscleGroup})
                </option>
              ))}
            </select>
            <button
              onClick={handleAddExercise}
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
            >
              新增動作
            </button>
          </div>

          {/* 底部完成/取消控制 */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={cancelWorkout}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 font-semibold rounded-xl text-sm transition"
            >
              取消訓練
            </button>
            <button
              onClick={finishWorkout}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-xl text-sm shadow-md transition"
            >
              完成訓練
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
