import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../layouts/admin-layout'
import { DashboardPage } from '../pages/dashboard-page'
import { LoginPage } from '../pages/login-page'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
