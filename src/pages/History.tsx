import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCompletedWorkouts, deleteWorkout } from '../db/workouts';
import { listExercises } from '../db/exercises';
import { type Workout, type Exercise } from '../db/schema';
import { calculateWorkoutVolume, calculateEntryVolume } from '../lib/volume';
import { formatWeight } from '../lib/units';
import { calculateE1rm } from '../lib/e1rm';
import { useSettingsStore } from '../store/settings';
import { useActiveWorkoutStore } from '../store/activeWorkout';

export default function History() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { startWorkoutFromTemplate, activeWorkout } = useActiveWorkoutStore();

  const [historyList, setHistoryList] = useState<Workout[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化載入歷史記錄與動作庫
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [workouts, exercises] = await Promise.all([
        listCompletedWorkouts(),
        listExercises(),
      ]);
      setHistoryList(workouts);
      setAllExercises(exercises);
    } catch (err) {
      console.error('Failed to load history data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const currentUnit = settings?.unit || 'kg';
  const currentFormula = settings?.e1rmFormula || 'epley';

  // 刪除歷史記錄
  const handleDeleteWorkout = async (workoutId: string) => {
    if (!window.confirm('確定要永久刪除此筆訓練紀錄嗎？此操作無法還原。')) return;

    try {
      await deleteWorkout(workoutId);
      setSelectedWorkout(null);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    }
  };

  // 以此訓練為範本再做一次 (套用防呆檢查與自適應 title 提示)
  const handleReuseTemplate = async (workout: Workout) => {
    if (activeWorkout) {
      alert('你目前有一個進行中的訓練，請先完成或取消後再使用範本。');
      return;
    }

    try {
      await startWorkoutFromTemplate(workout);
      setSelectedWorkout(null);
      navigate('/'); // 導向訓練紀錄頁
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'ACTIVE_WORKOUT_EXISTS') {
        alert('你目前有一個進行中的訓練，請先完成或取消後再使用範本。');
      } else {
        alert('套用範本失敗');
      }
    }
  };

  // 格式化日期時間 (例如：2026/06/28 17:30)
  const formatDateTime = (timestamp: number) => {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const dateStr = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const minStr = d.getMinutes().toString().padStart(2, '0');
    return `${y}/${m}/${dateStr} ${h}:${minStr}`;
  };


  // 計算訓練時長 (分鐘)
  const getDurationMinutes = (workout: Workout) => {
    if (!workout.endedAt) return 0;
    return Math.round((workout.endedAt - workout.startedAt) / 60000);
  };

  // 在記憶體中進行列表聚合 (ROADMAP §5 注意項：避免每次 render 重複統計)
  const historyStatsList = useMemo(() => {
    return historyList.map((w) => {
      // 總組數
      const totalSetsCount = w.entries.reduce((sum, entry) => sum + entry.sets.length, 0);
      // 總容量 (已過濾 completed && !isWarmup)
      const workoutVolume = calculateWorkoutVolume(w);
      const displayVolume = formatWeight(workoutVolume, currentUnit, 1);

      return {
        id: w.id,
        workout: w,
        totalSetsCount,
        displayVolume,
      };
    });
  }, [historyList, currentUnit]);

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800">訓練歷史</h1>
        <p className="text-xs text-slate-400">查看過去的健身記錄與訓練容量累積。</p>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-slate-400 font-semibold animate-pulse">
          正在載入歷史記錄...
        </div>
      )}

      {/* 空狀態 */}
      {!isLoading && historyList.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl text-slate-400 shadow-inner">
            📅
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-700">尚無訓練歷史</h2>
            <p className="text-xs text-slate-400 max-w-xs">
              當你完成第一次訓練後，記錄將會自動彙整於此處。
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition"
          >
            去記錄新訓練
          </button>
        </div>
      )}

      {/* 歷史記錄列表 */}
      {!isLoading && historyList.length > 0 && (
        <div className="space-y-3">
          {historyStatsList.map(({ id, workout, totalSetsCount, displayVolume }) => {
            const duration = getDurationMinutes(workout);
            return (
              <div
                key={id}
                onClick={() => setSelectedWorkout(workout)}
                className="bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow transition duration-200 cursor-pointer space-y-3"
              >
                {/* 卡片標題區 */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">
                      {workout.title || '健身訓練'}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {formatDateTime(workout.startedAt)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-extrabold text-indigo-600">
                      {displayVolume} {currentUnit}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase">總容量</span>
                  </div>
                </div>

                {/* 數據概要 Bar */}
                <div className="flex gap-4 text-xs text-slate-500 font-semibold bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1">
                    <span>📂</span>
                    <span>{workout.entries.length} 動作</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🔢</span>
                    <span>{totalSetsCount} 組</span>
                  </div>
                  {duration > 0 && (
                    <div className="flex items-center gap-1">
                      <span>⏱️</span>
                      <span>{duration} 分鐘</span>
                    </div>
                  )}
                </div>

                {/* 動作概要名稱預覽 (動作名稱 join + 刪除 fallback 處理) */}
                <div className="text-[10px] text-slate-400 font-medium truncate">
                  {workout.entries
                    .map((entry) => {
                      const ex = allExercises.find((e) => e.id === entry.exerciseId);
                      return ex ? ex.name : '（已刪除的動作）';
                    })
                    .join('、')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 單次明細彈出面板 (Bottom Sheet style) */}
      {selectedWorkout && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setSelectedWorkout(null)} />
          <div className="relative bg-white w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            {/* 標頭 */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  {selectedWorkout.title || '訓練詳情'}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold">
                  {formatDateTime(selectedWorkout.startedAt)}
                  {getDurationMinutes(selectedWorkout) > 0 && ` • 耗時 ${getDurationMinutes(selectedWorkout)} 分鐘`}
                </p>
              </div>
              <button
                onClick={() => setSelectedWorkout(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 備註 */}
            {selectedWorkout.notes && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600">
                <span className="font-bold text-[10px] text-slate-400 uppercase block mb-1">訓練備註</span>
                {selectedWorkout.notes}
              </div>
            )}

            {/* 各個動作組數列表 */}
            <div className="space-y-4 overflow-y-auto max-h-[45vh] pr-1">
              {selectedWorkout.entries.map((entry) => {
                const exercise = allExercises.find((ex) => ex.id === entry.exerciseId);
                const exerciseName = exercise ? exercise.name : '（已刪除的動作）';

                // 計算單一動作容量
                const entryVolume = calculateEntryVolume(entry);
                const displayEntryVolume = formatWeight(entryVolume, currentUnit, 1);

                // 計算該動作的最佳 E1RM (僅限 completed && !isWarmup)
                const bestE1rm = entry.sets.reduce((max, s) => {
                  if (!s.completed || s.isWarmup) return max;
                  const e1rmVal = calculateE1rm(s.weight, s.reps, currentFormula);
                  return e1rmVal > max ? e1rmVal : max;
                }, 0);
                const displayBestE1rm = bestE1rm > 0 ? formatWeight(bestE1rm, currentUnit, 1) : null;

                return (
                  <div
                    key={entry.id}
                    className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm"
                  >
                    <div className="bg-slate-50/70 px-3.5 py-2.5 flex justify-between items-center border-b border-slate-100">
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs">{exerciseName}</h4>
                        <span className="text-[9px] text-slate-400 font-bold">
                          {exercise ? `${exercise.muscleGroup} / ${exercise.equipment}` : ''}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-extrabold text-slate-700">
                          {displayEntryVolume} {currentUnit}
                        </div>
                        {displayBestE1rm && (
                          <div className="text-[8px] font-extrabold text-indigo-500 uppercase">
                            最佳 1RM: {displayBestE1rm} {currentUnit}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-3 space-y-1.5">
                      {entry.sets.map((setLog, idx) => {
                        const setVolume = setLog.weight * setLog.reps;
                        const displaySetWeight = formatWeight(setLog.weight, currentUnit, 1);
                        
                        return (
                          <div
                            key={setLog.id}
                            className={`flex justify-between items-center text-xs p-1.5 rounded-lg ${
                              setLog.completed ? 'bg-emerald-50/20 text-slate-700' : 'text-slate-400 line-through'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-semibold">
                              <span className="w-5 text-center text-slate-400 font-bold text-[10px]">
                                組 {idx + 1}
                              </span>
                              <span>
                                {displaySetWeight} {currentUnit} × {setLog.reps} 下
                              </span>
                              {setLog.isWarmup && (
                                <span className="bg-amber-100 text-amber-700 font-extrabold px-1 py-0.5 rounded text-[8px] border border-amber-200">
                                  暖身
                                </span>
                              )}
                              {setLog.rpe && (
                                <span className="bg-slate-100 text-slate-600 font-extrabold px-1.5 py-0.5 rounded text-[8px]">
                                  RPE {setLog.rpe}
                                </span>
                              )}
                            </div>
                            {setLog.completed && !setLog.isWarmup && (
                              <span className="text-[9px] text-slate-400 font-bold font-mono">
                                容量: {formatWeight(setVolume, currentUnit, 1)} {currentUnit}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 總結資訊 */}
            <div className="border-t border-slate-100 pt-3 flex justify-between text-xs font-bold text-slate-500">
              <span>總訓練容量 ({currentUnit})：</span>
              <span className="text-indigo-600 text-sm">
                {formatWeight(calculateWorkoutVolume(selectedWorkout), currentUnit, 1)} {currentUnit}
              </span>
            </div>

            {/* 表單控制區 */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleReuseTemplate(selectedWorkout)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md transition"
              >
                以此為範本再做一次 (套用結構)
              </button>
              <button
                onClick={() => handleDeleteWorkout(selectedWorkout.id)}
                className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-extrabold rounded-xl transition"
              >
                刪除此筆訓練紀錄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
