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

function getParentId(depth: number, previousItem: TreeItem | undefined, overItemIndex: number, items: TreeItem[]): string | null {
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
    .slice(0, overItemIndex)
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
  const overItem = items[overItemIndex]!
  const dragDepth = getDragDepth(dragOffset, INDENTATION_WIDTH)
  const projectedDepth = activeItem.depth + dragDepth
  const maxDepth = getMaxDepth(overItem, projectedDepth)
  const minDepth = getMinDepth(overItem, projectedDepth)
  let depth = projectedDepth

  if (projectedDepth >= maxDepth) {
    depth = maxDepth
  } else if (projectedDepth < minDepth) {
    depth = minDepth
  }

  const parentId = getParentId(depth, overItem, overItemIndex, items)

  const reordered = items.filter((item) => item.id !== activeId)
  const overIndex = reordered.findIndex((item) => item.id === overId)
  const insertAt = activeItemIndex < overItemIndex ? overIndex + 1 : overIndex
  reordered.splice(Math.max(insertAt, 0), 0, {
    ...activeItem,
    parentId,
    depth,
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

  return { depth, parentId, position, canDrop: true, items: reordered }
}