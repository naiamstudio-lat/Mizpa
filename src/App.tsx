import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './components/landing';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { PlaygroundPage } from './components/playground/PlaygroundPage';
import { MizpaLab } from './components/playground/MizpaLab';
import { AuthModalProvider } from './hooks/useAuthModal';

function App() {
  return (
    <BrowserRouter>
      <AuthModalProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginPage />} />
          
          {/* Main app routes - app/<org>/... */}
          <Route
            path="/app/:org/*"
            element={
              <ProtectedRoute>
                <MizpaLab />
              </ProtectedRoute>
            }
          />
          
          {/* Legacy routes - redirect to app */}
          <Route
            path="/playground"
            element={
              <ProtectedRoute>
                <PlaygroundPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthModalProvider>
    </BrowserRouter>
  );
}

export default App;
