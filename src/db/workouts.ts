import { db, type Workout } from './schema';

export async function getActiveWorkout(): Promise<Workout | null> {
  const activeWorkout = await db.workouts
    .where('status')
    .equals('active')
    .and(w => !w.deletedAt)
    .first();
  return activeWorkout || null;
}

export async function saveActiveWorkout(workout: Workout): Promise<void> {
  await db.workouts.put({ ...workout, updatedAt: Date.now() });
}

export async function completeWorkout(workoutId: string): Promise<void> {
  const workout = await db.workouts.get(workoutId);
  if (workout) {
    workout.status = 'completed';
    workout.endedAt = Date.now();
    workout.updatedAt = Date.now();
    await db.workouts.put(workout);
  }
}

export async function listCompletedWorkouts(): Promise<Workout[]> {
  const list = await db.workouts
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('startedAt');
  return list.filter(w => !w.deletedAt);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const now = Date.now();
  const workout = await db.workouts.get(workoutId);
  if (!workout) return;
  await db.workouts.put({ ...workout, deletedAt: now, updatedAt: now });
}
