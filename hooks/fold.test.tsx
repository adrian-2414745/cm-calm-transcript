import { expect, test } from 'claude-code/testing'

// The lines a Client's module drew, each Text's strings joined.
type Node = { type?: string; children?: unknown[] } | string
const linesOf = (node: Node): string[] => {
  if (typeof node === 'string') return [node]
  const kids = (node.children ?? []) as Node[]
  if (node.type === 'Text') return [kids.map(k => (typeof k === 'string' ? k : linesOf(k).join(''))).join('')]
  return kids.flatMap(linesOf)
}
type Drawn = { drawn: (scope?: { in?: string }) => Promise<unknown> }
const lines = async (ui: Drawn, id: string) => {
  try {
    return linesOf((await ui.drawn({ in: `fold:t:${id}` })) as Node).map(l => l.trim())
  } catch {
    return []
  }
}

const row = (id: string, file: string) => ({
  plugin: 'tool-fold',
  component: 'ToolUse' as const,
  requestId: id,
  props: {
    tool_use_id: id,
    tool: 'Edit',
    input: { file_path: file, old_string: 'a', new_string: 'b' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  },
})

test('a run of edits folds into one line that the arrow keys open and close', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok', value: null }) as never)

  await $.tool.call({ tool: 'Edit', tool_use_id: 'c1', file_path: '/r/test.txt', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'c2', file_path: '/r/test2.txt', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'c3', file_path: '/r/test.txt', old_string: 'x\ny', new_string: 'z' })

  const text = async (ui: Drawn, t: string) => ((await lines(ui, 'c1')).some(l => l.includes(t)) ? true : undefined)

  for (const surface of ['terminal', 'desktop'] as const) {
    const first = await $.ui.mount({ ...row('c1', '/r/test.txt'), surface })
    expect(await text(first, '[+] Tool calls - 1 tool on 2 files (3 calls)')).toBeDefined()

    await first.key({ key: 'right' }) // open the run
    expect(await text(first, '[+] Edit (2 files)')).toBeDefined()
    await first.key({ key: 'right' }) // step into it
    await first.key({ key: 'right' }) // open Edit
    expect(await text(first, '[+] test.txt: 2 edits, +2 -3')).toBeDefined()
    await first.key({ key: 'down' }) // to test.txt
    await first.key({ key: 'right' }) // open it
    expect(await text(first, '- x')).toBeDefined()

    await first.key({ key: 'left' }) // close test.txt
    expect(await text(first, '- x')).toBeUndefined()
    await first.key({ key: 'left' }) // to Edit
    await first.key({ key: 'left' }) // close Edit
    expect(await text(first, 'test.txt:')).toBeUndefined()
    await first.key({ key: 'up' }) // to the run
    await first.key({ key: 'left' }) // close it
    expect(await text(first, 'Edit (2 files)')).toBeUndefined()

    await first.pointer({ type: 'down', x: 1, y: 0, button: 'left' }) // a click opens the run
    expect(await text(first, '[+] Edit (2 files)')).toBeDefined()
    await first.pointer({ type: 'down', x: 1, y: 0, button: 'left' }) // and closes it
    expect(await text(first, 'Edit (2 files)')).toBeUndefined()
    await first.unmount()

    const second = await $.ui.mount({ ...row('c2', '/r/test2.txt'), surface })
    expect(await lines(second, 'c2')).toEqual([])
    await second.unmount()
  }

  // A surface without Client gets Buttons.
  const plain = await $.ui.mount({ ...row('c1', '/r/test.txt'), surface: 'vscode' })
  await plain.press({ key: 't:c1' })
  expect((await plain.find({ key: 't:c1:Edit' }))?.text).toBe('[+] Edit (2 files)')
  await plain.press({ key: 't:c1' })
  await plain.unmount()
})

test('a running call not recorded yet draws folded, never as the engine row', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const fresh = row('n1', '/r/new.txt')
    const first = await $.ui.mount({ ...fresh, props: { ...fresh.props, isRunning: true }, surface })
    expect(await lines(first, 'n1')).toEqual(['[+] Tool calls - 1 tool on 1 file (1 call) …'])
    await first.unmount()
  }
})

test('a finished row from before the mod loaded is left to the engine', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const old = await $.ui.mount({ ...row('old1', '/r/old.txt'), surface: 'terminal' })
  expect(await lines(old, 'old1')).toEqual([])
  expect(await old.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  await old.unmount()
})
