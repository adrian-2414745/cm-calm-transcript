# tool-fold UI

Folds each run of tool calls (calls with no assistant text between them) into
one line, expandable in levels, to cut transcript spam.

```
[+] Tool calls - 2 tools on 6 files (10 calls)
---
[-] Tool calls - 2 tools on 6 files (10 calls)
    [-] Update (2 files)
        [-] test.txt: 5 edits, +5 -5
              <edit bodies>
        [+] test2.txt: 5 edits, +5 -5
    [+] Read (4 files)
```

- Transcript: every run starts folded; the row of a run's first call draws the
  tree, the run's other rows draw nothing.
- Band above the prompt: the latest run's tree, navigable by mouse click
  (fullscreen) or ctrl+x tab + arrows/Enter. Shown only once tools have run;
  cleared on the next prompt.
- Excluded from folding: AskUserQuestion.
- Bash errors: folded like everything else.
- Development: hot-reload only, from the session's dev-mods folder.

# To revisit

- Bash errors treatment: keep failed Bash calls visible (unfolded or flagged)
  instead of folding them with the rest.
- ExitPlanMode: fold it, or keep the approved plan visible.
