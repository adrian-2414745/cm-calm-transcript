# Test workflow: edit files

Runs about 24 small tool calls (Bash, Read, Edit) in several runs, to check how
tool-fold renders them. All files go under `./tmp/edit-files/`, which has its
own git repo, so the commit step stays out of this repo's history.

Reset before a rerun: `rm -rf tmp/edit-files`

## Prompt

Paste this as the prompt:

```
All files live in ./tmp/edit-files/. Create the folder first if it doesn't
exist, and run `git init` in it if it is not a git repo yet. Run every git
command inside that folder.
Files: tmp/edit-files/fileA.txt and tmp/edit-files/fileB.txt

PART 1 - Create, for each file (fileA.txt completely first, then fileB.txt):
1. Create the empty file.
2. Read and report its created (birth) date.
3. Append the text "aBa" five times, one per row, so the file has 5 rows.
4. Read and report its modified date.

PART 2 - Commit (once, after both files are created):
5. git add both files and commit them in a single commit with the message
   "add test files". Do not add any Co-Authored-By or other attribution
   lines. Report the commit hash.

PART 3 - Edit, for each file (fileA.txt completely first, then fileB.txt):
6. On row 3 only, replace "b" with "AAA" (case-insensitive).
   Expected row 3: "aAAAa".
7. Swap the case of every letter in every row, one row at a time.
   Expected final content: AbA / AbA / AaaaA / AbA / AbA

Rules:
- Exactly ONE tool call per step. Steps 1-5 use Bash; step 1 may also create
  the folder and init its repo; step 3 may write all five rows in one call.
  Step 6 is one call per file.
- Step 7: Read the file first, then 5 Edit calls per file (one per row).
  Include a neighboring row in old_string to keep each match unique.
- No sed, tr or awk for step 7.
- Do not commit after Part 2; leave Part 3 edits uncommitted so they show in
  `git -C tmp/edit-files diff`.
```

## What to check

1. Each run shows as one `[+] Tool calls - N tools on M files (K calls)` line.
2. The hidden rows of a run leave no blank gaps.
3. Expanding works level by level: run, then tool, then file, then call bodies.
4. The band above the prompt appears once tools run, can be entered with
   alt+up and navigated with arrows/Enter, and clears on the next prompt.
5. `git -C tmp/edit-files diff` shows the Part 3 edits; the final content
   matches.
