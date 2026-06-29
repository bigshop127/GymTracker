import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCompletedWorkouts, deleteWorkout } from '../db/workouts';
import { listExercises } from '../db/exercises';
import { saveTemplate, createTemplateFromWorkout } from '../db/templates';
import { type Workout, type Exercise } from '../db/schema';
import { calculateWorkoutVolume, calculateEntryVolume } from '../lib/volume';
import { formatWeight } from '../lib/units';
import { calculateE1rm } from '../lib/e1rm';
import { useSettingsStore } from '../store/settings';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { buildExerciseMap, getDaySummary } from '../lib/workoutSummary';
import { getMuscleIcon } from '../data/muscle-icons';
import { getLocationColor } from '../lib/locationStyle';

export default function History() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { startWorkoutFromTemplate, activeWorkout } = useActiveWorkoutStore();

  const [historyList, setHistoryList] = useState<Workout[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 7B: 視圖切換與日曆狀態
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(() => {
    const date = new Date();
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

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

  // 7B: 今天日期字串
  const todayDateStr = useMemo(() => {
    const date = new Date();
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // 7B: 預設選中今天已在 useState 中設定，無需額外 useEffect

  // 7B: 將訓練歷史按日期 (YYYY-MM-DD) 分組
  const workoutsByDate = useMemo(() => {
    const groups: Record<string, Workout[]> = {};
    historyList.forEach((w) => {
      const date = new Date(w.startedAt);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(w);
    });
    return groups;
  }, [historyList]);

  // 7B: 當前選中日期的訓練紀錄
  const selectedDateWorkouts = useMemo(() => {
    if (!selectedDateStr) return [];
    return workoutsByDate[selectedDateStr] || [];
  }, [selectedDateStr, workoutsByDate]);

  // 7B: 產生當月月曆網格
  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 是週日
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: { dateStr: string | null; dayNum: number | null }[] = [];

    // 前月空格填充
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }

    // 當月日期
    for (let day = 1; day <= totalDays; day++) {
      const mStr = (month + 1).toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;
      cells.push({ dateStr, dayNum: day });
    }

    return cells;
  }, [currentMonth]);

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

  // 另存為範本 (保留重量)
  const handleSaveAsTemplate = async (workout: Workout) => {
    const defaultName = workout.title || '我的範本';
    const name = window.prompt('請輸入範本名稱：', defaultName);
    if (name === null) return; // user cancelled

    const templateName = name.trim() || defaultName;
    try {
      const template = createTemplateFromWorkout(workout, templateName);
      await saveTemplate(template);
      alert('範本儲存成功！');
    } catch (err) {
      console.error(err);
      alert('儲存範本失敗');
    }
  };

  const formatCardioSet = (setLog: { durationSeconds?: number; distanceKm?: number; calories?: number }) => {
    const parts: string[] = [];
    if (setLog.durationSeconds) {
      const m = Math.floor(setLog.durationSeconds / 60);
      const s = setLog.durationSeconds % 60;
      parts.push(s > 0 ? `${m}分${s}秒` : `${m}分`);
    }
    if (setLog.distanceKm) parts.push(`${setLog.distanceKm.toFixed(1)} km`);
    if (setLog.calories) parts.push(`${setLog.calories} kcal`);
    return parts.length > 0 ? parts.join(' · ') : '—';
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

  // 建立 Exercise Map 供搜尋與日曆主要部位查詢使用
  const exMap = useMemo(() => {
    return buildExerciseMap(allExercises);
  }, [allExercises]);

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

  // 關鍵字搜尋過濾後的歷史列表
  const filteredStatsList = useMemo(() => {
    const trimmed = searchKeyword.trim().toLowerCase();
    if (!trimmed) return historyStatsList;

    return historyStatsList.filter(({ workout }) => {
      if (workout.title?.toLowerCase().includes(trimmed)) return true;
      if (workout.location?.toLowerCase().includes(trimmed)) return true;

      for (const entry of workout.entries) {
        const ex = exMap.get(entry.exerciseId);
        if (!ex) continue;
        if (ex.name.toLowerCase().includes(trimmed)) return true;
        if (ex.muscleGroup.toLowerCase().includes(trimmed)) return true;
      }
      return false;
    });
  }, [historyStatsList, searchKeyword, exMap]);

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">訓練歷史</h1>
        <p className="text-xs text-slate-400">查看過去的健身記錄與訓練容量累積。</p>
      </div>

      {/* 視圖切換 */}
      <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-xl flex gap-1 text-xs font-semibold">
        <button
          onClick={() => setViewMode('list')}
          className={`flex-1 py-2 text-center rounded-lg transition duration-200 cursor-pointer ${
            viewMode === 'list'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          清單檢視
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={`flex-1 py-2 text-center rounded-lg transition duration-200 cursor-pointer ${
            viewMode === 'calendar'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          日曆檢視
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-slate-400 font-semibold animate-pulse">
          正在載入歷史記錄...
        </div>
      )}

      {/* 搜尋框 */}
      {!isLoading && viewMode === 'list' && historyList.length > 0 && (
        <div className="relative">
          <input
            type="text"
            placeholder="搜尋標題、地點、動作或部位..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-xs border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="absolute left-3 top-3 text-slate-400 text-xs">
            🔍
          </span>
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword('')}
              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* 清單檢視 - 空狀態 */}
      {!isLoading && viewMode === 'list' && historyList.length === 0 && (
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

      {/* 清單檢視 - 歷史記錄列表/搜尋結果 */}
      {!isLoading && viewMode === 'list' && historyList.length > 0 && (
        <>
          {filteredStatsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] text-center space-y-3 py-12">
              <div className="text-3xl text-slate-400">🔍</div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  找不到符合「{searchKeyword}」的訓練
                </p>
                <p className="text-xs text-slate-400">
                  請嘗試輸入其他動作名稱、部位或地點。
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStatsList.map(({ id, workout, totalSetsCount, displayVolume }) => {
                const duration = getDurationMinutes(workout);
                return (
                  <div
                    key={id}
                    onClick={() => setSelectedWorkout(workout)}
                    className="bg-white border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow hover:border-slate-200 dark:bg-slate-900 transition duration-200 cursor-pointer space-y-3"
                  >
                    {/* 卡片標題區 */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                          {workout.title || '健身訓練'}
                        </h3>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {formatDateTime(workout.startedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                            {displayVolume} {currentUnit}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase">總容量</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWorkout(workout.id);
                          }}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                          title="刪除訓練紀錄"
                        >
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 數據概要 Bar */}
                    <div className="flex flex-wrap gap-4 text-xs text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
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
                      {workout.location && (
                        <div className="flex items-center gap-1">
                          <span>📍</span>
                          <span>{workout.location}</span>
                        </div>
                      )}
                    </div>

                    {/* 動作概要名稱預覽 (動作名稱 join + 刪除 fallback 處理) */}
                    <div className="text-[10px] text-slate-400 font-medium truncate">
                      {workout.entries
                        .map((entry) => {
                          const ex = exMap.get(entry.exerciseId);
                          return ex ? ex.name : '（已刪除的動作）';
                        })
                        .join('、')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 日曆檢視 (Calendar View) */}
      {!isLoading && viewMode === 'calendar' && (
        <div className="space-y-4 animate-fade-in">
          {/* 日曆卡片 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 transition-colors duration-200">
            {/* 年月份切換與標頭 */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-50 dark:border-slate-800/50">
              <button
                onClick={() => {
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
                }}
                className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                {currentMonth.getFullYear()} 年 {currentMonth.getMonth() + 1} 月
              </h3>
              <button
                onClick={() => {
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
                }}
                className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>

            {/* 星期標題 */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* 日曆網格 */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarGrid.map((cell, idx) => {
                if (!cell.dateStr) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }

                const isToday = cell.dateStr === todayDateStr;
                const isSelected = cell.dateStr === selectedDateStr;
                const hasWorkouts = !!workoutsByDate[cell.dateStr];

                return (
                  <button
                    key={cell.dateStr}
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    className={`aspect-square rounded-xl text-xs font-bold relative flex flex-col items-center justify-center transition cursor-pointer select-none ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none'
                        : isToday
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cell.dayNum}
                    {/* 有訓練的部位圖示或小圓點 */}
                    {hasWorkouts && !isSelected && (() => {
                      const summary = getDaySummary(workoutsByDate[cell.dateStr], exMap);
                      const color = getLocationColor(summary.location);
                      const markup = summary.primaryMuscle ? getMuscleIcon(summary.primaryMuscle) : null;
                      return markup
                        ? <svg viewBox="0 0 24 24" fill="currentColor" style={{ color }}
                            className="absolute bottom-1 w-3.5 h-3.5" dangerouslySetInnerHTML={{ __html: markup }} />
                        : <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
                    })()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 日曆顏色圖例 */}
          <div className="flex flex-wrap justify-center gap-4 text-[10px] font-semibold text-slate-400 py-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
              <span>中壢建工</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f43f5e' }} />
              <span>楊梅WG</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#94a3b8' }} />
              <span>其他地點</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#cbd5e1' }} />
              <span>無地點</span>
            </div>
          </div>

          {/* 當日訓練列表 */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {selectedDateStr === todayDateStr ? '今天' : selectedDateStr} 的訓練紀錄
            </h4>
            
            {selectedDateWorkouts.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                當天無訓練紀錄
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDateWorkouts.map((w) => {
                  const totalSetsCount = w.entries.reduce((sum, entry) => sum + entry.sets.length, 0);
                  return (
                    <div
                      key={w.id}
                      onClick={() => setSelectedWorkout(w)}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 rounded-xl p-3 shadow-sm flex justify-between items-center cursor-pointer transition"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                            {w.title || '健身訓練'}
                          </span>
                          {w.location && (
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                              📍 {w.location}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {w.entries.length} 個動作 • {totalSetsCount} 組
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                          {formatWeight(calculateWorkoutVolume(w), currentUnit, 1)} {currentUnit}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWorkout(w.id);
                          }}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                          title="刪除訓練紀錄"
                        >
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                  {selectedWorkout.location && ` • 📍 ${selectedWorkout.location}`}
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
                const exercise = exMap.get(entry.exerciseId);
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
                      {exercise?.muscleGroup === '有氧' ? (
                        <div className="text-right">
                          <div className="text-[10px] font-extrabold text-teal-600">
                            {(() => {
                              const totalSec = entry.sets.reduce((s, set) => s + (set.durationSeconds ?? 0), 0);
                              return totalSec > 0 ? `${Math.round(totalSec / 60)} 分鐘` : '—';
                            })()}
                          </div>
                          <div className="text-[8px] font-bold text-slate-400 uppercase">有氧訓練</div>
                        </div>
                      ) : (
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
                      )}
                    </div>

                    <div className="p-3 space-y-1.5">
                      {(() => {
                        const isCardio = exercise?.muscleGroup === '有氧';
                        return entry.sets.map((setLog, idx) => {
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
                                {isCardio ? (
                                  <span>{formatCardioSet(setLog)}</span>
                                ) : (
                                  <>
                                    <span>{displaySetWeight} {currentUnit} × {setLog.reps} 下</span>
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
                                  </>
                                )}
                              </div>
                              {!isCardio && setLog.completed && !setLog.isWarmup && (
                                <span className="text-[9px] text-slate-400 font-bold font-mono">
                                  容量: {formatWeight(setVolume, currentUnit, 1)} {currentUnit}
                                </span>
                              )}
                            </div>
                          );
                        });
                      })()}
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
                className="w-full py-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 text-xs font-extrabold rounded-xl transition"
              >
                以此為範本再做一次 (重置重量)
              </button>
              <button
                onClick={() => handleSaveAsTemplate(selectedWorkout)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md transition"
              >
                💾 另存為範本 (保留重量)
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
