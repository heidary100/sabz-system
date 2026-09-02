import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import type { CategoryTreeNode } from '@sabz/types'
import clsx from 'clsx'
import {
  ChevronDown,
  ChevronLeft,
  EllipsisVertical,
  Folder,
  FolderOpen,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Badge } from '../catalyst/badge'
import {
  INDENTATION_WIDTH,
  buildTreeFromItems,
  countNodes,
  filterTreeForSearch,
  flattenTree,
  getAllIds,
  getDescendantIds,
  getProjectedDrop,
  restoreSubtree,
  type DropProjection,
  type TreeItem,
} from '../../lib/category-tree-utils'

const ROW_HEIGHT = 44

export interface CategoryReorderDrop {
  id: string
  parentId: string | null
  position: number
  nextTree: CategoryTreeNode[]
}

interface CategoryTreeProps {
  tree: CategoryTreeNode[]
  expandedIds: Set<string>
  onToggleExpanded: (id: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  searchQuery: string
  onMatchCountChange?: (count: number) => void
  onAddChild: (category: CategoryTreeNode) => void
  onEdit: (category: CategoryTreeNode) => void
  onDelete: (category: CategoryTreeNode) => void
  onReorder: (drop: CategoryReorderDrop) => void
  reordering: boolean
}

export function CategoryTree({
  tree,
  expandedIds,
  onToggleExpanded,
  selectedId,
  onSelect,
  searchQuery,
  onMatchCountChange,
  onAddChild,
  onEdit,
  onDelete,
  onReorder,
  reordering,
}: CategoryTreeProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [projection, setProjection] = useState<DropProjection | null>(null)
  const offsetRef = useRef(0)
  const activeDepthRef = useRef(0)
  const itemsRef = useRef<TreeItem[]>([])
  const projectionRef = useRef<DropProjection | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  draggingIdRef.current = draggingId
  projectionRef.current = projection

  const searching = searchQuery.trim().length > 0

  const searchResult = useMemo(
    () => filterTreeForSearch(tree, searchQuery),
    [tree, searchQuery],
  )
  const displayedTree = searching ? searchResult.tree : tree

  useEffect(() => {
    onMatchCountChange?.(searching ? countNodes(searchResult.tree) : countNodes(tree))
  }, [searching, searchResult, tree, onMatchCountChange])
  const displayedExpanded = useMemo(() => {
    if (!searching) {
      return expandedIds
    }
    return new Set(getAllIds(searchResult.tree))
  }, [searching, expandedIds, searchResult])

  const items = useMemo(() => {
    const source = draggingId === null ? displayedTree : tree
    const expanded = draggingId === null ? displayedExpanded : expandedIds
    let flattened = flattenTree(source, expanded)
    if (draggingId !== null) {
      const descendants = getDescendantIds(tree, draggingId)
      flattened = flattened.filter(
        (item) => item.id === draggingId || !descendants.has(item.id),
      )
    }
    return flattened
  }, [tree, displayedTree, displayedExpanded, expandedIds, draggingId])

  itemsRef.current = items

  const draggingNode = useMemo(() => {
    if (draggingId === null) {
      return null
    }
    const stack: CategoryTreeNode[] = [...tree]
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.id === draggingId) {
        return node
      }
      stack.push(...node.children)
    }
    return null
  }, [tree, draggingId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const computeProjection = useCallback((activeId: string, overId: string): void => {
    const next = getProjectedDrop(itemsRef.current, activeId, overId, offsetRef.current)
    setProjection(next)
  }, [])

  const handleDragStart = useCallback(({ active }: DragStartEvent): void => {
    if (reordering || searching) {
      return
    }
    const id = String(active.id)
    const activeItem = itemsRef.current.find((item) => item.id === id)
    setDraggingId(id)
    activeDepthRef.current = activeItem?.depth ?? 0
    offsetRef.current = 0
    setProjection(null)
  }, [reordering, searching])

  const handleDragMove = useCallback(
    ({ active, over, delta }: DragMoveEvent): void => {
      if (reordering) {
        return
      }
      offsetRef.current = delta.x
      const overId = over ? String(over.id) : draggingIdRef.current
      if (overId) {
        computeProjection(String(active.id), overId)
      }
    },
    [computeProjection, reordering],
  )

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent): void => {
      if (reordering) {
        return
      }
      const overId = over ? String(over.id) : draggingIdRef.current
      if (overId) {
        computeProjection(String(active.id), overId)
      }
    },
    [computeProjection, reordering],
  )

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent): void => {
      const activeId = String(active.id)
      const dropProjection = projectionRef.current
      setDraggingId(null)
      setProjection(null)
      offsetRef.current = 0
      if (
        !reordering &&
        dropProjection &&
        dropProjection.canDrop &&
        over &&
        String(over.id) !== activeId
      ) {
        onReorder({
          id: activeId,
          parentId: dropProjection.parentId,
          position: dropProjection.position,
          nextTree: restoreSubtree(
            buildTreeFromItems(dropProjection.items),
            activeId,
            tree,
          ),
        })
      }
    },
    [onReorder, reordering],
  )

  const handleDragCancel = useCallback((): void => {
    setDraggingId(null)
    setProjection(null)
    offsetRef.current = 0
  }, [])

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const activeId = String(args.active.id)
      const pointerCollisions = pointerWithin(args).filter(
        (collision) => collision.id !== activeId,
      )
      if (pointerCollisions.length > 0) {
        return pointerCollisions
      }
      return closestCenter(args).filter((collision) => collision.id !== activeId)
    },
    [],
  )

  const indicatorIndex = useMemo(() => {
    if (!projection || !projection.canDrop || draggingId === null) {
      return null
    }
    const index = projection.items.findIndex((item) => item.id === draggingId)
    return index < 0 ? null : index
  }, [projection, draggingId])

  const handleToggle = useCallback(
    (id: string) => {
      if (draggingId === null) {
        onToggleExpanded(id)
      }
    },
    [draggingId, onToggleExpanded],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        role="tree"
        aria-label="درخت دسته بندیها"
        className="relative flex flex-col gap-0.5"
      >
        {items.map((item) => (
          <TreeNodeRow
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            expanded={item.id === draggingId ? false : (searching ? true : expandedIds.has(item.id))}
            isOver={item.id === projection?.parentId && draggingId !== null}
            searching={searching}
            searchQuery={searchQuery}
            dragging={item.id === draggingId}
            onToggleExpanded={handleToggle}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        {items.length === 0 && searching && (
          <div className="py-10 text-center text-sm text-muted">
            دسته بندیای با این عبارت یافت نشد.
          </div>
        )}
        {indicatorIndex !== null && projection && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_rgb(255_255_255/0.6)] dark:bg-primary-strong dark:shadow-none"
            style={{
              top: indicatorIndex * (ROW_HEIGHT + 2) - 1,
              insetInlineStart: projection.depth * INDENTATION_WIDTH + 28,
              insetInlineEnd: 8,
            }}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {draggingNode && (
          <div
            className="glass-strong flex h-11 items-center gap-2 rounded-lg px-3 opacity-95 shadow-xl"
            style={{
              transform: `translateX(${(activeDepthRef.current - (projection?.depth ?? activeDepthRef.current)) * INDENTATION_WIDTH}px)`,
            }}
          >
            <Folder className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate text-sm/6 font-medium text-foreground">
              {draggingNode.name}
            </span>
            <Badge color={draggingNode.isVisible ? 'green' : 'zinc'}>
              {draggingNode.isVisible ? 'نمایش' : 'مخفی'}
            </Badge>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

interface TreeNodeRowProps {
  item: TreeItem
  selected: boolean
  expanded: boolean
  isOver: boolean
  searching: boolean
  searchQuery: string
  dragging: boolean
  onToggleExpanded: (id: string) => void
  onSelect: (id: string) => void
  onAddChild: (category: CategoryTreeNode) => void
  onEdit: (category: CategoryTreeNode) => void
  onDelete: (category: CategoryTreeNode) => void
}

const TreeNodeRow = memo(function TreeNodeRow({
  item,
  selected,
  expanded,
  isOver,
  searching,
  searchQuery,
  dragging,
  onToggleExpanded,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
}: TreeNodeRowProps) {
  const { node, depth, id } = item
  const hasChildren = node.children.length > 0

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    disabled: dragging,
  })
  const { setNodeRef: setDropRef, isOver: dropOver } = useDroppable({ id })

  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      setDragRef(element)
      setDropRef(element)
    },
    [setDragRef, setDropRef],
  )

  const connectorStyle = useMemo(
    () => ({ insetInlineStart: (depth - 1) * INDENTATION_WIDTH + 16 }),
    [depth],
  )

  return (
    <div
      ref={setRefs}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      onClick={() => onSelect(id)}
      className={clsx(
        'group relative flex h-11 select-none items-center gap-1 rounded-xl border transition duration-150',
        selected
          ? 'border-primary-border bg-primary-subtle/80 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_18px_-8px_rgb(53_112_63/0.35)]'
          : 'border-transparent',
        isDragging && 'opacity-40',
        !selected && !isDragging && 'hover:bg-primary-subtle/35',
        dropOver && !isDragging && 'bg-primary-subtle/50',
        isOver && !isDragging && 'ring-1 ring-inset ring-primary-border',
      )}
      style={{ paddingInlineStart: depth * INDENTATION_WIDTH + 6 }}
    >
      {depth > 0 && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-border/80"
            style={connectorStyle}
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-px w-2.5 bg-border/80"
            style={{ ...connectorStyle, width: 10, marginInlineStart: 4 }}
          />
        </>
      )}

      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={`جابهجایی ${node.name}`}
        className="inline-flex size-5 shrink-0 cursor-grab items-center justify-center text-muted opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100 active:cursor-grabbing max-sm:opacity-60"
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onToggleExpanded(id)
        }}
        disabled={!hasChildren}
        aria-label={expanded ? `جمع کردن ${node.name}` : `باز کردن ${node.name}`}
        className={clsx(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition duration-150',
          hasChildren && 'hover:bg-primary-subtle hover:text-primary',
          !hasChildren && 'cursor-default opacity-40',
        )}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          ) : (
            <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          )
        ) : (
          <span className="size-4" aria-hidden="true" />
        )}
      </button>

      <span
        className={clsx(
          'inline-flex size-5 shrink-0 items-center justify-center',
          !hasChildren && 'ms-1',
        )}
        aria-hidden="true"
      >
        {hasChildren && expanded ? (
          <FolderOpen className="size-4 text-primary" />
        ) : (
          <Folder className="size-4 text-primary/80" />
        )}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm/6 font-medium text-foreground">
        {highlightName(node.name, searching ? searchQuery : '')}
      </span>

      <span className="hidden shrink-0 items-center gap-3 text-xs text-muted md:flex">
        {node.children.length > 0 && (
          <span>{faNumber(node.children.length)} زیردسته</span>
        )}
        {node.productCount > 0 && (
          <span>{faNumber(node.productCount)} محصول</span>
        )}
      </span>

      <Badge
        className="shrink-0"
        color={node.isVisible ? 'green' : 'zinc'}
      >
        {node.isVisible ? 'نمایش' : 'مخفی'}
      </Badge>

      <CategoryRowMenu
        category={node}
        onAddChild={onAddChild}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
})

