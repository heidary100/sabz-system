import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ADMIN_ROLES, AuthProvider } from '../auth/auth-provider'
import { RequireAuth } from '../auth/require-auth'
import { RequireRole } from '../auth/require-role'
import { AdminLayout } from '../layouts/admin-layout'
import { AccessDeniedPage } from '../pages/access-denied-page'
import { AuditPage } from '../pages/audit-page'
import { BrandsPage } from '../pages/brands-page'
import { CategoriesPage } from '../pages/categories-page'
import { DashboardPage } from '../pages/dashboard-page'
import { InventoryMovementsPage } from '../pages/inventory-movements-page'
import { InventoryPage } from '../pages/inventory-page'
import { InventoryReservationsPage } from '../pages/inventory-reservations-page'
import { LoginPage } from '../pages/login-page'
import { PartnerDetailPage } from '../pages/partner-detail-page'
import { PartnersPage } from '../pages/partners-page'
import { ProductDetailPage } from '../pages/product-detail-page'
import { ProductsPage } from '../pages/products-page'
import { RolesPage } from '../pages/roles-page'
import { UserDetailPage } from '../pages/user-detail-page'
import { UsersPage } from '../pages/users-page'
import { VariantInventoryPage } from '../pages/variant-inventory-page'
import { WarehouseInventoryPage } from '../pages/warehouse-inventory-page'
import { WarehousesPage } from '../pages/warehouses-page'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/access-denied"
            element={
              <RequireAuth>
                <AccessDeniedPage />
              </RequireAuth>
            }
          />
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
            <Route
              path="audit"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <AuditPage />
                </RequireRole>
              }
            />
            <Route
              path="products"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <ProductsPage />
                </RequireRole>
              }
            />
            <Route
              path="products/:id"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <ProductDetailPage />
                </RequireRole>
              }
            />
            <Route
              path="categories"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <CategoriesPage />
                </RequireRole>
              }
            />
            <Route
              path="brands"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <BrandsPage />
                </RequireRole>
              }
            />
            <Route
              path="warehouses"
              element={
                <RequireRole roles={['ADMIN']}>
                  <WarehousesPage />
                </RequireRole>
              }
            />
            <Route
              path="inventory"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <InventoryPage />
                </RequireRole>
              }
            />
            <Route
              path="inventory/movements"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <InventoryMovementsPage />
                </RequireRole>
              }
            />
            <Route
              path="inventory/reservations"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <InventoryReservationsPage />
                </RequireRole>
              }
            />
            <Route
              path="inventory/variants/:variantId"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <VariantInventoryPage />
                </RequireRole>
              }
            />
            <Route
              path="inventory/warehouses/:warehouseId"
              element={
                <RequireRole roles={ADMIN_ROLES}>
                  <WarehouseInventoryPage />
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
