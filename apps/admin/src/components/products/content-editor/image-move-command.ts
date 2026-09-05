import { NodeSelection } from '@tiptap/pm/state'
import type { CommandProps } from '@tiptap/core'

/**
 * Moves the selected block-level image up (-1) or down (+1) within its parent,
 * swapping it with the adjacent sibling in document flow. Works on a
 * `NodeSelection` of the image and uses only ground-truth coordinates
 * (`selection.from`, sibling `nodeSize`) so it is robust across nested blocks.
 */
export function moveImageBlock({ state, dispatch }: CommandProps, dir: -1 | 1): boolean {
  const { selection } = state
  if (!(selection instanceof NodeSelection)) {
    return false
  }
  if (selection.node.type.name !== 'image') {
    return false
  }

  const $from = selection.$from
  const parent = $from.parent
  const index = $from.index()
  const target = index + dir
  if (target < 0 || target >= parent.childCount) {
    return false
  }

  const start = $from.start()
  const imageOffset = selection.from - start
  const transaction = state.tr
  transaction.delete(selection.from, selection.to)

  if (dir === -1) {
    // Insert before the previous sibling; the sibling sits right before the
    // (now removed) image, so its offset is `imageOffset - sibling.nodeSize`.
    const previousNodeSize = parent.child(target).nodeSize
    transaction.insert(start + imageOffset - previousNodeSize, selection.node)
  } else {
    // After the image is removed, the next sibling shifts left by the image's
    // size; inserting `nextNodeSize` after its start places the image after it.
    const nextNodeSize = parent.child(target).nodeSize
    transaction.insert(start + imageOffset + nextNodeSize, selection.node)
  }

  dispatch?.(transaction.scrollIntoView())
  return true
}