function highlightName(name: string, query: string): ReactNode {
  if (!query) {
    return name
  }
  const index = name.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) {
    return name
  }
  return (
    <>
      {name.slice(0, index)}
      <mark className="rounded-sm bg-primary-subtle px-0.5 text-primary">
        {name.slice(index, index + query.length)}
      </mark>
      {name.slice(index + query.length)}
    </>
  )
}

function faNumber(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value)
}

interface CategoryRowMenuProps {
  category: CategoryTreeNode
  onAddChild: (category: CategoryTreeNode) => void
  onEdit: (category: CategoryTreeNode) => void
  onDelete: (category: CategoryTreeNode) => void
}

function CategoryRowMenu({
  category,
  onAddChild,
  onEdit,
  onDelete,
}: CategoryRowMenuProps) {
  return (
    <Menu>
      <MenuButton
        type="button"
        aria-label={`عملیات ${category.name}`}
        title="عملیات"
        onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition duration-150 hover:bg-primary-subtle hover:text-primary focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500"
      >
        <EllipsisVertical className="size-4" aria-hidden="true" />
      </MenuButton>
      <MenuItems
        transition
        anchor="bottom end"
        className="z-50 w-44 origin-top-right rounded-xl border border-border bg-surface-strong p-1 shadow-xl transition duration-100 data-closed:scale-95 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      >
        <MenuItem>
          <button
            type="button"
            onClick={() => onAddChild(category)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm/6 text-foreground transition duration-100 data-focus:bg-primary-subtle data-focus:text-primary"
          >
            <Plus className="size-4" aria-hidden="true" />
            افزودن زیردسته
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            onClick={() => onEdit(category)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm/6 text-foreground transition duration-100 data-focus:bg-primary-subtle data-focus:text-primary"
          >
            <Pencil className="size-4" aria-hidden="true" />
            ویرایش
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            onClick={() => onDelete(category)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm/6 text-danger transition duration-100 data-focus:bg-danger-subtle"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            حذف
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}