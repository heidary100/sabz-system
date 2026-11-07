/**
 * SS-271 audit-label drift gate.
 *
 * The API stores audit actions/entities as free-form strings (no shared enum),
 * so this script reads the strings emitted by the API and verifies that every
 * one has a Persian label in apps/admin/src/lib/audit-labels.ts. It exits
 * non-zero when a code would render raw in the UI.
 *
 * Run: node apps/admin/scripts/check-audit-labels.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..', '..', '..')
const apiSrc = join(repoRoot, 'apps', 'api', 'src')
const labelsPath = join(scriptDir, '..', 'src', 'lib', 'audit-labels.ts')

const labelsSource = readFileSync(labelsPath, 'utf8')

function keysFromBlock(name) {
  const start = labelsSource.indexOf(`const ${name}: Record<string, string> = {`)
  if (start === -1) throw new Error(`Label block not found: ${name}`)
  const open = labelsSource.indexOf('{', start)
  const close = labelsSource.indexOf('\n}', open)
  const block = labelsSource.slice(open + 1, close)
  return new Set([...block.matchAll(/^\s{2}([A-Za-z][\w]*):/gm)].map((match) => match[1]))
}

const knownActions = keysFromBlock('AUDIT_ACTION_LABELS')
const knownEntities = keysFromBlock('AUDIT_ENTITY_LABELS')

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...walk(fullPath))
    } else if (entry.endsWith('.ts') && !/\.(spec|test|e2e-spec)\.ts$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

const emittedActions = new Set()
const emittedEntities = new Set()

// Import reconciliation is not an audit write; its `action` field is a
// create/skip/update row outcome.
const IGNORED_ACTION_VALUES = new Set(['CREATE', 'UPDATE', 'SKIP'])

for (const file of walk(apiSrc)) {
  const rel = relative(repoRoot, file)
  if (rel.includes('/modules/import/')) continue

  const source = readFileSync(file, 'utf8')
  for (const line of source.split('\n')) {
    if (line.includes('action:')) {
      for (const match of line.matchAll(/'([A-Z][A-Z0-9_]+)'/g)) {
        if (!IGNORED_ACTION_VALUES.has(match[1])) emittedActions.add(match[1])
      }
    }

    if (/\.(log|audit)\(\s*'[A-Z][A-Z0-9_]+'/.test(line)) {
      for (const match of line.matchAll(/'([A-Z][A-Z0-9_]+)'/g)) {
        emittedActions.add(match[1])
      }
    }

    if (line.includes('entity:')) {
      for (const match of line.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)) {
        emittedEntities.add(match[1])
      }
    }
  }
}

const missingActions = [...emittedActions].filter((action) => !knownActions.has(action)).sort()
const missingEntities = [...emittedEntities].filter((entity) => !knownEntities.has(entity)).sort()

console.log(`SS-271 audit-label gate — ${emittedActions.size} actions, ${emittedEntities.size} entities`)

if (missingActions.length > 0) {
  console.log(`\nMissing action labels (${missingActions.length}):`)
  for (const action of missingActions) console.log(`  - ${action}`)
}

if (missingEntities.length > 0) {
  console.log(`\nMissing entity labels (${missingEntities.length}):`)
  for (const entity of missingEntities) console.log(`  - ${entity}`)
}

if (missingActions.length === 0 && missingEntities.length === 0) {
  console.log('All emitted audit codes have Persian labels.')
} else {
  process.exitCode = 1
}
