import { useEffect, useState, useMemo } from 'react';
import { type Exercise, type MuscleGroup, type Equipment } from '../db/schema';
import { listExercises, addExercise, updateExercise, deleteExercise } from '../db/exercises';
import { getExerciseImages } from '../data/exercise-images';
import { getMuscleIcon } from '../data/muscle-icons';

const MUSCLE_GROUPS: MuscleGroup[] = ['有氧', '胸', '背', '腿臀', '肩', '手臂', '核心', '全身'];
const EQUIPMENTS: Equipment[] = ['槓鈴', '啞鈴', '機械', '纜繩', '徒手', '壺鈴', '其他'];

interface ExerciseListProps {
  mode: 'manage' | 'select';
  onSelect?: (exercise: Exercise) => void;
}

// ── 縮圖（列表模式用）────────────────────────────────────────────
interface ExerciseThumbProps {
  exerciseName: string;
  muscleGroup: MuscleGroup;
  size?: 'md' | 'lg';
}

function ExerciseThumb({ exerciseName, muscleGroup, size = 'md' }: ExerciseThumbProps) {
  const [imgError, setImgError] = useState(false);
  const images = getExerciseImages(exerciseName);
  const hasImage = images.length > 0;
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const iconDim = size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';

  const renderFallback = () => {
    const markup = getMuscleIcon(muscleGroup);
    return (
      <div className={`${dim} shrink-0 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-center`}>
        {markup ? (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={iconDim}
            style={{ color: '#6366f1' }}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        ) : (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
            {muscleGroup}
          </span>
        )}
      </div>
    );
  };

  if (!hasImage || imgError) return renderFallback();

  return (
    <img
      src={images[0]}
      alt={exerciseName}
      loading="lazy"
      onError={() => setImgError(true)}
      className={`${dim} shrink-0 object-cover rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-800`}
    />
  );
}

// ── 網格卡片（select 模式 grid 用）──────────────────────────────
interface ExerciseGridCardProps {
  ex: Exercise;
  onSelect: (ex: Exercise) => void;
}

