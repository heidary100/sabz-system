import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryTreeNode } from '@sabz/types'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useCategoryTree } from '../hooks/use-category-tree'
import { translateApiError } from '../lib/error-messages'
import { countNodes, getExpandableIds } from '../lib/category-tree-utils'
import { Button } from '../components/catalyst/button'
import { Input, InputGroup } from '../components/catalyst/input'
import { Text } from '../components/catalyst/text'
import { IconButton } from '../components/ui/icon-button'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { Tooltip } from '../components/ui/tooltip'
import {
  CategoryTree,
  type CategoryReorderDrop,
} from '../components/categories/category-tree'
import { CategoryEditor } from '../components/categories/category-editor'
import { CategoryDeleteDialog } from '../components/categories/category-delete-dialog'
import { deleteCategory, reorderCategory } from '../services/categories'

const EXPANDED_STORAGE_KEY = 'sabz-admin-category-tree-expanded'

function readExpandedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((item): item is string => typeof item === 'string'))
      }
    }
  } catch {
    // best-effort persistence, ignore corrupt values
  }
  return new Set()
}

function writeExpandedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // best-effort persistence, ignore quota/private-mode failures
  }
}

interface EditorState {
  open: boolean
  category: CategoryTreeNode | null
  parentPreset: CategoryTreeNode | null
}

