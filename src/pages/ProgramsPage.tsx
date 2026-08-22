import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '../store/program';
import { listTemplates } from '../db/templates';
import { type WorkoutTemplate, type TrainingProgram } from '../db/schema';
import { getElapsedWeeks, getPausedDays } from '../lib/programLifecycle';
import ProgramFormSheet from '../components/ProgramFormSheet';

export default function ProgramsPage() {
  const navigate = useNavigate();
  const {
    currentProgram,
    archivedPrograms,
    initProgram,
    pause,
    resume,
    restart,
    finish,
    reactivate,
    removeProgram,
  } = useProgramStore();

  const [now, setNow] = useState(() => Date.now());
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [finishTarget, setFinishTarget] = useState<TrainingProgram | null>(null);

  useEffect(() => {
    initProgram();
    listTemplates().then(setTemplates).catch((err) => console.error('Failed to load templates:', err));
  }, [initProgram]);

  useEffect(() => {
    const handleUpdateNow = () => setNow(Date.now());
    window.addEventListener('focus', handleUpdateNow);
    document.addEventListener('visibilitychange', handleUpdateNow);
    return () => {
      window.removeEventListener('focus', handleUpdateNow);
      document.removeEventListener('visibilitychange', handleUpdateNow);
    };
  }, []);

  const handleOpenCreate = () => {
    setFormMode('create');
    setIsFormOpen(true);
  };

  const handleOpenEdit = () => {
    setFormMode('edit');
    setIsFormOpen(true);
  };

  const handleRestart = async () => {
    if (!currentProgram) return;
    const weeks = getElapsedWeeks(currentProgram, now).toFixed(1);
    const runNumber = currentProgram.runNumber ?? 1;
    const confirmed = window.confirm(
      `確定要從頭開始嗎？\n目前的「${currentProgram.name}」（第 ${runNumber} 次，已進行 ${weeks} 週）會標記為已中止並存進封存，同時建立一份全新的「${currentProgram.name}」（第 ${runNumber + 1} 次）從第 1 輪開始。\n\n已完成的訓練紀錄不會被刪除。`
    );
    if (!confirmed) return;
    await restart();
  };

  const handleFinishReason = async (reason: 'completed' | 'abandoned') => {
    setFinishTarget(null);
    await finish(reason);
  };

  const handleReactivate = async (program: TrainingProgram) => {
    if (currentProgram) {
      const statusLabel = currentProgram.status === 'paused' ? '暫停中' : '進行中';
      const confirmed = window.confirm(
        `目前${statusLabel}的「${currentProgram.name}」會標記為已中止並封存，確定嗎？`
      );
      if (!confirmed) return;
    }
    await reactivate(program.id);
  };

  const handleRemove = async (program: TrainingProgram) => {
    const confirmed = window.confirm(
      `確定要永久刪除「${program.name}」嗎？不會刪除訓練紀錄與範本。`
    );
    if (!confirmed) return;
    await removeProgram(program.id);
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 pb-20">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">訓練計畫</h2>

      {/* 目前計畫區 */}
      {currentProgram ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base leading-tight">
                  {currentProgram.name}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentProgram.status === 'paused'
                      ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                      : 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                  }`}
                >
                  {currentProgram.status === 'paused' ? '暫停中' : '進行中'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-bold tracking-wide">
                第 {currentProgram.runNumber ?? 1} 次 • 第 {currentProgram.cycleCount + 1} 輪 • 已進行 {getElapsedWeeks(currentProgram, now).toFixed(1)} 週（預估 {currentProgram.estimatedWeeks.min}-{currentProgram.estimatedWeeks.max} 週）
              </p>
              {currentProgram.status === 'paused' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                  已暫停 {getPausedDays(currentProgram, now)} 天
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleOpenEdit}
              className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => (currentProgram.status === 'paused' ? resume() : pause())}
              className="py-2.5 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              {currentProgram.status === 'paused' ? '繼續計畫' : '暫停'}
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="py-2.5 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              重新開始
            </button>
            <button
              type="button"
              onClick={() => setFinishTarget(currentProgram)}
              className="py-2.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              終止
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm text-center space-y-3">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            還沒有進行中的訓練計畫
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold rounded-xl shadow transition cursor-pointer"
          >
            ＋ 建立訓練計畫
          </button>
          <button
            type="button"
            onClick={() => navigate('/plan')}
            className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold rounded-xl transition cursor-pointer"
          >
            前往課表匯入
          </button>
        </div>
      )}

      {/* 終止：兩段確認小面板 */}
      {finishTarget && (
        <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-[60] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setFinishTarget(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              終止「{finishTarget.name}」——要標記成哪一種？
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleFinishReason('completed')}
                className="py-3 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                已完成（跑完了）
              </button>
              <button
                type="button"
                onClick={() => handleFinishReason('abandoned')}
                className="py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                已中止（不練了）
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFinishTarget(null)}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 封存清單區 */}
      {archivedPrograms.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            封存的計畫（{archivedPrograms.length}）
          </h3>
          <div className="space-y-2.5">
            {archivedPrograms.map((p) => {
              const start = new Date(p.startedAt);
              const end = p.completedAt ? new Date(p.completedAt) : null;
              const fmt = (d: Date) => `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 shadow-sm space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{p.name}</span>
                    <span className="text-[10px] font-bold text-slate-400">第 {p.runNumber ?? 1} 次</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === 'completed'
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {p.status === 'completed' ? '已完成' : '已中止'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {fmt(start)} – {end ? fmt(end) : '—'} • 共 {p.cycleCount} 輪
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleReactivate(p)}
                      className="flex-1 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold rounded-lg transition cursor-pointer"
                    >
                      重新啟用
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(p)}
                      className="flex-1 py-1.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg transition cursor-pointer"
                    >
                      永久刪除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ProgramFormSheet
        open={isFormOpen}
        mode={formMode}
        initial={currentProgram}
        templates={templates}
        onClose={() => setIsFormOpen(false)}
      />
    </div>
  );
}