function ExerciseGridCard({ ex, onSelect }: ExerciseGridCardProps) {
  const [imgError, setImgError] = useState(false);
  const images = getExerciseImages(ex.name);
  const hasImage = images.length > 0 && !imgError;
  const markup = getMuscleIcon(ex.muscleGroup);

  return (
    <div
      onClick={() => onSelect(ex)}
      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md cursor-pointer transition duration-200 active:scale-95"
    >
      <div className="aspect-square w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {hasImage ? (
          <img
            src={images[0]}
            alt={ex.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {markup ? (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-12 h-12"
                style={{ color: '#6366f1' }}
                dangerouslySetInnerHTML={{ __html: markup }}
              />
            ) : (
              <span className="text-sm font-bold text-slate-400 dark:text-slate-600">{ex.muscleGroup}</span>
            )}
          </div>
        )}
      </div>
      <div className="p-2 space-y-1">
        <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 leading-tight line-clamp-2">{ex.name}</p>
        <div className="flex gap-1 flex-wrap">
          <span className="text-[9px] bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold px-1.5 py-0.5 rounded">
            {ex.muscleGroup}
          </span>
          <span className="text-[9px] bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold px-1.5 py-0.5 rounded">
            {ex.equipment}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 管理網格卡片 ─────────────────────────────────────────────────
interface ManageGridCardProps {
  ex: Exercise;
  onTap: (ex: Exercise) => void;
}

function ManageGridCard({ ex, onTap }: ManageGridCardProps) {
  const [imgError, setImgError] = useState(false);
  const images = getExerciseImages(ex.name);
  const hasImage = images.length > 0 && !imgError;
  const markup = getMuscleIcon(ex.muscleGroup);

  return (
    <div
      onClick={() => onTap(ex)}
      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md cursor-pointer transition duration-200 active:scale-95"
    >
      <div className="aspect-square w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {hasImage ? (
          <img
            src={images[0]}
            alt={ex.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {markup ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12" style={{ color: '#6366f1' }} dangerouslySetInnerHTML={{ __html: markup }} />
            ) : (
              <span className="text-sm font-bold text-slate-400 dark:text-slate-600">{ex.muscleGroup}</span>
            )}
          </div>
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-start gap-1">
          <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 flex-1">{ex.name}</p>
          {ex.isCustom && (
            <span className="text-[8px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded border border-amber-100 dark:border-amber-900/40 shrink-0">
              自訂
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          <span className="text-[9px] bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold px-1.5 py-0.5 rounded">
            {ex.muscleGroup}
          </span>
          <span className="text-[9px] bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold px-1.5 py-0.5 rounded">
            {ex.equipment}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 主元件 ───────────────────────────────────────────────────────
export default function ExerciseList({ mode, onSelect }: ExerciseListProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | '全部'>('全部');
  const [detailEx, setDetailEx] = useState<Exercise | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Form State for Add / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [formName, setFormName] = useState('');
  const [formMuscle, setFormMuscle] = useState<MuscleGroup>('胸');
  const [formEquipment, setFormEquipment] = useState<Equipment>('槓鈴');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  const refreshExercises = async () => {
    try {
      const list = await listExercises();
      setExercises(list);
    } catch (err) {
      console.error('Failed to load exercises:', err);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { refreshExercises(); }, 0);
    return () => clearTimeout(t);
  }, []);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
      const matchesMuscle = selectedMuscle === '全部' || ex.muscleGroup === selectedMuscle;
      return matchesSearch && matchesMuscle;
    });
  }, [exercises, search, selectedMuscle]);

  const handleOpenAdd = () => {
    setEditingExercise(null);
    setFormName('');
    setFormMuscle('胸');
    setFormEquipment('槓鈴');
    setFormNotes('');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, ex: Exercise) => {
    e.stopPropagation();
    setEditingExercise(ex);
    setFormName(ex.name);
    setFormMuscle(ex.muscleGroup);
    setFormEquipment(ex.equipment);
    setFormNotes(ex.notes || '');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('請輸入動作名稱');
      return;
    }
    try {
      if (editingExercise) {
        await updateExercise(editingExercise.id, {
          name: formName.trim(),
          muscleGroup: formMuscle,
          equipment: formEquipment,
          notes: formNotes.trim() || undefined,
        });
      } else {
        await addExercise({
          name: formName.trim(),
          muscleGroup: formMuscle,
          equipment: formEquipment,
          notes: formNotes.trim() || undefined,
        });
      }
      setIsFormOpen(false);
      refreshExercises();
    } catch (err) {
      console.error(err);
      setFormError('儲存失敗，請重試');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('確定要刪除此自訂動作嗎？')) return;
    try {
      await deleteExercise(id);
      refreshExercises();
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    }
  };

  return (
    <div className="space-y-4">
      {/* 搜尋與篩選 */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 hover:bg-slate-200/70 dark:hover:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 pl-10 pr-4 py-2.5 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none text-sm transition-all shadow-inner"
            placeholder="搜尋動作名稱 (e.g. 臥推)..."
          />
          <div className="absolute left-3.5 top-3 text-slate-400">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
            </svg>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none -mx-4 px-4">
          <button
            onClick={() => setSelectedMuscle('全部')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition duration-200 ${
              selectedMuscle === '全部'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            全部
          </button>
          {MUSCLE_GROUPS.map((muscle) => (
            <button
              key={muscle}
              onClick={() => setSelectedMuscle(muscle)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition duration-200 ${
                selectedMuscle === muscle
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none'
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
              }`}
            >
              {muscle}
            </button>
          ))}
        </div>
      </div>

      {/* 視圖切換（select 模式）+ 新增按鈕（manage 模式）*/}
      <div className="flex items-center justify-between gap-2">
        {mode === 'manage' && (
          <button
            onClick={handleOpenAdd}
            className="flex-1 py-2.5 px-4 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:text-indigo-800 font-bold text-xs rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/30 flex items-center justify-center gap-1.5 transition"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
            </svg>
            新增自訂動作
          </button>
        )}

        {mode === 'select' && (
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="ml-auto p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={viewMode === 'grid' ? '切換至列表模式' : '切換至網格模式'}
          >
            {viewMode === 'grid' ? (
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
            ) : (
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* 動作列表 / 網格 */}
      {filteredExercises.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">找不到符合條件的動作</div>
      ) : mode === 'manage' ? (
        // ── Manage Grid ──
        <div className="grid grid-cols-2 gap-3">
          {filteredExercises.map((ex) => (
            <ManageGridCard key={ex.id} ex={ex} onTap={setDetailEx} />
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        // ── Select Grid ──
        <div className="grid grid-cols-2 gap-3">
          {filteredExercises.map((ex) => (
            <ExerciseGridCard key={ex.id} ex={ex} onSelect={onSelect!} />
          ))}
        </div>
      ) : (
        // ── Select List ──
        <div className="space-y-2">
          {filteredExercises.map((ex) => (
            <div
              key={ex.id}
              onClick={() => onSelect?.(ex)}
              className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm hover:border-indigo-500 hover:shadow-md cursor-pointer transition duration-200"
            >
              <div className="p-3.5 flex justify-between items-center gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ExerciseThumb exerciseName={ex.name} muscleGroup={ex.muscleGroup} size="md" />
                  <div className="space-y-1.5 min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{ex.name}</span>
                    <div className="flex gap-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 font-semibold px-2 py-0.5 rounded shrink-0">{ex.muscleGroup}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 font-semibold px-2 py-0.5 rounded shrink-0">{ex.equipment}</span>
                    </div>
                  </div>
                </div>
                <div className="text-slate-300 dark:text-slate-700">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage 詳情 Modal */}
      {mode === 'manage' && detailEx && (() => {
        const imgs = getExerciseImages(detailEx.name);
        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
            <div className="fixed inset-0" onClick={() => setDetailEx(null)} />
            <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{detailEx.name}</h3>
                  <div className="flex gap-1">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold px-2 py-0.5 rounded">{detailEx.muscleGroup}</span>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold px-2 py-0.5 rounded">{detailEx.equipment}</span>
                  </div>
                </div>
                <button onClick={() => setDetailEx(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {imgs.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {([{ url: imgs[0], label: '起始' }, { url: imgs[1], label: '結束' }] as const).map(({ url, label }) => url && (
                    <figure key={label} className="space-y-1">
                      <img
                        src={url}
                        alt={`${detailEx.name} ${label}`}
                        loading="lazy"
                        onError={(e) => { const fig = e.currentTarget.closest('figure'); if (fig) (fig as HTMLElement).style.display = 'none'; }}
                        className="w-full aspect-square object-cover rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-800"
                      />
                      <figcaption className="text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">{label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {detailEx.notes ? (
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{detailEx.notes}</p>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">無備註說明</p>
              )}

              {detailEx.isCustom && (
                <div className="flex gap-2 justify-end pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={(e) => { setDetailEx(null); handleOpenEdit(e, detailEx); }}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition"
                  >
                    編輯動作
                  </button>
                  <button
                    onClick={async (e) => { await handleDelete(e, detailEx.id); setDetailEx(null); }}
                    className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-lg border border-rose-100 dark:border-rose-900/40 transition"
                  >
                    刪除動作
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 新增 / 編輯動作 Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setIsFormOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                {editingExercise ? '編輯自訂動作' : '新增自訂動作'}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 px-3 py-2 rounded-lg">
                  ⚠️ {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">動作名稱</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-slate-50/50 dark:bg-slate-950/30 text-slate-800 dark:text-slate-100"
                  placeholder="例如：啞鈴上斜飛鳥"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">主要訓練肌群</label>
                  <select
                    value={formMuscle}
                    onChange={(e) => setFormMuscle(e.target.value as MuscleGroup)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-950 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  >
                    {MUSCLE_GROUPS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">所需訓練器材</label>
                  <select
                    value={formEquipment}
                    onChange={(e) => setFormEquipment(e.target.value as Equipment)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-950 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  >
                    {EQUIPMENTS.map((eq) => (
                      <option key={eq} value={eq}>{eq}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">動作備註 (選填)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-slate-50/50 dark:bg-slate-950/30 text-slate-800 dark:text-slate-100 resize-none"
                  placeholder="輸入動作要點或調整設定，例如：座椅高度調至第 3 格..."
                  rows={3}
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-sm shadow-md transition"
              >
                {editingExercise ? '儲存修改' : '確認新增'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
