import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryDetail, CategoryTreeNode } from '@sabz/types'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useCategoryTree } from '../../hooks/use-category-tree'
import { translateApiError } from '../../lib/error-messages'
import { countNodes, getExpandableIds, lookupNode } from '../../lib/category-tree-utils'
import { Button } from '../catalyst/button'
import { Input, InputGroup } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { IconButton } from '../ui/icon-button'
import { Loading } from '../ui/loading'
import { PageHeader } from '../ui/page-header'
import { Tooltip } from '../ui/tooltip'
import {
  CategoryTree,
  type CategoryReorderDrop,
} from './category-tree'
import { CategoryEditor } from './category-editor'
import { CategoryDeleteDialog } from './category-delete-dialog'
import { deleteCategory, reorderCategory } from '../../services/categories'

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

/**
 * The canonical category-management experience (SS-255 revision): the exact
 * interface of the Category Management page — search, expand/collapse,
 * drag-and-drop reordering + reparenting, per-row create-child/edit/delete,
 * the editor and delete dialogs, optimistic reorder with error recovery —
 * extracted so the product form can embed the SAME component.
 *
 * - `variant="page"` renders the standalone page (PageHeader included),
 *   byte-for-byte the previous behaviour.
 * - `variant="compact"` trims padding/framing for embedding inside a form
 *   section. Compact is presentation only — every interaction is kept.
 *
 * When `selectedId`/`onSelect` are provided (embedded mode), clicking a row
 * assigns that category to the host entity (stable node id, survives
 * rename/move/reorder); otherwise clicking rows keeps the page's highlight
 * behaviour. `onCreated` fires after the editor dialog creates a category so
 * the host can adopt it.
 */
