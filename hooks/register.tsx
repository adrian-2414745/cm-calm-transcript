import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FoldCall, FoldRow, FoldRun } from '../types'

const runs = atom({ plugin: 'tool-fold', key: 'runs' } as const, [])
const open = atom({ plugin: 'tool-fold', key: 'open' } as const, {})
const turn = atom({ plugin: 'tool-fold', key: 'turn' } as const, 0)
const bandTurn = atom({ plugin: 'tool-fold', key: 'bandTurn' } as const, null)

const EXCLUDED = new Set(['AskUserQuestion'])
const MAX_RUNS = 200
const MAX_BODY = 20

type Rec = Record<string, unknown>
// The element tables differ per surface; the tree only uses Box, Text and Button.
type Els = { Box: any; Text: any; Button: any }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const lineCount = (s: string) => (s === '' ? 0 : s.split('\n').length)
const head = (s: string, n = MAX_BODY) => {
  const lines = s.split('\n')
  return lines.length > n ? [...lines.slice(0, n), `… ${lines.length - n} more lines`] : lines
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function describe(tool: string, input: Rec): { target: string; isPath: boolean } {
  const path = str(input.file_path) || str(input.notebook_path) || str(input.path)
  if (path !== '') return { target: path.split('/').pop() || path, isPath: true }
  const text = str(input.command) || str(input.pattern) || str(input.url) || str(input.query) || str(input.description)
  if (text !== '') return { target: text.split('\n')[0]!.slice(0, 60), isPath: false }
  return { target: tool, isPath: false }
}

function measure(call: FoldCall, input: Rec, result: unknown, text: string): FoldCall {
  const out = (result ?? {}) as Rec
  switch (call.tool) {
    case 'Edit': {
      const removed = lineCount(str(input.old_string))
      const added = lineCount(str(input.new_string))
      const body = [
        ...head(str(input.old_string), MAX_BODY / 2).map(l => `- ${l}`),
        ...head(str(input.new_string), MAX_BODY / 2).map(l => `+ ${l}`),
      ]
      return { ...call, added, removed, body }
    }
    case 'Write': {
      const content = str(input.content)
      return { ...call, added: lineCount(content), body: head(content) }
    }
    case 'Read': {
      const file = (out.file ?? {}) as Rec
      const content = str(file.content) || text
      const lines = typeof file.numLines === 'number' ? file.numLines : lineCount(content)
      return { ...call, lines, body: head(content) }
    }
    case 'Bash': {
      const stdout = str(out.stdout)
      const stderr = str(out.stderr)
      const all = [stdout, stderr].filter(s => s !== '').join('\n') || text
      return { ...call, lines: lineCount(all), body: [`$ ${str(input.command)}`, ...head(all)] }
    }
    default:
      return { ...call, lines: lineCount(text), body: head(text) }
  }
}

function fileSummary(tool: string, calls: FoldCall[]): string {
  const errors = calls.filter(c => c.isError).length
  const added = calls.reduce((n, c) => n + c.added, 0)
  const removed = calls.reduce((n, c) => n + c.removed, 0)
  const lines = calls.reduce((n, c) => n + c.lines, 0)
  const parts: string[] = []
  if (tool === 'Edit') parts.push(plural(calls.length, 'edit'), `+${added} -${removed}`)
  else if (tool === 'Write') parts.push(`wrote ${plural(added, 'line')}`)
  else parts.push(...(calls.length > 1 ? [plural(calls.length, 'call')] : []), plural(lines, 'line'))
  if (errors > 0) parts.push(plural(errors, 'error'))
  if (calls.some(c => c.isRunning)) parts.push('running…')
  return parts.join(', ')
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    map.set(k, [...(map.get(k) ?? []), item])
  }
  return map
}

// Consecutive calls of one tool, in the order they ran: Read, Read, Bash, Read
// is Read (2), Bash (1), Read (1).
function segments(calls: FoldCall[]): { tool: string; calls: FoldCall[] }[] {
  const out: { tool: string; calls: FoldCall[] }[] = []
  for (const c of calls) {
    const last = out[out.length - 1]
    if (last !== undefined && last.tool === c.tool) last.calls.push(c)
    else out.push({ tool: c.tool, calls: [c] })
  }
  return out
}

