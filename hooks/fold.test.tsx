import { expect, test } from 'claude-code/testing'

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

test('a run of edits folds into one expandable line', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok', value: null }) as never)

  await $.tool.call({ tool: 'Edit', tool_use_id: 'c1', file_path: '/r/test.txt', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'c2', file_path: '/r/test2.txt', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'c3', file_path: '/r/test.txt', old_string: 'x\ny', new_string: 'z' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const first = await $.ui.mount({ ...row('c1', '/r/test.txt'), surface })
    expect((await first.find({ type: 'Button' }))?.text).toBe('[+] Tool calls - 1 tool on 2 files (3 calls)')

    await first.press({ key: 't:c1' })
    expect((await first.find({ key: 't:c1:0:Edit' }))?.text).toBe('[+] Edit (2 files)')

    await first.press({ key: 't:c1:0:Edit' })
    expect((await first.find({ key: 't:c1:0:Edit:test.txt' }))?.text).toBe('[+] test.txt: 2 edits, +2 -3')

    await first.press({ key: 't:c1:0:Edit:test.txt' })
    expect(await first.find({ type: 'Text', text: '- x' })).toBeDefined()

    // collapse again for the next surface
    await first.press({ key: 't:c1:0:Edit:test.txt' })
    await first.press({ key: 't:c1:0:Edit' })
    await first.press({ key: 't:c1' })
    expect(await first.find({ key: 't:c1:0:Edit' })).toBeUndefined()
    await first.unmount()

    const second = await $.ui.mount({ ...row('c2', '/r/test2.txt'), surface })
    expect(await second.find({ type: 'Button' })).toBeUndefined()
    await second.unmount()
  }
})

test('tool groups keep the order the calls ran in', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok', value: null }) as never)

  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/r/a.md' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r2', file_path: '/r/b.md' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'r3', command: 'cat c.md' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r4', file_path: '/r/d.md' })

  const ui = await $.ui.mount({ ...row('r1', '/r/a.md'), surface: 'terminal' })
  await ui.press({ key: 't:r1' })
  const labels = (await ui.findAll({ type: 'Button' })).map(b => b.text)
  expect(labels).toEqual([
    '[-] Tool calls - 2 tools on 3 files (4 calls)',
    '[+] Read (2 files)',
    '[+] Bash (1 call)',
    '[+] Read (1 file)',
  ])
  await ui.unmount()
})

test('a running call not recorded yet draws folded, never as the engine row', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const fresh = row('n1', '/r/new.txt')
    const first = await $.ui.mount({ ...fresh, props: { ...fresh.props, isRunning: true }, surface })
    expect((await first.find({ type: 'Button' }))?.text).toBe('[+] Tool calls - 1 tool on 1 file (1 call) …')
    await first.unmount()
  }
})

test('a finished row from before the mod loaded is left to the engine', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const old = await $.ui.mount({ ...row('old1', '/r/old.txt'), surface: 'terminal' })
  expect(await old.find({ type: 'Button' })).toBeUndefined()
  expect(await old.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  await old.unmount()
})
