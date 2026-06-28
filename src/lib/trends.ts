import { type Workout } from '../db/schema';
import { calculateE1rm } from './e1rm';

export type TrendMetric = 'e1rm' | 'maxWeight' | 'volume';

export interface TrendPoint {
  date: number; // startedAt
  value: number; // raw value in kg (for e1rm, maxWeight, and volume)
}

/**
 * Calculates trend points for a specific exercise from a list of completed workouts.
 * Returns points sorted chronologically (ascending by startedAt).
 */
export function calculateTrendPoints(
  workouts: Workout[],
  exerciseId: string,
  metric: TrendMetric,
  e1rmFormula: 'epley' | 'brzycki'
): TrendPoint[] {
  const points: TrendPoint[] = [];

  // Filter workouts that have the exercise and sort chronologically
  const sortedWorkouts = [...workouts]
    .filter(w => w.status === 'completed')
    .sort((a, b) => a.startedAt - b.startedAt);

  for (const workout of sortedWorkouts) {
    const entries = workout.entries.filter(e => e.exerciseId === exerciseId);
    if (entries.length === 0) continue;

    const validSets = entries.flatMap(entry =>
      entry.sets.filter(s => s.completed && !s.isWarmup)
    );

    if (validSets.length === 0) continue;

    let value = 0;

    if (metric === 'e1rm') {
      const e1rms = validSets.map(s => calculateE1rm(s.weight, s.reps, e1rmFormula));
      value = Math.max(...e1rms, 0);
    } else if (metric === 'maxWeight') {
      const weights = validSets.map(s => s.weight);
      value = Math.max(...weights, 0);
    } else if (metric === 'volume') {
      value = validSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    }

    points.push({
      date: workout.startedAt,
      value
    });
  }

  return points;
}
