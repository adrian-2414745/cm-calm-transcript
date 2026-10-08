export type FoldCall = {
  id: string
  tool: string
  target: string
  isPath: boolean
  isRunning: boolean
  isError: boolean
  added: number
  removed: number
  lines: number
  body: string[]
}

// One drawn line of a fold tree: a node that opens and closes, or a body line.
export type FoldRow = {
  key: string
  depth: number
  label: string
  kind: 'node' | 'line'
  isOpen?: boolean
  isError?: boolean
  tone?: 'add' | 'del' | 'dim'
}

export type FoldRun = { id: string; turn: number; isClosed: boolean; calls: FoldCall[] }

declare module 'claude-code' {
  interface PluginState {
    'tool-fold': {
      runs: FoldRun[]
      open: Record<string, boolean>
      turn: number
      bandTurn: number | null
    }
  }
}