export function CategoryManager({
  variant = 'page',
  selectedId: controlledSelectedId,
  onSelect,
  onCreated,
}: {
  variant?: 'page' | 'compact'
  /** Controlled assignment (embedded mode); row clicks report the node id. */
  selectedId?: string | null
  onSelect?: (id: string) => void
  onCreated?: (created: CategoryDetail) => void
}) {
  const compact = variant === 'compact'
  const { tree, loading, error, refetch } = useCategoryTree()

  const [expandedIds, setExpandedIds] = useState<Set<string>>(readExpandedIds)
  const [highlightId, setHighlightId] = useState<string | null>(null)
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

  // Embedded mode: the host owns the selection (stable id); page mode keeps
  // the previous highlight-only behaviour.
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : highlightId
  const handleSelect = useCallback(
    (id: string): void => {
      if (onSelect) {
        onSelect(id)
      } else {
        setHighlightId(id)
      }
    },
    [onSelect],
  )

  const displayedTree = pendingTree ?? tree
  const totalNodes = useMemo(
    () => (displayedTree ? countNodes(displayedTree) : 0),
    [displayedTree],
  )

  const selectedNode = useMemo(() => {
    if (!displayedTree || selectedId === null) {
      return null
    }
    return lookupNode(displayedTree, selectedId)?.node ?? null
  }, [displayedTree, selectedId])

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

  const handleEditorSuccess = useCallback(
    (result: CategoryDetail, mode: 'create' | 'edit'): void => {
      closeEditor()
      void refetch()
      if (editor.parentPreset) {
        setExpandedIds((current) => new Set(current).add(editor.parentPreset!.id))
      }
      if (mode === 'create') {
        onCreated?.(result)
      }
    },
    [closeEditor, refetch, editor.parentPreset, onCreated],
  )

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
      if (onSelect) {
        onSelect('')
      } else {
        setHighlightId(null)
      }
    }
    await refetch()
  }, [deleting, selectedId, refetch, onSelect])

  const searching = searchQuery.trim().length > 0
  const refetchNotice =
    error !== null && displayedTree !== null ? translateApiError(error) : null

  const toolbar = (
    <>
      <InputGroup className={compact ? 'w-full sm:w-56' : 'w-full sm:w-72'}>
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
  )

  const treePanel = (
    <>
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
        <div className={compact ? 'surface-card flex items-center justify-center rounded-xl px-6 py-10' : 'surface-card flex items-center justify-center rounded-2xl px-6 py-24'}>
          <Loading compact label="در حال بارگذاری درخت…" />
        </div>
      ) : error && !displayedTree ? (
        <div className={compact ? 'surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-8 text-center' : 'surface-card flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center'}>
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !displayedTree || displayedTree.length === 0 ? (
        <div className={compact ? 'surface-card relative overflow-hidden rounded-xl px-4 py-8 text-center' : 'surface-card relative overflow-hidden rounded-2xl px-6 py-20 text-center'}>
          <div className={compact ? 'mx-auto mb-4 flex size-10 items-center justify-center rounded-xl border border-primary-border bg-primary-subtle shadow-[0_8px_24px_-12px_rgb(53_112_63/0.4)]' : 'mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-primary-border bg-primary-subtle shadow-[0_8px_24px_-12px_rgb(53_112_63/0.4)]'}>
            <FolderTree className={compact ? 'size-5 text-primary' : 'size-8 text-primary'} aria-hidden="true" />
          </div>
          <h2 className={compact ? 'text-sm/6 font-semibold text-foreground' : 'text-lg/7 font-semibold text-foreground'}>
            هنوز دسته بندیای وجود ندارد
          </h2>
          {!compact && (
            <p className="mx-auto mt-2 max-w-md text-sm/6 text-muted">
              نخستین دسته بندی محصول خود را بسازید تا کاتالوگتان سامان بگیرد؛ سپس
              میتوانید زیردسته ها را اضافه کنید و ترتیب آنها را با کشیدن و رها کردن
              تغییر دهید.
            </p>
          )}
          <div className="mt-4 flex justify-center">
            <Button color="primary" onClick={openCreate}>
              <Plus data-slot="icon" /> افزودن دسته بندی
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={compact ? 'surface-card rounded-xl p-1.5' : 'surface-card rounded-2xl p-2 sm:p-3'}>
            <div className={compact ? 'rounded-lg border border-border bg-surface/60 p-1' : 'rounded-xl border border-border bg-surface/60 p-1.5 sm:p-2'}>
              <CategoryTree
                tree={displayedTree}
                expandedIds={expandedIds}
                onToggleExpanded={toggleExpanded}
                selectedId={selectedId}
                onSelect={handleSelect}
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
    </>
  )

  if (compact) {
    // lookupNode().path is ANCESTORS-ONLY (category-editor convention) — the
    // assignment banner must append the node itself for the full path.
    const selectedPath =
      selectedNode !== null
        ? [
            ...lookupNode(displayedTree ?? [], selectedNode.id)!.path.map((node) => node.name),
            selectedNode.name,
          ].join(' ← ')
        : null
    return (
      <div className="space-y-3">
        {onSelect && (
          <div
            className={
              'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm/6 ' +
              (selectedNode
                ? 'border-primary-border bg-primary-subtle/50 text-foreground'
                : 'border-dashed border-border text-muted')
            }
          >
            {selectedNode ? (
              <>
                <span className="font-medium">دسته منتخب:</span>
                <span className="truncate">{selectedPath ?? selectedNode.name}</span>
                <span className="text-xs text-muted">
                  (پایدار با شناسه؛ تغییر نام یا جابهجایی، انتخاب را پاک نمیکند)
                </span>
              </>
            ) : (
              <span>
                هنوز دسته‌ای انتخاب نشده — روی یک دسته کلیک کنید تا به محصول اختصاص یابد؛ منوی هر
                ردیف (ویرایش/زیردسته/حذف) و کشیدن دسته‌ها فقط ساختار سراسری را مدیریت میکند.
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        {treePanel}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="دسته بندیها"
        subtitle="سلسله مراتب کاتالوگ خود را سازماندهی کنید؛ دسته ها را بکشید تا مرتب شوند."
        actions={toolbar}
      />
      {treePanel}
    </div>
  )
}
