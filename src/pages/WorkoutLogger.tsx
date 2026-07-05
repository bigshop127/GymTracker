import { useEffect, useState } from 'react';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { useSettingsStore } from '../store/settings';
import { useRestTimerStore } from '../store/restTimer';
import { listExercises } from '../db/exercises';
import { type Exercise, type WorkoutTemplate } from '../db/schema';
import { saveTemplate, createTemplateFromWorkout, listTemplates, deleteTemplate } from '../db/templates';
import NumberStepper from '../components/NumberStepper';
import RepsWheel from '../components/RepsWheel';
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
    updateWorkoutLocation,
    updateWorkoutStartedAt,
    startWorkoutFromTemplateEntity,
  } = useActiveWorkoutStore();

  const { settings } = useSettingsStore();
  const { startTimer } = useRestTimerStore();

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
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

  const loadTemplates = async () => {
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  useEffect(() => {
    if (!activeWorkout) {
      const t = setTimeout(() => {
        loadTemplates();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [activeWorkout]);

  const handleStart = async () => {
    await startNewWorkout('今日訓練');
  };

  const handleStartFromTemplate = async (template: WorkoutTemplate) => {
    if (activeWorkout) {
      alert('你目前有一個進行中的訓練，請先完成或取消後再使用範本。');
      return;
    }
    try {
      await startWorkoutFromTemplateEntity(template);
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'ACTIVE_WORKOUT_EXISTS') {
        alert('你目前有一個進行中的訓練，請先完成或取消後再使用範本。');
      } else {
        alert('套用範本失敗');
      }
    }
  };

  const handleRenameTemplate = async (template: WorkoutTemplate) => {
    const newName = window.prompt('重新命名範本：', template.name);
    if (newName !== null && newName.trim() !== '') {
      try {
        const updated = { ...template, name: newName.trim(), updatedAt: Date.now() };
        await saveTemplate(updated);
        await loadTemplates();
      } catch (err) {
        console.error(err);
        alert('修改名稱失敗');
      }
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (window.confirm(`確定要永久刪除範本「${name}」嗎？`)) {
      try {
        await deleteTemplate(id);
        await loadTemplates();
      } catch (err) {
        console.error(err);
        alert('刪除範本失敗');
      }
    }
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    await addExerciseToWorkout(exercise.id, exercise.muscleGroup === '有氧');
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
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 w-full">
          <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center text-4xl shadow-inner animate-bounce">
            🏋️
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">開始你的健身訓練</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
              記錄每一組訓練重量與次數，組間自動計時，資料即時備份。
            </p>
          </div>
          <button
            onClick={handleStart}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            開始新訓練
          </button>

          {/* 我的範本區塊 */}
          {templates.length > 0 && (
            <div className="w-full text-left space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                我的範本 (保留重量)
              </h3>
              <div className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 shadow-sm hover:shadow transition"
                  >
                    {/* 左側資訊：點擊以範本開始訓練 */}
                    <div
                      onClick={() => handleStartFromTemplate(t)}
                      className="flex-1 cursor-pointer space-y-1 pr-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                          {t.name}
                        </span>
                        {t.location && (
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                            📍 {t.location}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {t.entries.length} 個動作 • {t.entries.reduce((sum, e) => sum + e.sets.length, 0)} 組
                      </p>
                    </div>

                    {/* 右側操作按鈕 */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRenameTemplate(t)}
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 transition cursor-pointer"
                        title="改名"
                      >
                        改名
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(t.id, t.name)}
                        className="px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/60 text-[10px] font-bold text-red-600 dark:text-red-400 rounded-lg transition cursor-pointer"
                        title="刪除"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            </div>

            <div className="flex justify-between items-center text-xs">
              <div className="flex gap-3 items-center flex-wrap">
                <div className="flex gap-1.5 items-center">
                  <span className="text-slate-400 font-medium select-none">日期:</span>
                  <input
                    type="date"
                    max={new Date().toLocaleDateString('sv')}
                    value={(() => {
                      const d = new Date(activeWorkout.startedAt);
                      return d.toLocaleDateString('sv');
                    })()}
                    onChange={(e) => {
                      const dateStr = e.target.value;
                      if (!dateStr) return;
                      const [y, m, d] = dateStr.split('-').map(Number);
                      const existing = new Date(activeWorkout.startedAt);
                      const newDate = new Date(y, m - 1, d, existing.getHours(), existing.getMinutes(), existing.getSeconds());
                      updateWorkoutStartedAt(newDate.getTime());
                      // 若標題是預設格式，自動同步
                      const todayStr = new Date().toLocaleDateString('sv');
                      const isToday = dateStr === todayStr;
                      const currentTitle = activeWorkout.title || '';
                      if (currentTitle === '今日訓練' || /^\d{1,2}\/\d{1,2} 訓練$/.test(currentTitle)) {
                        updateWorkoutTitle(isToday ? '今日訓練' : `${m}/${d} 訓練`);
                      }
                    }}
                    className="bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-indigo-400 focus:outline-none rounded-lg px-2 py-1 text-xs text-slate-700 font-semibold transition"
                  />
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-slate-400 font-medium select-none">地點:</span>
                  <select
                    value={activeWorkout.location || ''}
                    onChange={(e) => updateWorkoutLocation(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 focus:border-indigo-400 focus:outline-none rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-300 font-semibold transition"
                  >
                    <option value="">(無地點)</option>
                    {(settings?.locations || []).map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <span className="flex items-center gap-1.5">
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

                  {/* 組數明細 */}
                  {(() => {
                    const isCardio = exercise?.muscleGroup === '有氧';
                    return (
                      <div className="px-4 space-y-2.5">
                        {entry.sets.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4 italic">尚未新增任何組數</p>
                        ) : (
                          <div className="space-y-2">
                            {/* 欄位表頭：只有氧顯示 */}
                            {isCardio && (
                              <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 text-center uppercase tracking-wider">
                                <span className="col-span-1">組</span>
                                <span className="col-span-5">時長 (分)</span>
                                <span className="col-span-5">距離 (km)</span>
                                <span className="col-span-1">完</span>
                              </div>
                            )}

                            {/* 組輸入列 */}
                            {entry.sets.map((setLog, idx) => (
                              isCardio ? (
                                /* ===== 有氧：維持 grid-cols-12 單列 ===== */
                                <div
                                  key={setLog.id}
                                  className={`grid grid-cols-12 gap-1 items-center py-1.5 px-1 rounded-xl border border-transparent transition duration-200 ${
                                    setLog.completed
                                      ? 'bg-emerald-50/40 border-emerald-100/50'
                                      : 'bg-slate-50/30'
                                  }`}
                                >
                                  <span className="col-span-1 text-center text-xs text-slate-400 font-bold">
                                    {idx + 1}
                                  </span>
                                  {/* 時長（分鐘） col-span-5 */}
                                  <div className="col-span-5">
                                    <NumberStepper
                                      value={Math.round((setLog.durationSeconds ?? 0) / 60)}
                                      onChange={(val) => updateSet(entry.id, setLog.id, { durationSeconds: val * 60 })}
                                      step={1}
                                      min={0}
                                      decimals={0}
                                    />
                                  </div>
                                  {/* 距離（km） col-span-5 */}
                                  <div className="col-span-5">
                                    <NumberStepper
                                      value={setLog.distanceKm ?? 0}
                                      onChange={(val) => updateSet(entry.id, setLog.id, { distanceKm: val })}
                                      step={0.5}
                                      min={0}
                                      decimals={1}
                                    />
                                  </div>
                                  {/* 完成 col-span-1 */}
                                  <div className="col-span-1 flex justify-center">
                                    <input
                                      type="checkbox"
                                      checked={setLog.completed}
                                      onChange={(e) =>
                                        updateSet(entry.id, setLog.id, { completed: e.target.checked })
                                      }
                                      className="w-5 h-5 text-emerald-600 border-slate-300 rounded-full focus:ring-emerald-500 accent-emerald-500 cursor-pointer shadow-sm"
                                    />
                                  </div>
                                </div>
                              ) : (
                                /* ===== 重訓：兩列卡片 ===== */
                                <div
                                  key={setLog.id}
                                  className={`rounded-xl border p-2.5 space-y-2 transition duration-200 ${
                                    setLog.completed
                                      ? 'bg-emerald-50/40 border-emerald-100'
                                      : 'bg-slate-50/30 border-slate-100'
                                  }`}
                                >
                                  {/* 第一列：組序 + 重量 + 次數 + 完成 */}
                                  <div className="flex items-center gap-2">
                                    <div className="shrink-0 flex flex-col items-center">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">組</span>
                                      <span className="w-7 h-9 flex items-center justify-center text-sm font-bold text-slate-500">
                                        {idx + 1}
                                      </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="block text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                        重量 ({currentUnit})
                                      </span>
                                      <NumberStepper
                                        value={setLog.weight}
                                        onChange={(val) => updateSet(entry.id, setLog.id, { weight: val })}
                                        step={2.5}
                                        min={0}
                                        decimals={1}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="block text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                        次數
                                      </span>
                                      <RepsWheel
                                        value={setLog.reps}
                                        onChange={(val) => updateSet(entry.id, setLog.id, { reps: val })}
                                        min={1}
                                        max={20}
                                      />
                                    </div>
                                    <div className="shrink-0 flex flex-col items-center">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">完</span>
                                      <div className="h-9 flex items-center">
                                        <input
                                          type="checkbox"
                                          checked={setLog.completed}
                                          onChange={(e) => {
                                            const isCompleted = e.target.checked;
                                            updateSet(entry.id, setLog.id, { completed: isCompleted });
                                            if (isCompleted) startTimer(settings?.defaultRestSeconds ?? 90);
                                          }}
                                          className="w-5 h-5 text-emerald-600 border-slate-300 rounded-full focus:ring-emerald-500 accent-emerald-500 cursor-pointer shadow-sm"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* 第二列：RPE + 類別（縮排對齊，避開組序欄）*/}
                                  <div className="flex items-center gap-2 pl-9">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RPE</span>
                                      <select
                                        value={setLog.rpe || ''}
                                        onChange={(e) =>
                                          updateSet(entry.id, setLog.id, { rpe: parseFloat(e.target.value) || undefined })
                                        }
                                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-indigo-500 font-bold text-slate-700 h-8"
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
                                    <button
                                      type="button"
                                      onClick={() => updateSet(entry.id, setLog.id, { isWarmup: !setLog.isWarmup })}
                                      className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold select-none transition cursor-pointer ${
                                        setLog.isWarmup
                                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                      }`}
                                    >
                                      {setLog.isWarmup ? '暖身' : '正式'}
                                    </button>
                                  </div>
                                </div>
                              )
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
                    );
                  })()}
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
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm transition"
            >
              取消訓練
            </button>
            <button
              onClick={async () => {
                if (!activeWorkout) return;
                const shouldSaveTemplate = window.confirm('訓練即將完成！要將本次訓練另存為範本嗎？（下次可帶相同重量/次數直接開始）');
                if (shouldSaveTemplate) {
                  const defaultName = activeWorkout.title || '今日訓練';
                  const name = window.prompt('請輸入範本名稱：', defaultName);
                  if (name !== null) {
                    const templateName = name.trim() || defaultName;
                    try {
                      const template = createTemplateFromWorkout(activeWorkout, templateName);
                      await saveTemplate(template);
                      alert('範本儲存成功！');
                    } catch (err) {
                      console.error(err);
                      alert('儲存範本失敗');
                    }
                  }
                }
                await finishWorkout();
              }}
              className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-100 transition"
            >
              完成訓練
            </button>
          </div>
        </div>
      )}

      {/* 動作選擇器 (全屏) */}
      {isSelectorOpen && (
        <div className="fixed inset-0 bg-white dark:bg-slate-950 z-50 flex flex-col">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">選擇要加入的動作</h3>
            <button
              onClick={() => setIsSelectorOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
            >
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* 內容區：撐滿剩餘高度可捲動 */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-md mx-auto w-full px-4 py-4">
              <ExerciseList mode="select" onSelect={handleSelectExercise} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
