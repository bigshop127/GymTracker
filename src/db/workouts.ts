import { db, type Workout } from './schema';

export async function getActiveWorkout(): Promise<Workout | null> {
  const activeWorkout = await db.workouts
    .where('status')
    .equals('active')
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
  return db.workouts
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('startedAt');
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await db.workouts.delete(workoutId);
}
