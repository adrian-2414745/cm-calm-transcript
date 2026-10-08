# tool-fold

A Claude Code mod that optimises the transcript to give priority to prompts and
output. Runs of tool calls fold into one expandable line, so there is less
scrolling and movement, and the transcript is easier on the eyes.
Design and open questions: [ui.md](ui.md).

- The repo root is the plugin: `.claude-plugin/plugin.json`, `hooks/register.tsx`,
  state contract in `types/index.d.ts`, tests in `hooks/*.test.tsx`
- Run: `claude --plugin-dir .` (edits reload when a turn ends)
- Check: `claude plugin validate .` and `claude plugin test .`
- Band focus: alt+up (or ctrl+x tab) to enter, alt+down (or Esc) to leave,
  set in `~/.claude/keybindings.json`

## Testing workflows

Prompts that exercise the mod live in [test-workflows/](test-workflows/), one
file each. A workflow puts every file it makes under `./tmp/` (gitignored).

- [edit-files](test-workflows/edit-files.md): create, commit and edit two
  files row by row (~24 tool calls)
