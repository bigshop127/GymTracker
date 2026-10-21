import { useEffect, useMemo, useState } from 'react';
import { type BodyMetric } from '../db/schema';
import { addBodyMetric, deleteBodyMetric, listBodyMetrics, updateBodyMetric } from '../db/bodyMetrics';
import { useSettingsStore } from '../store/settings';
import { formatWeight, toKgFromDisplay } from '../lib/units';
import { getLocalDateStr } from '../lib/shiftPlan';
import { openDatePicker } from '../lib/datePicker';
import {
  WEIGHT_RANGE_OPTIONS,
  changeOverDays,
  dateStrToTimestamp,
  filterByRange,
  toDailyWeights,
  type WeightRange,
} from '../lib/bodyWeight';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const MIN_KG = 20;
const MAX_KG = 400;

function formatMonthDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${weekday}）`;
}

export default function WeightPage() {
  const { settings } = useSettingsStore();
  const unit = settings?.unit || 'kg';
  const theme = settings?.theme || 'system';
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState<WeightRange>('90');
  const [now, setNow] = useState(() => Date.now());

  // 跨午夜從背景切回來時，「今天」要跟著換（比照 SchedulePage）
  useEffect(() => {
    const handleUpdateNow = () => {
      setNow(Date.now());
    };
    window.addEventListener('focus', handleUpdateNow);
    document.addEventListener('visibilitychange', handleUpdateNow);
    return () => {
      window.removeEventListener('focus', handleUpdateNow);
      document.removeEventListener('visibilitychange', handleUpdateNow);
    };
  }, []);

  // 輸入表單：日期預設今天；從清單按「編輯」會把那筆帶上來
  const [dateStr, setDateStr] = useState(() => getLocalDateStr(Date.now()));
  const [weightInput, setWeightInput] = useState('');
  const [fatInput, setFatInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = async () => {
    const list = await listBodyMetrics();
    setMetrics(list);
  };

  useEffect(() => {
    let active = true;
    listBodyMetrics()
      .then((list) => {
        if (active) setMetrics(list);
      })
      .catch((err) => console.error('Failed to load body metrics:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const todayStr = getLocalDateStr(now);
  const points = useMemo(() => toDailyWeights(metrics), [metrics]);
  const rangePoints = useMemo(() => filterByRange(points, range, todayStr), [points, range, todayStr]);
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const change7 = useMemo(() => changeOverDays(points, 7), [points]);
  const change30 = useMemo(() => changeOverDays(points, 30), [points]);

  const existingForDate = points.find((p) => p.dateStr === dateStr) ?? null;
  const isUpdating = !!editingId || !!existingForDate;

  const chartData = useMemo(
    () => rangePoints.map((p) => ({ t: p.date, value: formatWeight(p.kg, unit) })),
    [rangePoints, unit]
  );
  const rangeStats = useMemo(() => {
    if (rangePoints.length === 0) return null;
    const kgs = rangePoints.map((p) => p.kg);
    return { max: Math.max(...kgs), min: Math.min(...kgs) };
  }, [rangePoints]);

  // 清單：新→舊，順便算跟前一筆差多少
  const listRows = useMemo(() => {
    const rows = rangePoints.map((p, i) => ({
      ...p,
      diffKg: i > 0 ? p.kg - rangePoints[i - 1].kg : null,
    }));
    return rows.reverse();
  }, [rangePoints]);

  const formatChange = (kgDelta: number | null): string => {
    if (kgDelta === null) return '—';
    const shown = formatWeight(Math.abs(kgDelta), unit);
    if (shown === 0) return '持平';
    return `${kgDelta > 0 ? '▲' : '▼'} ${shown} ${unit}`;
  };

  const resetForm = () => {
    setDateStr(todayStr);
    setWeightInput('');
    setFatInput('');
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async () => {
    setSavedMessage(null);
    const weight = Number(weightInput);
    if (weightInput.trim() === '' || !Number.isFinite(weight)) {
      setFormError('請輸入體重');
      return;
    }
    const kg = toKgFromDisplay(weight, unit);
    if (kg < MIN_KG || kg > MAX_KG) {
      setFormError(`體重要在 ${formatWeight(MIN_KG, unit, 0)}～${formatWeight(MAX_KG, unit, 0)} ${unit} 之間`);
      return;
    }
    let fat: number | undefined;
    if (fatInput.trim() !== '') {
      fat = Number(fatInput);
      if (!Number.isFinite(fat) || fat < 1 || fat > 75) {
        setFormError('體脂率要在 1～75% 之間（不填也可以）');
        return;
      }
    }
    if (!dateStr) {
      setFormError('請選日期');
      return;
    }
    if (editingId && existingForDate && existingForDate.id !== editingId) {
      setFormError('那天已經有一筆紀錄了，請改那一筆');
      return;
    }

    const targetId = editingId ?? existingForDate?.id ?? null;
    setIsSaving(true);
    try {
      if (targetId) {
        // 「編輯」那筆時體脂欄有帶出舊值，清空＝真的要刪（給 undefined，Dexie update 會刪掉這個欄位）；
        // 直接在同一天再記一次時體脂欄是空的，空著＝沿用那天原本的體脂，不要洗掉
        await updateBodyMetric(targetId, {
          date: dateStrToTimestamp(dateStr),
          bodyWeight: kg,
          ...(editingId || fat !== undefined ? { bodyFatPct: fat } : {}),
        });
      } else {
        await addBodyMetric({
          date: dateStrToTimestamp(dateStr),
          bodyWeight: kg,
          ...(fat !== undefined ? { bodyFatPct: fat } : {}),
        });
      }
      await reload();
      setSavedMessage(`已${targetId ? '更新' : '記錄'} ${formatDateStr(dateStr)} ${formatWeight(kg, unit)} ${unit}`);
      resetForm();
    } catch (err) {
      console.error('Failed to save body weight:', err);
      setFormError('儲存失敗，請再試一次');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (id: string) => {
    const p = points.find((x) => x.id === id);
    if (!p) return;
    setEditingId(p.id);
    setDateStr(p.dateStr);
    setWeightInput(String(formatWeight(p.kg, unit)));
    setFatInput(p.bodyFatPct !== undefined ? String(p.bodyFatPct) : '');
    setFormError(null);
    setSavedMessage(null);
    setConfirmDeleteId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBodyMetric(id);
      if (editingId === id) resetForm();
      setConfirmDeleteId(null);
      await reload();
    } catch (err) {
      console.error('Failed to delete body weight:', err);
    }
  };

  const lineColor = isDark ? '#6366f1' : '#4f46e5'; // indigo-500 / indigo-600（dataviz 驗色器在兩種底色都過）
  const surfaceColor = isDark ? '#0f172a' : '#ffffff';
  const gridStroke = isDark ? '#334155' : '#f1f5f9';
  const inputClass =
    'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500';

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-10">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">體重紀錄</h1>
        <p className="text-xs text-slate-400">一天記一筆，同一天再記會更新那筆。體脂率可以不填。</p>
      </div>

      {/* 輸入 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 col-span-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">日期</span>
            <input
              type="date"
              max={todayStr}
              value={dateStr}
              onClick={openDatePicker}
              onChange={(e) => {
                setDateStr(e.target.value);
                setFormError(null);
                setSavedMessage(null);
              }}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">體重（{unit}）</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weightInput}
              onChange={(e) => {
                setWeightInput(e.target.value);
                setFormError(null);
                setSavedMessage(null);
              }}
              placeholder={latest ? String(formatWeight(latest.kg, unit)) : unit === 'kg' ? '例如 72.5' : '例如 160'}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">體脂率（%，選填）</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={fatInput}
              onChange={(e) => {
                setFatInput(e.target.value);
                setFormError(null);
                setSavedMessage(null);
              }}
              placeholder="例如 18"
              className={inputClass}
            />
          </label>
        </div>

        {!editingId && existingForDate && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            這天已經記過 {formatWeight(existingForDate.kg, unit)} {unit}
            {existingForDate.bodyFatPct !== undefined ? `（體脂 ${existingForDate.bodyFatPct}%）` : ''}，儲存會更新那一筆
            {existingForDate.bodyFatPct !== undefined ? '；體脂空著就沿用原本的' : ''}。
          </p>
        )}
        {formError && <p className="text-[11px] font-bold text-red-500">{formError}</p>}
        {savedMessage && <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">✓ {savedMessage}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition cursor-pointer shadow-sm"
          >
            {isUpdating ? '更新這天' : '記錄'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-sm border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              取消編輯
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs font-semibold animate-pulse shadow-sm">
          載入中...
        </div>
      ) : points.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-3xl mb-2">⚖️</div>
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">還沒有體重紀錄</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">在上面輸入今天的體重，按「記錄」就會開始畫趨勢。</p>
        </div>
      ) : (
        <>
          {/* 摘要：目前體重＋跟 7／30 天前比 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">目前</div>
              <div className="mt-1 text-xl font-black text-slate-800 dark:text-slate-100 leading-tight">
                {latest ? formatWeight(latest.kg, unit) : '—'}
                <span className="text-[10px] font-semibold text-slate-500 ml-0.5">{unit}</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {latest ? formatMonthDay(latest.date) : ''}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">比 7 天前</div>
              <div className="mt-1 text-sm font-extrabold text-slate-700 dark:text-slate-200">{formatChange(change7)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">比 30 天前</div>
              <div className="mt-1 text-sm font-extrabold text-slate-700 dark:text-slate-200">{formatChange(change30)}</div>
            </div>
          </div>

          {/* 期間（底下的趨勢圖、清單都跟著這個） */}
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl text-xs font-bold">
            {WEIGHT_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className={`flex-1 py-2 text-center rounded-lg transition duration-200 cursor-pointer ${
                  range === opt.value
                    ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 趨勢圖 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                體重趨勢（{unit}）
              </span>
              {rangeStats && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  最高 {formatWeight(rangeStats.max, unit)}・最低 {formatWeight(rangeStats.min, unit)}
                </span>
              )}
            </div>
            {chartData.length >= 2 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(t: number) => formatMonthDay(t)}
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
                      domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                      contentStyle={{
                        background: isDark ? '#1e293b' : '#0f172a',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '11px',
                      }}
                      formatter={(value) => [`${value} ${unit}`, '體重']}
                      labelFormatter={(label) => formatMonthDay(Number(label))}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={lineColor}
                      strokeWidth={2}
                      dot={{ r: 4, fill: lineColor, stroke: surfaceColor, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: lineColor, stroke: surfaceColor, strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
                這段期間至少要 2 筆紀錄才畫得出趨勢
              </p>
            )}
          </div>

          {/* 紀錄清單 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-4 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              紀錄（{listRows.length} 筆）
            </div>
            {listRows.length === 0 && (
              <p className="px-4 py-6 text-xs text-slate-400 dark:text-slate-500 text-center">這段期間沒有紀錄</p>
            )}
            {listRows.map((row) => (
              <div key={row.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatDateStr(row.dateStr)}</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {row.diffKg === null ? '第一筆' : `比上一筆 ${formatChange(row.diffKg)}`}
                    {row.bodyFatPct !== undefined ? `・體脂 ${row.bodyFatPct}%` : ''}
                  </div>
                </div>
                <div className="text-base font-black text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {formatWeight(row.kg, unit)}
                  <span className="text-[10px] font-semibold text-slate-500 ml-0.5">{unit}</span>
                </div>
                {confirmDeleteId === row.id ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-red-600 text-white cursor-pointer"
                    >
                      確定刪除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(row.id)}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(row.id)}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                    >
                      刪除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
