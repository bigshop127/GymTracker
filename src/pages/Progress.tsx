import { useEffect, useState, useMemo } from 'react';
import { type Exercise, type Workout } from '../db/schema';
import { listCompletedWorkouts } from '../db/workouts';
import { useSettingsStore } from '../store/settings';
import { formatWeight } from '../lib/units';
import { calculateTrendPoints, type TrendMetric } from '../lib/trends';
import ExerciseList from '../components/ExerciseList';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export default function Progress() {
  const { settings } = useSettingsStore();
  const currentUnit = settings?.unit || 'kg';
  const currentFormula = settings?.e1rmFormula || 'epley';

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [metric, setMetric] = useState<TrendMetric>('e1rm');
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    listCompletedWorkouts().then((list) => {
      if (isMounted) {
        setWorkouts(list);
        setIsLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load completed workouts:', err);
      if (isMounted) {
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectExercise = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setIsSelectorOpen(false);
  };

  const rawPoints = useMemo(() => {
    if (!selectedExercise) return [];
    return calculateTrendPoints(workouts, selectedExercise.id, metric, currentFormula);
  }, [workouts, selectedExercise, metric, currentFormula]);

  const chartData = useMemo(() => {
    return rawPoints.map((p) => ({
      ...p,
      formattedDate: new Date(p.date).toLocaleDateString(undefined, {
        month: 'numeric',
        day: 'numeric',
      }),
      displayValue: formatWeight(p.value, currentUnit),
    }));
  }, [rawPoints, currentUnit]);

  const prs = useMemo(() => {
    if (!selectedExercise) return null;

    const e1rmPoints = calculateTrendPoints(workouts, selectedExercise.id, 'e1rm', currentFormula);
    const maxWeightPoints = calculateTrendPoints(workouts, selectedExercise.id, 'maxWeight', currentFormula);

    let bestE1rm = 0;
    let bestE1rmDate = 0;
    for (const p of e1rmPoints) {
      if (p.value > bestE1rm) {
        bestE1rm = p.value;
        bestE1rmDate = p.date;
      }
    }

    let bestMaxWeight = 0;
    let bestMaxWeightDate = 0;
    for (const p of maxWeightPoints) {
      if (p.value > bestMaxWeight) {
        bestMaxWeight = p.value;
        bestMaxWeightDate = p.date;
      }
    }

    return {
      bestE1rm: bestE1rm > 0 ? { value: bestE1rm, date: bestE1rmDate } : null,
      bestMaxWeight: bestMaxWeight > 0 ? { value: bestMaxWeight, date: bestMaxWeightDate } : null,
    };
  }, [workouts, selectedExercise, currentFormula]);

  const metricLabel = useMemo(() => {
    switch (metric) {
      case 'e1rm':
        return '預估 1RM';
      case 'maxWeight':
        return '最大重量';
      case 'volume':
        return '總容量';
      default:
        return '';
    }
  }, [metric]);

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* 頁面標題 */}
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800">進度圖表</h1>
        <p className="text-xs text-slate-400">
          選擇健身動作以追蹤你個人的力量與訓練容量趨勢。
        </p>
      </div>

      {/* 動作選擇 */}
      {selectedExercise ? (
        <div
          onClick={() => setIsSelectorOpen(true)}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer hover:border-indigo-500 hover:shadow-md transition duration-200"
        >
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">目前查看動作</div>
            <div className="text-sm font-bold text-slate-800 flex items-center gap-2 mt-0.5">
              {selectedExercise.name}
              <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded">
                {selectedExercise.muscleGroup}
              </span>
            </div>
          </div>
          <span className="text-indigo-600 font-bold text-xs flex items-center gap-1">
            變更動作
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
        </div>
      ) : (
        <div
          onClick={() => setIsSelectorOpen(true)}
          className="bg-indigo-50/30 border border-dashed border-indigo-200 rounded-2xl p-6 text-center cursor-pointer hover:bg-indigo-50/60 hover:border-indigo-300 transition duration-200"
        >
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-xl mx-auto mb-3 shadow-inner">
            📈
          </div>
          <h3 className="font-bold text-slate-800 text-sm">點擊選擇健身動作</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            選擇你想追蹤趨勢的動作，我們將為你分析該動作的歷史表現與最佳紀錄。
          </p>
        </div>
      )}

      {selectedExercise && (
        <>
          {/* 指標切換 */}
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 text-xs font-semibold">
            <button
              onClick={() => setMetric('e1rm')}
              className={`flex-1 py-2 text-center rounded-lg transition duration-250 ${
                metric === 'e1rm'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              預估 1RM
            </button>
            <button
              onClick={() => setMetric('maxWeight')}
              className={`flex-1 py-2 text-center rounded-lg transition duration-250 ${
                metric === 'maxWeight'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              最大重量
            </button>
            <button
              onClick={() => setMetric('volume')}
              className={`flex-1 py-2 text-center rounded-lg transition duration-250 ${
                metric === 'volume'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              總容量
            </button>
          </div>

          {/* 圖表區塊 */}
          {isLoading ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-xs font-semibold animate-pulse shadow-sm">
              載入中...
            </div>
          ) : chartData.length >= 2 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                {metricLabel} 趨勢圖 ({currentUnit})
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      dy={8}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '11px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      }}
                      formatter={(value) => [`${value} ${currentUnit}`, metricLabel]}
                      labelFormatter={(label) => `日期: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="displayValue"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center text-xl mx-auto mb-3 shadow-inner">
                📊
              </div>
              <h3 className="font-bold text-slate-700 text-sm">數據點不足</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                此動作至少需要完成 2 次訓練紀錄，才能繪製趨勢圖。
              </p>
            </div>
          )}

          {/* PR 紀錄區塊 */}
          {prs && (
            <div className="grid grid-cols-2 gap-4">
              {/* E1RM PR Card */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute right-3 top-3 text-lg opacity-25">🏆</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">最佳預估 1RM</div>
                {prs.bestE1rm ? (
                  <div className="mt-2">
                    <div className="text-lg font-black text-indigo-600">
                      {formatWeight(prs.bestE1rm.value, currentUnit)} <span className="text-[10px] font-semibold text-slate-500">{currentUnit}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {new Date(prs.bestE1rm.date).toLocaleDateString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic mt-2">無數據</div>
                )}
              </div>

              {/* Max Weight PR Card */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute right-3 top-3 text-lg opacity-25">💪</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">歷史最大重量</div>
                {prs.bestMaxWeight ? (
                  <div className="mt-2">
                    <div className="text-lg font-black text-indigo-600">
                      {formatWeight(prs.bestMaxWeight.value, currentUnit)} <span className="text-[10px] font-semibold text-slate-500">{currentUnit}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {new Date(prs.bestMaxWeight.date).toLocaleDateString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic mt-2">無數據</div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 動作選擇器 Modal (Slide Up Drawer) */}
      {isSelectorOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setIsSelectorOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">選擇動作</h3>
              <button onClick={() => setIsSelectorOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[65vh]">
              <ExerciseList mode="select" onSelect={handleSelectExercise} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
