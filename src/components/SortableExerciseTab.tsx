import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Exercise, type WorkoutEntry } from '../db/schema';

interface SortableExerciseTabProps {
  entry: WorkoutEntry;
  exercise: Exercise | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

// 訓練頁頂部的動作分頁：可以按住不放（150ms）後左右拖曳換順序，
// 快速點擊／滑動瀏覽則維持原本行為不受影響（見 useSensor 的 activationConstraint）。
export default function SortableExerciseTab({ entry, exercise, isSelected, onSelect }: SortableExerciseTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  const hasAlt = entry.candidateExerciseIds && entry.candidateExerciseIds.length > 1;
  const totalSets = entry.sets.length;
  const completedSets = entry.sets.filter((s) => s.completed).length;
  const isAllCompleted = totalSets > 0 && completedSets === totalSets;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`shrink-0 px-3 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition select-none cursor-pointer ${
        isSelected
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
      } ${isDragging ? 'shadow-lg ring-2 ring-indigo-400 dark:ring-indigo-500' : ''}`}
    >
      <span className={exercise ? '' : 'text-amber-600 dark:text-amber-500'}>
        {exercise ? exercise.name : '⚠ 未知動作'}
      </span>
      {hasAlt && <span className="opacity-75">⇄</span>}
      {totalSets > 0 && (
        isAllCompleted ? (
          <span className="text-emerald-500 font-bold">●</span>
        ) : (
          <span className={`text-[10px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
            {completedSets}/{totalSets}
          </span>
        )
      )}
    </button>
  );
}