function header(run: FoldRun): string {
  const tools = new Set(run.calls.map(c => c.tool)).size
  const files = new Set(run.calls.filter(c => c.isPath).map(c => c.target)).size
  const on = files > 0 ? ` on ${plural(files, 'file')}` : ''
  const running = run.calls.some(c => c.isRunning) ? ' …' : ''
  return `Tool calls - ${plural(tools, 'tool')}${on} (${plural(run.calls.length, 'call')})${running}`
}

// The tree as one row per line, in the order it is drawn.
function flatten(scope: string, list: FoldRun[], expanded: Record<string, boolean>): FoldRow[] {
  const rows: FoldRow[] = []
  const node = (key: string, depth: number, label: string, isError = false) =>
    rows.push({ key, depth, label, kind: 'node', isOpen: expanded[key] === true, isError })

  for (const run of list) {
    const runKey = `${scope}:${run.id}`
    node(runKey, 0, header(run), run.calls.some(c => c.isError))
    if (!expanded[runKey]) continue
    for (const [i, { tool, calls }] of segments(run.calls).entries()) {
      const toolKey = `${runKey}:${i}:${tool}`
      const targets = groupBy(calls, c => c.target)
      const unit = calls[0]!.isPath ? 'file' : 'call'
      node(toolKey, 1, `${tool} (${plural(unit === 'file' ? targets.size : calls.length, unit)})`)
      if (!expanded[toolKey]) continue
      for (const [target, group] of targets) {
        const fileKey = `${toolKey}:${target}`
        node(fileKey, 2, `${target}: ${fileSummary(tool, group)}`, group.some(c => c.isError))
        if (!expanded[fileKey]) continue
        group.forEach((c, i) => {
          if (i > 0) rows.push({ key: `${fileKey}:${i}:sep`, depth: 3, label: '─'.repeat(20), kind: 'line', tone: 'dim' })
          c.body.forEach((l, j) =>
            rows.push({
              key: `${fileKey}:${i}:${j}`,
              depth: 3,
              label: l,
              kind: 'line',
              tone: l.startsWith('+ ') ? 'add' : l.startsWith('- ') ? 'del' : 'dim',
            }),
          )
        })
      }
    }
  }
  return rows
}

// One Button per node, so a click or the band's arrow keys and Enter open and
// close it; body lines are plain Text.
function tree($: EngineInterface, els: Els, scope: string, list: FoldRun[], expanded: Record<string, boolean>) {
  const { Box, Text, Button } = els
  const toggle = (key: string) => () => update($, open, o => ({ ...o, [key]: !o[key] }))
  return (
    <Box flexDirection="column">
      {flatten(scope, list, expanded).map(r =>
        r.kind === 'node' ? (
          <Box paddingLeft={r.depth * 4}>
            <Button key={r.key} plain label={`${r.isOpen ? '[-]' : '[+]'} ${r.label}`} dimColor={!r.isError} onPress={toggle(r.key)} />
          </Box>
        ) : (
          <Box paddingLeft={r.depth * 4 + 2}>
            <Text wrap="truncate-end" dimColor={r.tone === 'dim'} color={r.tone === 'add' ? 'green' : r.tone === 'del' ? 'red' : undefined}>
              {r.label === '' ? ' ' : r.label}
            </Text>
          </Box>
        ),
      )}
    </Box>
  )
}

const findRun = (list: FoldRun[], id: string) => list.find(r => r.calls.some(c => c.id === id))

function closeOpenRun($: EngineInterface) {
  return update($, runs, list => (list.some(r => !r.isClosed) ? list.map(r => (r.isClosed ? r : { ...r, isClosed: true })) : list))
}

function newCall(id: string, tool: string, input: Rec): FoldCall {
  const { target, isPath } = describe(tool, input)
  return { id, tool, target, isPath, isRunning: true, isError: false, added: 0, removed: 0, lines: 0, body: [] }
}

// Joins the open run, or starts one; a call already recorded stays where it is.
async function addCall($: EngineInterface, call: FoldCall) {
  const now = await read($, turn)
  await update($, runs, list => {
    if (findRun(list, call.id) !== undefined) return list
    const last = list[list.length - 1]
    if (last !== undefined && !last.isClosed) return list.map(r => (r === last ? { ...r, calls: [...r.calls, call] } : r))
    return [...list, { id: call.id, turn: now, isClosed: false, calls: [call] }].slice(-MAX_RUNS)
  })
  await update($, bandTurn, () => now)
}

