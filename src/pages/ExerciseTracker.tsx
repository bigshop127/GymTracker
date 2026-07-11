import { useEffect, useMemo, useState } from 'react';
import { type Exercise, type Workout } from '../db/schema';
import { listExercises } from '../db/exercises';
import { listCompletedWorkouts } from '../db/workouts';
import { useSettingsStore } from '../store/settings';
import { formatWeight } from '../lib/units';
import { getExerciseSessions, getTrackedExerciseSummaries } from '../lib/exerciseSessions';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ExerciseTracker() {
  const { settings } = useSettingsStore();
  const currentUnit = settings?.unit || 'kg';

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([listCompletedWorkouts(), listExercises()]).then(([w, ex]) => {
      if (!isMounted) return;
      setWorkouts(w);
      setExercises(ex);
      setIsLoading(false);
    }).catch((err) => {
      console.error('Failed to load exercise tracker data:', err);
      if (isMounted) setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, []);

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const summaries = useMemo(() => getTrackedExerciseSummaries(workouts), [workouts]);

  const expandedSessions = useMemo(() => {
    if (!expandedId) return [];
    // 展開的紀錄依日期「舊到新」排序，方便由上到下閱讀強度變化
    return getExerciseSessions(workouts, expandedId).slice().reverse();
  }, [workouts, expandedId]);

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-10">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">項目追蹤</h1>
        <p className="text-xs text-slate-400">
          點選一個動作，查看每次訓練的日期與重量/次數，追蹤你的強度變化。
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs font-semibold animate-pulse shadow-sm">
          載入中...
        </div>
      ) : summaries.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center text-xl mx-auto mb-3 shadow-inner">
            🗂️
          </div>
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">尚無訓練紀錄</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">完成第一次訓練後，這裡就會列出你練過的所有動作。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {summaries.map((s) => {
            const exercise = exerciseMap.get(s.exerciseId);
            const isExpanded = expandedId === s.exerciseId;
            const isCardio = exercise?.muscleGroup === '有氧';
            return (
              <div
                key={s.exerciseId}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : s.exerciseId)}
                  className="w-full flex justify-between items-center gap-3 p-4 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">
                        {exercise ? exercise.name : '（動作已刪除）'}
                      </span>
                      {exercise && (
                        <span className="shrink-0 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold px-1.5 py-0.5 rounded">
                          {exercise.muscleGroup}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      最近一次 {formatDate(s.lastDate)} • 共 {s.sessionCount} 次紀錄
                    </p>
                  </div>
                  <svg
                    fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"
                    className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 p-4 space-y-2.5 bg-slate-50/50 dark:bg-slate-950/20">
                    {expandedSessions.map((session) => {
                      const workingSets = session.sets.filter((set) => !set.isWarmup);
                      const maxWeight = workingSets.length > 0 ? Math.max(...workingSets.map((set) => set.weight)) : 0;
                      return (
                        <div key={session.workoutId} className="flex items-start gap-3">
                          <div className="shrink-0 w-11 text-center">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-300">{formatDate(session.date)}</span>
                          </div>
                          <div className="flex-1 flex flex-wrap gap-1.5">
                            {session.sets.map((set, idx) => {
                              const isTopSet = !isCardio && !set.isWarmup && set.weight === maxWeight && maxWeight > 0;
                              return (
                                <span
                                  key={idx}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                                    set.isWarmup
                                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
                                      : isTopSet
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {isCardio
                                    ? `${Math.round((set.durationSeconds ?? 0) / 60)}分${set.distanceKm ? ` ${set.distanceKm}km` : ''}`
                                    : `${formatWeight(set.weight, currentUnit)}${currentUnit} × ${set.reps}`}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
