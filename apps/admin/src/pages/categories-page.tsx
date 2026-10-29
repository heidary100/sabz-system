import { CategoryManager } from '../components/categories/category-manager'

/**
 * Category Management page (SS-255 revision): the entire experience lives in
 * the shared CategoryManager component so the product form can embed the
 * exact same interactions in a compact variant. This page is a thin wrapper.
 */
export function CategoriesPage() {
  return <CategoryManager variant="page" />
}