export function CategoriesPage() {
  const { tree, loading, error, refetch } = useCategoryTree()

  const [expandedIds, setExpandedIds] = useState<Set<string>>(readExpandedIds)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editor, setEditor] = useState<EditorState>({ open: false, category: null, parentPreset: null })
  const [deleting, setDeleting] = useState<CategoryTreeNode | null>(null)
  const [pendingTree, setPendingTree] = useState<CategoryTreeNode[] | null>(null)
  const [reordering, setReordering] = useState(false)
  const [reorderNotice, setReorderNotice] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState(0)

  useEffect(() => {
    writeExpandedIds(expandedIds)
  }, [expandedIds])

  const displayedTree = pendingTree ?? tree
  const totalNodes = useMemo(
    () => (displayedTree ? countNodes(displayedTree) : 0),
    [displayedTree],
  )

  const toggleExpanded = useCallback((id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback((): void => {
    if (!displayedTree) {
      return
    }
    setExpandedIds(getExpandableIds(displayedTree))
  }, [displayedTree])

  const collapseAll = useCallback((): void => {
    setExpandedIds(new Set())
  }, [])

  const closeEditor = useCallback((): void => {
    setEditor((current) => ({ ...current, open: false }))
  }, [])

  const openCreate = useCallback((): void => {
    setEditor({ open: true, category: null, parentPreset: null })
  }, [])

  const openAddChild = useCallback((category: CategoryTreeNode): void => {
    setEditor({ open: true, category: null, parentPreset: category })
  }, [])

  const openEdit = useCallback((category: CategoryTreeNode): void => {
    setEditor({ open: true, category, parentPreset: null })
  }, [])

  const handleEditorSuccess = useCallback((): void => {
    closeEditor()
    void refetch()
    if (editor.parentPreset) {
      setExpandedIds((current) => new Set(current).add(editor.parentPreset!.id))
    }
  }, [closeEditor, refetch, editor.parentPreset])

  const handleReorder = useCallback(
    async (drop: CategoryReorderDrop): Promise<void> => {
      setPendingTree(drop.nextTree)
      setReordering(true)
      setReorderNotice(null)
      try {
        await reorderCategory(drop.id, {
          parentId: drop.parentId,
          position: drop.position,
        })
        await refetch()
        setPendingTree(null)
      } catch (error) {
        setPendingTree(null)
        setReorderNotice(translateApiError(error))
      } finally {
        setReordering(false)
      }
    },
    [refetch],
  )

  const handleDeleteConfirm = useCallback(async (): Promise<void> => {
    if (!deleting) {
      return
    }
    await deleteCategory(deleting.id)
    if (selectedId === deleting.id) {
      setSelectedId(null)
    }
    await refetch()
  }, [deleting, selectedId, refetch])

  const searching = searchQuery.trim().length > 0
  const refetchNotice =
    error !== null && displayedTree !== null ? translateApiError(error) : null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="دسته بندیها"
        subtitle="سلسله مراتب کاتالوگ خود را سازماندهی کنید؛ دسته ها را بکشید تا مرتب شوند."
        actions={
          <>
            <InputGroup className="w-full sm:w-72">
              <Search data-slot="icon" aria-hidden="true" />
              <Input
                type="text"
                inputMode="search"
                placeholder="جستجوی دسته بندی…"
                aria-label="جستجوی دسته بندی"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searching && (
                <IconButton
                  label="پاک کردن جستجو"
                  outline
                  className="absolute end-1 top-1 size-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </IconButton>
              )}
            </InputGroup>
            <Tooltip label="باز کردن همه">
              <IconButton label="باز کردن همه" onClick={expandAll} disabled={!displayedTree}>
                <ChevronsUpDown className="size-4" aria-hidden="true" />
              </IconButton>
            </Tooltip>
            <Tooltip label="جمع کردن همه">
              <IconButton label="جمع کردن همه" onClick={collapseAll} disabled={!displayedTree}>
                <ChevronsDownUp className="size-4" aria-hidden="true" />
              </IconButton>
            </Tooltip>
            <Button color="primary" onClick={openCreate}>
              <Plus data-slot="icon" /> افزودن دسته بندی
            </Button>
          </>
        }
      />

      {reorderNotice && (
        <div className="danger-box flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm/6">
          <span>{reorderNotice}</span>
        </div>
      )}

      {refetchNotice && (
        <div className="danger-box flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm/6">
          <span>{refetchNotice}</span>
          <Button color="red" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      )}

      {loading && !displayedTree ? (
        <div className="glass flex items-center justify-center rounded-2xl px-6 py-24">
          <Loading compact label="در حال بارگذاری درخت…" />
        </div>
      ) : error && !displayedTree ? (
        <div className="glass flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !displayedTree || displayedTree.length === 0 ? (
        <div className="glass relative overflow-hidden rounded-2xl px-6 py-20 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-primary-border bg-primary-subtle shadow-[0_8px_24px_-12px_rgb(53_112_63/0.4)]">
            <FolderTree className="size-8 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-lg/7 font-semibold text-foreground">
            هنوز دسته بندیای وجود ندارد
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm/6 text-muted">
            نخستین دسته بندی محصول خود را بسازید تا کاتالوگتان سامان بگیرد؛ سپس
            میتوانید زیردسته ها را اضافه کنید و ترتیب آنها را با کشیدن و رها کردن
            تغییر دهید.
          </p>
          <div className="mt-6 flex justify-center">
            <Button color="primary" onClick={openCreate}>
              <Plus data-slot="icon" /> افزودن دسته بندی
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="glass rounded-2xl p-2 shadow-inner sm:p-3">
            <div className="rounded-xl border border-border bg-surface/60 p-1.5 sm:p-2">
              <CategoryTree
                tree={displayedTree}
                expandedIds={expandedIds}
                onToggleExpanded={toggleExpanded}
                selectedId={selectedId}
                onSelect={setSelectedId}
                searchQuery={searchQuery}
                onMatchCountChange={setMatchCount}
                onAddChild={openAddChild}
                onEdit={openEdit}
                onDelete={setDeleting}
                onReorder={(drop) => void handleReorder(drop)}
                reordering={reordering}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text className="text-xs text-muted">
              {searching
                ? `نتیجه جستجو: ${matchCount} دسته بندی`
                : `مجموع: ${totalNodes} دسته بندی · برای مرتبسازی، دسته ها را بکشید`}
            </Text>
            {reordering && (
              <span className="flex items-center gap-2 text-xs font-medium text-muted" role="status">
                <span
                  aria-hidden="true"
                  className="size-3 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
                />
                در حال ذخیره ترتیب…
              </span>
            )}
          </div>
        </>
      )}

      <CategoryEditor
        open={editor.open}
        category={editor.category}
        parentPreset={editor.parentPreset}
        tree={displayedTree ?? []}
        onClose={closeEditor}
        onSuccess={handleEditorSuccess}
      />

      <CategoryDeleteDialog
        category={deleting}
        tree={displayedTree ?? []}
        onClose={() => setDeleting(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}