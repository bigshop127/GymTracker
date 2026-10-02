import { useMemo, useState } from 'react';
import { type TrainingProgram, type WorkoutTemplate } from '../db/schema';
import { useProgramStore } from '../store/program';
import { TEMPLATE_CATEGORIES, groupTemplatesByCategory } from '../lib/splitRotation';
import NumberStepper from './NumberStepper';
import SheetHeader from './SheetHeader';

interface ProgramFormSheetProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: TrainingProgram | null;   // edit 時帶入
  templates: WorkoutTemplate[];
  onClose: () => void;
  onSaved?: () => void;               // 儲存成功後通知呼叫端（重載清單）
}

const DEFAULT_SLOT_LABELS = ['胸日', '背日', '腿臀日', '肩日', '手臂日'];

type SlotDraft = { id: string; label: string; templateId?: string; selfScheduled?: boolean };

function toDateInputValue(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 日期欄位（本地 YYYY-MM-DD）→ 當天 00:00 的時間戳 */
function fromDateInputValue(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export default function ProgramFormSheet({
  open,
  mode,
  initial,
  templates,
  onClose,
  onSaved,
}: ProgramFormSheetProps) {
  const { currentProgram, createProgram, updateProgram } = useProgramStore();

  const [programName, setProgramName] = useState('');
  const [programSlots, setProgramSlots] = useState<SlotDraft[]>([]);
  // 編輯時才有：開始日期（算「開始後第幾週」）、目前第幾輪（決定課表用第幾週的組數）
  const [startDate, setStartDate] = useState('');
  const [lapNumber, setLapNumber] = useState(1);

  // 每次 open 由 false→true 時用 initial 重置表單狀態（別讓上一次的殘留值帶進來）。
  // 在 render 階段直接處理（比照 NumberStepper 的寫法）以避免 useEffect 的 setState 級聯警告。
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      if (mode === 'edit' && initial) {
        setProgramName(initial.name);
        setProgramSlots(initial.slots.map(s => ({ ...s })));
        setStartDate(toDateInputValue(initial.startedAt));
        setLapNumber(initial.cycleCount + 1);
      } else {
        setProgramName('我的訓練計畫');
        setProgramSlots(DEFAULT_SLOT_LABELS.map((label) => ({ id: crypto.randomUUID(), label })));
        setStartDate('');
        setLapNumber(1);
      }
    }
  }

  const groupedTemplates = useMemo(() => groupTemplatesByCategory(templates), [templates]);

  if (!open) return null;

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

  const handleToggleSelfScheduled = (id: string) => {
    setProgramSlots(programSlots.map(s => s.id === id ? { ...s, selfScheduled: !s.selfScheduled } : s));
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
    if (programSlots.every(s => s.selfScheduled)) {
      alert('至少要有一個訓練日是「自動排」，班表才有東西可以輪替');
      return;
    }

    if (mode === 'edit' && startDate && startDate > toDateInputValue(Date.now())) {
      alert('開始日期不能是未來的日期');
      return;
    }

    try {
      if (mode === 'edit' && initial) {
        // 日期沒改就保留原本的時間戳（不要被改成當天 00:00）
        const startedAt = startDate && startDate !== toDateInputValue(initial.startedAt)
          ? fromDateInputValue(startDate)
          : initial.startedAt;
        await updateProgram({
          name: programName.trim(),
          slots: programSlots.map(s => {
            const { selfScheduled, ...rest } = s;
            return selfScheduled ? { ...rest, selfScheduled: true } : rest;
          }),
          startedAt,
          cycleCount: Math.max(1, Math.floor(lapNumber)) - 1,
        });
      } else {
        if (currentProgram) {
          const statusLabel = currentProgram.status === 'paused' ? '暫停中' : '進行中';
          const confirmEnd = window.confirm(
            `目前已有${statusLabel}的計畫「${currentProgram.name}」，建立新計畫將會結束它，確定嗎？`
          );
          if (!confirmEnd) return;
        }
        await createProgram(
          programName.trim(),
          programSlots.map(s => ({ label: s.label, templateId: s.templateId, selfScheduled: s.selfScheduled })),
          { min: 8, max: 12 }
        );
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      alert('儲存計畫失敗');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-[60] flex flex-col">
      <div className="bg-white dark:bg-slate-900 shrink-0">
        <SheetHeader
          title={mode === 'edit' ? '編輯訓練計畫' : '建立訓練計畫'}
          onBack={onClose}
        />
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

          {/* 開始日期／目前第幾輪（編輯時才有；計畫不限週數，一直累加） */}
          {mode === 'edit' && initial && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                進度
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 block">開始日期</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 focus:outline-none text-sm font-semibold text-slate-800 dark:text-slate-100 shadow-sm transition"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 block">目前第幾輪</span>
                  <NumberStepper
                    value={lapNumber}
                    onChange={(val) => setLapNumber(val)}
                    step={1}
                    min={1}
                    max={999}
                    decimals={0}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                「開始後第幾週」從開始日期算（暫停期間不算）。自動排的訓練日各練完一次＝一輪；課表第 1~8 輪用 W1~W8 的組數，第 9 輪起固定用 W7。
              </p>
            </div>
          )}

          {/* Slots 清單 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                循環項目 / 訓練日 (依序進行)
              </label>
              <span className="text-[10px] font-bold text-slate-400">
                共 {programSlots.length} 天（自動輪替 {programSlots.filter(s => !s.selfScheduled).length} 天）
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
                      {TEMPLATE_CATEGORIES.map((cat) => (
                        groupedTemplates[cat].length > 0 && (
                          <optgroup key={cat} label={cat}>
                            {groupedTemplates[cat].map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )
                      ))}
                    </select>
                  </div>

                  {/* 自動排／自行安排 */}
                  <label className="flex items-center gap-2 pl-6 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!slot.selfScheduled}
                      onChange={() => handleToggleSelfScheduled(slot.id)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">自行安排</span>
                    <span className="text-[10px] text-slate-400">班表不自動排、不算進一輪，要練時自己指定</span>
                  </label>
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
          </div>
        </div>
      </div>
    </div>
  );
}
