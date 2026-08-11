import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ADMIN_ROLES, AuthProvider } from '../auth/auth-provider'
import { RequireAuth } from '../auth/require-auth'
import { RequireRole } from '../auth/require-role'
import { AdminLayout } from '../layouts/admin-layout'
import { AccessDeniedPage } from '../pages/access-denied-page'
import { DashboardPage } from '../pages/dashboard-page'
import { LoginPage } from '../pages/login-page'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <DashboardPage />
                </RequireRole>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
