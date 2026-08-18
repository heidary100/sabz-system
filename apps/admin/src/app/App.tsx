import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ADMIN_ROLES, AuthProvider } from '../auth/auth-provider'
import { RequireAuth } from '../auth/require-auth'
import { RequireRole } from '../auth/require-role'
import { AdminLayout } from '../layouts/admin-layout'
import { AccessDeniedPage } from '../pages/access-denied-page'
import { DashboardPage } from '../pages/dashboard-page'
import { LoginPage } from '../pages/login-page'
import { PartnerDetailPage } from '../pages/partner-detail-page'
import { PartnersPage } from '../pages/partners-page'
import { RolesPage } from '../pages/roles-page'
import { UserDetailPage } from '../pages/user-detail-page'
import { UsersPage } from '../pages/users-page'

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
            <Route
              path="partners"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <PartnersPage />
                </RequireRole>
              }
            />
            <Route
              path="partners/:id"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <PartnerDetailPage />
                </RequireRole>
              }
            />
            <Route
              path="users"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <UsersPage />
                </RequireRole>
              }
            />
            <Route
              path="users/:id"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <UserDetailPage />
                </RequireRole>
              }
            />
            <Route
              path="roles"
              element={
                <RequireRole roles={['ADMIN']}>
                  <RolesPage />
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