function patchCall($: EngineInterface, id: string, patch: (c: FoldCall) => FoldCall) {
  return update($, runs, list =>
    list.map(r => (r.calls.some(c => c.id === id) ? { ...r, calls: r.calls.map(c => (c.id === id ? patch(c) : c)) } : r)),
  )
}

const hasOpenRun = (list: FoldRun[]) => list.some(r => !r.isClosed)

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    await closeOpenRun($)
    await update($, turn, n => n + 1)
    await update($, bandTurn, () => null)
    return next(e)
  })

  // The model's blocks, in order: text ends the current run, a tool_use joins it.
  // Recorded here, as the response is stored, so a row is known before it runs.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.agentId !== undefined) return stored
    for (const b of e.message.content) {
      if (e.message.type === 'assistant' && b.type === 'text' && str(b.text).trim() !== '') await closeOpenRun($)
      if (e.message.type === 'assistant' && b.type === 'tool_use' && !EXCLUDED.has(str(b.name)))
        await addCall($, newCall(str(b.id), str(b.name), (b.input ?? {}) as Rec))
      // A call refused before it ran never reaches tool.call: its result row ends it.
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string')
        await patchCall($, b.tool_use_id, c => ({ ...c, isRunning: false, isError: c.isError || b.is_error === true }))
    }
    return stored
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (e.agentId !== undefined || EXCLUDED.has(tool) || e.tool_use_id === undefined) return next(e)

    const id = e.tool_use_id
    const input = e as unknown as Rec
    await addCall($, newCall(id, tool, input))

    const ran = await next(e)
    const isError = ran.deny !== undefined || ran.isError === true
    await patchCall($, id, c => measure({ ...c, isRunning: false, isError }, input, ran.result, ran.deny ?? ran.text ?? ''))
    return ran
  })

  // A running call not recorded yet is drawn as it will be once recorded, never
  // as the engine's own row, so nothing flashes before it folds.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const list = await read($, runs)
    const run = findRun(list, e.requestId)
    const { Box } = $.ui.resolve(e)
    if (run === undefined) {
      if (EXCLUDED.has(e.props.tool) || !e.props.isRunning) return next(e)
      if (hasOpenRun(list)) return <Box />
      const pending: FoldRun = { id: e.requestId, turn: 0, isClosed: false, calls: [newCall(e.requestId, e.props.tool, (e.props.input ?? {}) as Rec)] }
      return tree($, $.ui.resolve(e) as Els, 't', [pending], await read($, open))
    }
    if (run.calls[0]!.id !== e.requestId) return <Box />
    return tree($, $.ui.resolve(e) as Els, 't', [run], await read($, open))
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const list = await read($, runs)
    if (findRun(list, e.requestId) === undefined) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const list = await read($, runs)
    const { Box } = $.ui.resolve(e)
    const calls = e.props.calls
    const known = calls.map(c => (c.tool_use_id === undefined ? undefined : findRun(list, c.tool_use_id)))
    const first = known.find((r, i) => r !== undefined && r.calls[0]!.id === calls[i]!.tool_use_id)
    if (first !== undefined) return tree($, $.ui.resolve(e) as Els, 't', [first], await read($, open))
    if (known.every(r => r !== undefined)) return <Box />
    if (!calls.some(c => c.isRunning)) return next(e)
    if (hasOpenRun(list)) return <Box />
    const id = calls[0]!.tool_use_id ?? e.requestId
    const pending: FoldRun = { id, turn: 0, isClosed: false, calls: calls.map((c, i) => newCall(c.tool_use_id ?? `${id}:${i}`, c.tool, (c.input ?? {}) as Rec)) }
    return tree($, $.ui.resolve(e) as Els, 't', [pending], await read($, open))
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, bandTurn)
    const list = (await read($, runs)).filter(r => r.turn === shown)
    if (e.props.hasSurvey || shown === null || list.length === 0) return next(e)
    return tree($, $.ui.resolve(e) as Els, 'b', list, await read($, open))
  })
}
