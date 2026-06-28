import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import WorkoutLogger from './pages/WorkoutLogger';
import History from './pages/History';
import ExerciseLibrary from './pages/ExerciseLibrary';
import Progress from './pages/Progress';
import SettingsPage from './pages/SettingsPage';
import { seedExercisesIfEmpty } from './db/exercises';
import { useActiveWorkoutStore, flushPendingSave } from './store/activeWorkout';
import { useSettingsStore } from './store/settings';

function App() {
  const initSettings = useSettingsStore((state) => state.initSettings);
  const initActiveWorkout = useActiveWorkoutStore((state) => state.initActiveWorkout);

  useEffect(() => {
    async function initializeApp() {
      try {
        // 1. Seed 動作庫
        await seedExercisesIfEmpty();
        // 2. 初始化全域設定
        await initSettings();
        // 3. 恢復進行中訓練 (草稿)
        await initActiveWorkout();
      } catch (err) {
        console.error('App initialization failed:', err);
      }
    }
    initializeApp();

    // 註冊頁面關閉或背景切換時的強制寫入 (Flush)
    const handleFlush = () => {
      flushPendingSave();
    };

    window.addEventListener('beforeunload', handleFlush);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initSettings, initActiveWorkout]);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<WorkoutLogger />} />
          <Route path="/history" element={<History />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
