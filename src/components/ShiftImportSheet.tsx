import { useMemo, useRef, useState } from 'react';
import { listDayOverridesInRange, saveDayOverride } from '../db/dayOverrides';
import type { DayOverride } from '../db/schema';
import { recognizeShiftImage } from '../lib/shiftAi';
import {
  IMPORT_CHOICES,
  buildImportRows,
  describeExisting,
  rowStatus,
  summarizeRows,
  toOverrideInput,
  type ImportChoice,
  type ImportRow,
  type ShiftScan,
} from '../lib/shiftImport';

interface Props {
  todayDateStr: string;
  onApplied: (year: number, month: number) => void;
  onClose: () => void;
}

type Stage = 'pick' | 'loading' | 'review';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');

function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

export default function ShiftImportSheet({ todayDateStr, onApplied, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ShiftScan | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [existingMap, setExistingMap] = useState<Map<string, DayOverride>>(new Map());
  const [skippedPast, setSkippedPast] = useState(0);
  const [applying, setApplying] = useState(false);
  const [showSame, setShowSame] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage('loading');
    try {
      const result = await recognizeShiftImage(file);
      const last = new Date(result.year, result.month, 0).getDate();
      const overrides = await listDayOverridesInRange(
        `${result.year}-${pad(result.month)}-01`,
        `${result.year}-${pad(result.month)}-${pad(last)}`,
      );
      const map = new Map(overrides.map((o) => [o.id, o]));
      const built = buildImportRows(result, map, todayDateStr);
      setScan(result);
      setExistingMap(map);
      setRows(built.rows);
      setSkippedPast(built.skippedPast);
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : '辨識失敗，請再試一次');
      setStage('pick');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setChoice = (dateStr: string, choice: ImportChoice) => {
    setRows((prev) => prev.map((r) => (r.dateStr === dateStr ? { ...r, choice } : r)));
  };

  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const writable = rows.filter((r) => {
    const s = rowStatus(r);
    return s === 'new' || s === 'overwrite';
  });
  const overwriteRows = rows.filter((r) => rowStatus(r) === 'overwrite');
  const newRows = rows.filter((r) => rowStatus(r) === 'new');
  const sameRows = rows.filter((r) => rowStatus(r) === 'same');
  const keepRows = rows.filter((r) => rowStatus(r) === 'keep');

  const apply = async () => {
    if (writable.length === 0) return;
    setApplying(true);
    try {
      await Promise.all(
        writable.map((r) => saveDayOverride(toOverrideInput(r, existingMap.get(r.dateStr)))),
      );
      if (scan) onApplied(scan.year, scan.month);
    } catch (err) {
      console.error(err);
      setError('套用失敗，請再試一次');
      setApplying(false);
    }
  };

  const renderRow = (r: ImportRow) => {
    const status = rowStatus(r);
    return (
      <div
        key={r.dateStr}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
          status === 'overwrite'
            ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30'
            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
        }`}
      >
        <div className="w-14 shrink-0">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {Number(r.dateStr.slice(5, 7))}/{r.day}
          </div>
          <div className="text-[10px] font-semibold text-slate-400">週{weekdayOf(r.dateStr)}</div>
        </div>
        <div className="flex-1 min-w-0 text-[11px] leading-tight">
          <div className="text-slate-500 dark:text-slate-400 truncate">現在：{describeExisting(r.existing)}</div>
          <div className="text-slate-400 dark:text-slate-500 truncate">截圖：{r.label || '（讀不到）'}</div>
        </div>
        <select
          value={r.choice}
          onChange={(e) => setChoice(r.dateStr, e.target.value as ImportChoice)}
          className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-bold px-2 py-1.5"
        >
          {IMPORT_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
    );
  };

  const section = (title: string, tone: string, list: ImportRow[]) =>
    list.length > 0 && (
      <div className="space-y-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider block ${tone}`}>
          {title}（{list.length} 天）
        </span>
        {list.map(renderRow)}
      </div>
    );

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-[60] flex items-end justify-center">
      <div className="fixed inset-0" onClick={applying ? undefined : onClose} />
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[88vh] overflow-y-auto animate-slide-up transition-colors duration-200">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            📷 班表截圖匯入{scan ? `（${scan.year} 年 ${scan.month} 月）` : ''}
          </h3>
          <button
            onClick={onClose}
            disabled={applying}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            關閉
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {stage === 'pick' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              選一張班表 App 的月曆截圖，AI 會讀出每天的班別。套用前會先列出跟現在登記不同的日子，你可以逐天修改。
            </p>
            {error && (
              <p className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-3">
                {error}
              </p>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition cursor-pointer"
            >
              選擇截圖
            </button>
          </div>
        )}

        {stage === 'loading' && (
          <div className="py-10 text-center space-y-3">
            <div className="mx-auto w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">辨識中，約需幾秒…</p>
          </div>
        )}

        {stage === 'review' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 py-2">
                <div className="text-lg font-extrabold text-orange-600 dark:text-orange-400">{summary.overwrite}</div>
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">會改掉原登記</div>
              </div>
              <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 py-2">
                <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{summary.new}</div>
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">新增登記</div>
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800 py-2">
                <div className="text-lg font-extrabold text-slate-600 dark:text-slate-300">{summary.same + summary.keep}</div>
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">不動</div>
              </div>
            </div>
            {skippedPast > 0 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                已過去的 {skippedPast} 天不能改，已略過。
              </p>
            )}
            {error && (
              <p className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-3">
                {error}
              </p>
            )}

            {section('⚠️ 跟現在登記不同', 'text-orange-600 dark:text-orange-400', overwriteRows)}
            {section('新增登記', 'text-indigo-600 dark:text-indigo-400', newRows)}
            {section('讀不懂／選了不更動', 'text-slate-400 dark:text-slate-500', keepRows)}

            {sameRows.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSame((v) => !v)}
                  className="text-[11px] font-bold text-slate-400 dark:text-slate-500 cursor-pointer"
                >
                  {showSame ? '▾' : '▸'} 跟現在一樣（{sameRows.length} 天）
                </button>
                {showSame && sameRows.map(renderRow)}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setStage('pick'); setScan(null); setRows([]); }}
                disabled={applying}
                className="shrink-0 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                重選截圖
              </button>
              <button
                onClick={apply}
                disabled={applying || writable.length === 0}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition cursor-pointer"
              >
                {applying ? '套用中…' : writable.length === 0 ? '沒有需要更新的日子' : `一鍵套用（寫入 ${writable.length} 天）`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
