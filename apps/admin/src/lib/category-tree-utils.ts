import type { CategoryTreeNode } from '@sabz/types'

export const INDENTATION_WIDTH = 28

export interface TreeItem {
  id: string
  parentId: string | null
  depth: number
  index: number
  node: CategoryTreeNode
}

export interface TreeNodeLookup {
  node: CategoryTreeNode
  parent: CategoryTreeNode | null
  path: CategoryTreeNode[]
  depth: number
}

export interface SearchFilterResult {
  tree: CategoryTreeNode[]
  matchedIds: Set<string>
}

export function flattenTree(
  tree: CategoryTreeNode[],
  expandedIds: Set<string>,
): TreeItem[] {
  const items: TreeItem[] = []
  const walk = (nodes: CategoryTreeNode[], parentId: string | null, depth: number): void => {
    for (const [index, node] of nodes.entries()) {
      items.push({ id: node.id, parentId, depth, index, node })
      if (expandedIds.has(node.id) && node.children.length > 0) {
        walk(node.children, node.id, depth + 1)
      }
    }
  }
  walk(tree, null, 0)
  return items
}

export function flattenAllNodes(tree: CategoryTreeNode[]): TreeItem[] {
  const items: TreeItem[] = []
  const walk = (nodes: CategoryTreeNode[], parentId: string | null, depth: number): void => {
    for (const [index, node] of nodes.entries()) {
      items.push({ id: node.id, parentId, depth, index, node })
      walk(node.children, node.id, depth + 1)
    }
  }
  walk(tree, null, 0)
  return items
}

export function buildTreeFromItems(items: TreeItem[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>()
  for (const item of items) {
    nodes.set(item.id, {
      ...item.node,
      parentId: item.parentId,
      sortOrder: 0,
      children: [],
    })
  }
  const roots: CategoryTreeNode[] = []
  for (const item of items) {
    const node = nodes.get(item.id)
    if (!node) {
      continue
    }
    const parent = item.parentId !== null ? nodes.get(item.parentId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const assignIndex = (nodes: CategoryTreeNode[]): void => {
    for (const [index, node] of nodes.entries()) {
      node.sortOrder = index
      assignIndex(node.children)
    }
  }
  assignIndex(roots)
  return roots
}

/**
 * Re-attach the full subtree of `id` (taken from `source`) onto a tree built
 * from a flattened item list. Flattening during a drag excludes the dragged
 * node's descendants, so an optimistic rebuild would otherwise lose them.
 */
export function restoreSubtree(
  tree: CategoryTreeNode[],
  id: string,
  source: CategoryTreeNode[],
): CategoryTreeNode[] {
  const target = lookupNode(source, id)
  if (!target) {
    return tree
  }
  const subtree = target.node
  const walk = (nodes: CategoryTreeNode[]): CategoryTreeNode[] =>
    nodes.map((node) =>
      node.id === id
        ? { ...node, children: subtree.children }
        : { ...node, children: walk(node.children) },
    )
  return walk(tree)
}

export function lookupNode(tree: CategoryTreeNode[], id: string): TreeNodeLookup | null {
  let result: TreeNodeLookup | null = null
  const walk = (nodes: CategoryTreeNode[], parent: CategoryTreeNode | null, path: CategoryTreeNode[], depth: number): void => {
    for (const node of nodes) {
      if (result) {
        return
      }
      if (node.id === id) {
        result = { node, parent, path: [...path], depth }
        return
      }
      walk(node.children, node, [...path, node], depth + 1)
    }
  }
  walk(tree, null, [], 0)
  return result
}

export function getDescendantIds(tree: CategoryTreeNode[], id: string): Set<string> {
  const target = lookupNode(tree, id)
  if (!target) {
    return new Set()
  }
  const ids = new Set<string>()
  const walk = (nodes: CategoryTreeNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id)
      walk(node.children)
    }
  }
  walk(target.node.children)
  return ids
}

export function getAllIds(tree: CategoryTreeNode[]): Set<string> {
  const ids = new Set<string>()
  const walk = (nodes: CategoryTreeNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id)
      walk(node.children)
    }
  }
  walk(tree)
  return ids
}

export function getExpandableIds(tree: CategoryTreeNode[]): Set<string> {
  const ids = new Set<string>()
  const walk = (nodes: CategoryTreeNode[]): void => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        ids.add(node.id)
      }
      walk(node.children)
    }
  }
  walk(tree)
  return ids
}

export function countNodes(tree: CategoryTreeNode[]): number {
  let count = 0
  const walk = (nodes: CategoryTreeNode[]): void => {
    for (const node of nodes) {
      count += 1
      walk(node.children)
    }
  }
  walk(tree)
  return count
}

export function countChildren(node: CategoryTreeNode): number {
  let count = 0
  const walk = (nodes: CategoryTreeNode[]): void => {
    for (const child of nodes) {
      count += 1
      walk(child.children)
    }
  }
  walk(node.children)
  return count
}

