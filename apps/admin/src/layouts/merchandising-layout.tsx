import { Outlet } from 'react-router-dom'
import { MerchTabs } from '../components/merchandising/merch-tabs'

/**
 * Shared shell for the merchandising area. The route-level RequireRole guard
 * covers every nested page; this layout only provides the secondary tabs.
 */
export function MerchandisingLayout() {
  return (
    <div className="w-full space-y-5">
      <MerchTabs />
      <Outlet />
    </div>
  )
}
