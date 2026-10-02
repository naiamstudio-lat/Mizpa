import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './components/landing/Landing';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './app/AppShell';
import { APP_ROOT } from './app/workspace';
import { AuthModalProvider } from './hooks/useAuthModal';

function App() {
  return (
    <BrowserRouter>
      <AuthModalProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginPage />} />

          {/* The authenticated app is ONE screen: the site list, the agent chat
              and the preview are three columns of the workspace, not three
              routes. `/*` so an old deep link such as `/app/chat?site=x`
              lands on that same screen with its selection intact, instead of on
              a redirect that would drop the query string. */}
          <Route
            path={`${APP_ROOT}/*`}
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />

          {/* No other route is reachable. Sending everything to the app root
              means an unknown path lands on the workspace when signed in, and on
              sign-in when signed out — instead of a blank page. */}
          <Route
            path="*"
            element={
              <Navigate to={APP_ROOT} replace />
            }
          />
        </Routes>
      </AuthModalProvider>
    </BrowserRouter>
  );
}

export default App;