import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import WorkoutLogger from './pages/WorkoutLogger';
import History from './pages/History';
import ExerciseLibrary from './pages/ExerciseLibrary';
import Progress from './pages/Progress';
import SettingsPage from './pages/SettingsPage';

function App() {
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
