import { useEffect, useState } from 'react';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { useSettingsStore } from '../store/settings';
import { useRestTimerStore } from '../store/restTimer';
import { listExercises } from '../db/exercises';
import { type Exercise, type WorkoutTemplate } from '../db/schema';
import { saveTemplate, createTemplateFromWorkout, listTemplates, deleteTemplate } from '../db/templates';
import NumberStepper from '../components/NumberStepper';
import ExerciseList from '../components/ExerciseList';
import { useProgramStore } from '../store/program';

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
    startWorkoutFromProgramSlot,
  } = useActiveWorkoutStore();

  const { settings } = useSettingsStore();
  const { startTimer } = useRestTimerStore();

  const {
    activeProgram,
    initProgram,
    createProgram,
    updateProgram,
    endProgram,
  } = useProgramStore();

  const [now] = useState(() => Date.now());

  useEffect(() => {
    initProgram();
  }, [initProgram]);

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Program Form state
  const [isProgramFormOpen, setIsProgramFormOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programName, setProgramName] = useState('');
  const [programSlots, setProgramSlots] = useState<{ id: string; label: string; templateId?: string }[]>([]);
  const [estWeeksMin, setEstWeeksMin] = useState(8);
  const [estWeeksMax, setEstWeeksMax] = useState(12);

  const handleOpenCreateProgram = () => {
    setEditingProgramId(null);
    setProgramName('我的三個月訓練計畫');
    setProgramSlots([
      { id: crypto.randomUUID(), label: '胸日' },
      { id: crypto.randomUUID(), label: '背日' },
      { id: crypto.randomUUID(), label: '腿臀日' },
      { id: crypto.randomUUID(), label: '肩日' },
      { id: crypto.randomUUID(), label: '手臂日' },
    ]);
    setEstWeeksMin(8);
    setEstWeeksMax(12);
    setIsProgramFormOpen(true);
  };

  const handleOpenEditProgram = () => {
    if (!activeProgram) return;
    setEditingProgramId(activeProgram.id);
    setProgramName(activeProgram.name);
    setProgramSlots(activeProgram.slots.map(s => ({ ...s })));
    setEstWeeksMin(activeProgram.estimatedWeeks.min);
    setEstWeeksMax(activeProgram.estimatedWeeks.max);
    setIsProgramFormOpen(true);
  };

  const handleAddSlot = () => {
    setProgramSlots([...programSlots, { id: crypto.randomUUID(), label: `訓練日 ${programSlots.length + 1}` }]);
  };

  const handleRemoveSlot = (id: string) => {
    setProgramSlots(programSlots.filter(s => s.id !== id));
  };

  const handleUpdateSlotLabel = (id: string, label: string) => {
    setProgramSlots(programSlots.map(s => s.id === id ? { ...s, label } : s));
  };

  const handleUpdateSlotTemplate = (id: string, templateId: string | undefined) => {
    setProgramSlots(programSlots.map(s => s.id === id ? { ...s, templateId } : s));
  };

  const handleMoveSlot = (index: number, direction: 'up' | 'down') => {
    const newSlots = [...programSlots];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSlots.length) return;
    const temp = newSlots[index];
    newSlots[index] = newSlots[targetIndex];
    newSlots[targetIndex] = temp;
    setProgramSlots(newSlots);
  };

  const handleSaveProgram = async () => {
    if (!programName.trim()) {
      alert('請輸入計畫名稱');
      return;
    }
    if (programSlots.length === 0) {
      alert('計畫至少需要一個訓練日/循環項目');
      return;
    }

    try {
      if (editingProgramId) {
        await updateProgram({
          name: programName.trim(),
          slots: programSlots,
          estimatedWeeks: { min: estWeeksMin, max: estWeeksMax },
        });
      } else {
        if (activeProgram) {
          const confirmEnd = window.confirm(`目前已有進行中的計畫「${activeProgram.name}」，建立新計畫將會結束它，確定嗎？`);
          if (!confirmEnd) return;
        }
        await createProgram(
          programName.trim(),
          programSlots.map(s => ({ label: s.label, templateId: s.templateId })),
          { min: estWeeksMin, max: estWeeksMax }
        );
      }
      setIsProgramFormOpen(false);
    } catch (err) {
      console.error(err);
      alert('儲存計畫失敗');
    }
  };

  const handleEndProgram = async () => {
    if (window.confirm('確定要結束此計畫嗎？這將會把計畫狀態標記為已完成。')) {
      await endProgram();
      setIsProgramFormOpen(false);
    }
  };

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

          {/* 訓練計畫卡片/建立入口 */}
          {!activeProgram ? (
            <button
              onClick={handleOpenCreateProgram}
              className="w-full py-3.5 px-6 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl border border-slate-200 dark:border-slate-800 transition cursor-pointer text-sm"
            >
              ＋ 建立訓練計畫
            </button>
          ) : (
            <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm text-left space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base leading-tight">
                    {activeProgram.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-bold tracking-wide">
                    第 {activeProgram.cycleCount + 1} 輪 • 已進行 {((now - activeProgram.startedAt) / 604800000).toFixed(1)} 週 (預估 {activeProgram.estimatedWeeks.min}-{activeProgram.estimatedWeeks.max} 週)
                  </p>
                </div>
                <button
                  onClick={handleOpenEditProgram}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                >
                  管理
                </button>
              </div>

              {/* 循序列表：可點選切換「今天該練」，不一定要照順序 */}
              <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                {activeProgram.slots.map((s, idx) => {
                  const isCurrent = idx === activeProgram.cursor;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => updateProgram({ cursor: idx })}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* 今日該練區塊 */}
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/40 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-0.5">
                    今天該練
                  </span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                    {activeProgram.slots[activeProgram.cursor]?.label || '未設定'}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    const slot = activeProgram.slots[activeProgram.cursor];
                    if (!slot) return;
                    try {
                      await startWorkoutFromProgramSlot(
                        activeProgram.id,
                        slot.id,
                        slot.templateId,
                        slot.label,
                        activeProgram.cycleCount + 1
                      );
                    } catch (err) {
                      console.error(err);
                      if (err instanceof Error && err.message === 'ACTIVE_WORKOUT_EXISTS') {
                        alert('你目前有一個進行中的訓練，請先完成或取消後再開始。');
                      } else {
                        alert('開始訓練失敗');
                      }
                    }
                  }}
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm shadow-indigo-100 dark:shadow-none"
                >
                  開始今天訓練
                </button>
              </div>
            </div>
          )}

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
                                  <div className="flex items-end gap-2">
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
                                      <NumberStepper
                                        value={setLog.reps}
                                        onChange={(val) => updateSet(entry.id, setLog.id, { reps: val })}
                                        step={1}
                                        min={0}
                                        decimals={0}
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

                      // 13C 關鍵機制：完成訓練存範本時，如果 slot.templateId 為空，順便回填計畫 slot.templateId
                      if (activeWorkout.programId && activeWorkout.programSlotId) {
                        const { activeProgram, updateProgram } = useProgramStore.getState();
                        if (activeProgram && activeProgram.id === activeWorkout.programId) {
                          const slotIndex = activeProgram.slots.findIndex(s => s.id === activeWorkout.programSlotId);
                          if (slotIndex !== -1 && !activeProgram.slots[slotIndex].templateId) {
                            const updatedSlots = [...activeProgram.slots];
                            updatedSlots[slotIndex] = {
                              ...updatedSlots[slotIndex],
                              templateId: template.id
                            };
                            await updateProgram({ slots: updatedSlots });
                          }
                        }
                      }

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

      {/* 建立/編輯計畫 (全屏 Sheet) */}
      {isProgramFormOpen && (
        <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex flex-col">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              {editingProgramId ? '編輯訓練計畫' : '建立訓練計畫'}
            </h3>
            <button
              onClick={() => setIsProgramFormOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
            >
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
            <div className="max-w-md mx-auto space-y-6">
              {/* 計畫名稱 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  計畫名稱
                </label>
                <input
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100 font-semibold shadow-sm transition"
                  placeholder="例如：五分化 8-12週"
                />
              </div>

              {/* 預估週數 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  預估進行週數 (參考值)
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">最少週數</span>
                    <NumberStepper
                      value={estWeeksMin}
                      onChange={(val) => setEstWeeksMin(val)}
                      step={1}
                      min={1}
                      max={52}
                      decimals={0}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">最多週數</span>
                    <NumberStepper
                      value={estWeeksMax}
                      onChange={(val) => setEstWeeksMax(val)}
                      step={1}
                      min={1}
                      max={52}
                      decimals={0}
                    />
                  </div>
                </div>
              </div>

              {/* Slots 清單 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    循環項目 / 訓練日 (依序進行)
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">
                    共 {programSlots.length} 天
                  </span>
                </div>

                <div className="space-y-3">
                  {programSlots.map((slot, index) => (
                    <div
                      key={slot.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3 relative"
                    >
                      <div className="flex items-center gap-3">
                        {/* 排序按鈕 */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveSlot(index, 'up')}
                            disabled={index === 0}
                            className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-30 rounded cursor-pointer"
                          >
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveSlot(index, 'down')}
                            disabled={index === programSlots.length - 1}
                            className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-30 rounded cursor-pointer"
                          >
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>

                        {/* Label 輸入 */}
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) => handleUpdateSlotLabel(slot.id, e.target.value)}
                          className="flex-1 min-w-0 bg-transparent border-b border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 focus:outline-none py-0.5 text-sm font-bold text-slate-800 dark:text-slate-200 transition"
                          placeholder="例如：胸日"
                        />

                        {/* 刪除鈕 */}
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(slot.id)}
                          className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition cursor-pointer"
                        >
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>

                      {/* 綁定範本 */}
                      <div className="flex items-center gap-2 pl-6">
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">連結範本</span>
                        <select
                          value={slot.templateId || ''}
                          onChange={(e) => handleUpdateSlotTemplate(slot.id, e.target.value || undefined)}
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 bg-slate-50 dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 h-8 cursor-pointer"
                        >
                          <option value="">(無範本，以空白訓練開始)</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="w-full py-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
                  </svg>
                  ＋ 新增循環項目
                </button>
              </div>

              {/* 控制按鈕 */}
              <div className="flex flex-col gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleSaveProgram}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-100 dark:shadow-none transition cursor-pointer"
                >
                  儲存計畫
                </button>
                {editingProgramId && (
                  <button
                    type="button"
                    onClick={handleEndProgram}
                    className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-sm transition cursor-pointer"
                  >
                    結束此計畫 (封存)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