export function maxSiblingSortOrder(tree: CategoryTreeNode[], parentId: string | null): number {
  const siblings = parentId === null
    ? tree
    : lookupNode(tree, parentId)?.node.children ?? []
  return siblings.reduce((max, node) => Math.max(max, node.sortOrder), -1) + 1
}

export function filterTreeForSearch(tree: CategoryTreeNode[], query: string): SearchFilterResult {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return { tree, matchedIds: new Set() }
  }
  const matchedIds = new Set<string>()
  const walk = (nodes: CategoryTreeNode[]): CategoryTreeNode[] => {
    const kept: CategoryTreeNode[] = []
    for (const node of nodes) {
      const children = walk(node.children)
      const matches = node.name.toLowerCase().includes(needle)
      if (matches || children.length > 0) {
        if (matches) {
          matchedIds.add(node.id)
        }
        kept.push({ ...node, children })
      }
    }
    return kept
  }
  return { tree: walk(tree), matchedIds }
}

export interface DropProjection {
  depth: number
  parentId: string | null
  position: number
  canDrop: boolean
  items: TreeItem[]
}

function getDragDepth(offset: number, indentationWidth: number): number {
  /* RTL app: indentation grows to the inline-start (left), so dragging left
     (negative screen-space delta) means "deeper". */
  return Math.round(-offset / indentationWidth)
}

function getMaxDepth(previousItem: TreeItem | undefined, projectedDepth: number): number {
  return previousItem ? previousItem.depth + 1 : projectedDepth
}

function getMinDepth(nextItem: TreeItem | undefined, projectedDepth: number): number {
  return nextItem ? nextItem.depth : projectedDepth
}

function getParentId(depth: number, previousItem: TreeItem | undefined, insertAt: number, items: TreeItem[]): string | null {
  if (depth === 0 || !previousItem) {
    return null
  }
  if (depth === previousItem.depth) {
    return previousItem.parentId
  }
  if (depth > previousItem.depth) {
    return previousItem.id
  }
  const newParent = items
    .slice(0, insertAt)
    .reverse()
    .find((item) => item.depth === depth)?.parentId
  return newParent ?? null
}

export function getProjectedDrop(
  items: TreeItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
): DropProjection {
  const overItemIndex = items.findIndex(({ id }) => id === overId)
  const activeItemIndex = items.findIndex(({ id }) => id === activeId)
  if (overItemIndex < 0 || activeItemIndex < 0) {
    return { depth: 0, parentId: null, position: 0, canDrop: false, items }
  }
  if (activeId === overId) {
    const activeItem = items[activeItemIndex]!
    return {
      depth: activeItem.depth,
      parentId: activeItem.parentId,
      position: activeItem.index,
      canDrop: false,
      items,
    }
  }

  const activeItem = items[activeItemIndex]!
  const dragDepth = getDragDepth(dragOffset, INDENTATION_WIDTH)
  const projectedDepth = activeItem.depth + dragDepth

  const reordered = items.filter((item) => item.id !== activeId)
  const overIndex = reordered.findIndex((item) => item.id === overId)
  const insertAt = activeItemIndex < overItemIndex ? overIndex + 1 : overIndex

  /* Depth is clamped by the rows surrounding the insertion slot so a pure
     vertical move never changes the nesting level: the drop can be no deeper
     than one level below the row above it, and no shallower than the row
     below it. Only the horizontal indent gesture changes depth. */
  const previousItem = reordered[insertAt - 1]
  const nextItem = reordered[insertAt]
  const maxDepth = getMaxDepth(previousItem, projectedDepth)
  const minDepth = getMinDepth(nextItem, projectedDepth)
  const clampedDepth = projectedDepth

  const depth = clampedDepth >= maxDepth
    ? maxDepth
    : clampedDepth < minDepth
      ? minDepth
      : clampedDepth

  const parentId = getParentId(depth, previousItem, insertAt, reordered)

  /* Reconcile the preview depth with the resolved parent so the drop
     indicator always matches the tree that will be rebuilt: a root drop
     renders at depth 0 even when the clamped preview sat deeper. */
  const parentItem = parentId !== null ? reordered.find((item) => item.id === parentId) : undefined
  const resolvedDepth = parentId === null ? 0 : parentItem ? parentItem.depth + 1 : depth

  reordered.splice(insertAt, 0, {
    ...activeItem,
    parentId,
    depth: resolvedDepth,
  })

  let position = 0
  for (let i = 0; i < reordered.length; i += 1) {
    const item = reordered[i]
    if (!item || item.id === activeId) {
      break
    }
    if (item.parentId === parentId) {
      position += 1
    }
  }

  return { depth: resolvedDepth, parentId, position, canDrop: true, items: reordered }
}