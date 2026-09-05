import { describe, expect, it } from 'vitest'
import { EditorState, NodeSelection } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { Schema, type Node as PMNode } from '@tiptap/pm/model'
import type { CommandProps } from '@tiptap/core'
import { moveImageBlock } from './image-move-command'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    image: {
      group: 'block',
      atom: true,
      attrs: {
        src: {},
        alt: { default: '' },
        width: { default: null },
        align: { default: 'center' },
        caption: { default: '' },
        href: { default: null },
      },
    },
  },
})

const paragraph = (text: string): PMNode =>
  schema.node('paragraph', {}, schema.text(text))
const image = (id: string): PMNode =>
  schema.node('image', { src: `/api/v1/description-images/${id}.jpg` })

/** Locates image node start positions using ProseMirror coordinates. */
function imagePositions(doc: PMNode): number[] {
  const positions: number[] = []
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.type.name === 'image') {
      positions.push(pos)
    }
  })
  return positions
}

function run(doc: PMNode, dir: -1 | 1): { ok: boolean; doc: PMNode } {
  const firstImagePos = imagePositions(doc)[0]
  if (firstImagePos === undefined) {
    throw new Error('test document has no image node')
  }
  const selection = NodeSelection.create(doc, firstImagePos)
  const state = EditorState.create({ schema, doc, selection })
  let result: PMNode = doc
  const ok = moveImageBlock(
    {
      state,
      dispatch: (transaction: Transaction) => {
        result = transaction.doc
      },
    } as unknown as CommandProps,
    dir,
  )
  return { ok, doc: result }
}

describe('moveImageBlock', () => {
  it('moves an image up past the previous block', () => {
    const doc = schema.node('doc', {}, [
      paragraph('one'),
      image('a'),
      paragraph('two'),
      image('b'),
    ])
    const { ok, doc: result } = run(doc, -1)
    expect(ok).toBe(true)
    expect(result.child(0).type.name).toBe('image')
    expect(result.child(1).textContent).toBe('one')
    expect(result.child(2).textContent).toBe('two')
    expect(result.child(3).type.name).toBe('image')
  })

  it('moves an image down past the next block', () => {
    const doc = schema.node('doc', {}, [
      paragraph('one'),
      image('a'),
      paragraph('two'),
      image('b'),
    ])
    const { ok, doc: result } = run(doc, 1)
    expect(ok).toBe(true)
    expect(result.child(0).textContent).toBe('one')
    expect(result.child(1).textContent).toBe('two')
    expect(result.child(2).type.name).toBe('image')
    expect(result.child(2).attrs.src).toContain('a.jpg')
    expect(result.child(3).type.name).toBe('image')
  })

  it('moves an image within a list item', () => {
    const item = schema.node(
      'doc',
      {},
      [paragraph('مقدمه'), image('a'), paragraph('پایان')],
    )
    // Build a nested context: paragraph inside a blockquote.
    const doc = schema.node('doc', {}, [
      paragraph('before'),
      item.child(0),
      image('a'),
      item.child(2),
    ])
    const { ok, doc: result } = run(doc, -1)
    expect(ok).toBe(true)
    expect(result.child(0).textContent).toBe('before')
    expect(result.child(1).type.name).toBe('image')
  })

  it('rejects moving the first image up (boundary)', () => {
    const doc = schema.node('doc', {}, [image('a'), paragraph('two')])
    const { ok } = run(doc, -1)
    expect(ok).toBe(false)
  })

  it('rejects moving the last image down (boundary)', () => {
    const doc = schema.node('doc', {}, [paragraph('one'), image('a')])
    const { ok } = run(doc, 1)
    expect(ok).toBe(false)
  })
})