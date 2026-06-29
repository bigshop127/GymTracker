import { type Workout } from '../db/schema';
import { calculateE1rm } from './e1rm';

export type TrendMetric = 'e1rm' | 'maxWeight' | 'volume' | 'cardioMinutes';

export interface TrendPoint {
  date: number; // startedAt
  value: number;
}

export function calculateTrendPoints(
  workouts: Workout[],
  exerciseId: string,
  metric: TrendMetric,
  e1rmFormula: 'epley' | 'brzycki'
): TrendPoint[] {
  const points: TrendPoint[] = [];

  const sortedWorkouts = [...workouts]
    .filter(w => w.status === 'completed')
    .sort((a, b) => a.startedAt - b.startedAt);

  for (const workout of sortedWorkouts) {
    const entries = workout.entries.filter(e => e.exerciseId === exerciseId);
    if (entries.length === 0) continue;

    const allSets = entries.flatMap(entry => entry.sets);
    const completedSets = allSets.filter(s => s.completed);

    if (metric === 'cardioMinutes') {
      const totalSeconds = completedSets.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
      if (totalSeconds <= 0) continue;
      points.push({ date: workout.startedAt, value: Math.round(totalSeconds / 60) });
      continue;
    }

    const validSets = completedSets.filter(s => !s.isWarmup);
    if (validSets.length === 0) continue;

    let value = 0;
    if (metric === 'e1rm') {
      const e1rms = validSets.map(s => calculateE1rm(s.weight, s.reps, e1rmFormula));
      value = Math.max(...e1rms, 0);
    } else if (metric === 'maxWeight') {
      value = Math.max(...validSets.map(s => s.weight), 0);
    } else if (metric === 'volume') {
      value = validSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    }

    points.push({ date: workout.startedAt, value });
  }

  return points;
}
