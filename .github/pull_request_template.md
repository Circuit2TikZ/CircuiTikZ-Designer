<!--
The PR title becomes the squash commit and the release note, so it must be a conventional commit:
  <type>(<optional scope>): <short description>
Types: feat, fix, perf (released), docs, refactor, test, build, ci, chore (not released).
Mark breaking changes with "!" (e.g. feat(ui)!: ...). Example: fix(ui): label position shift in Firefox
See CONTRIBUTING.md for details.
-->

## What does this change?

## Checklist

- [ ] This PR contains a single feature or bug fix
- [ ] The PR targets `dev` and the title is a conventional commit
- [ ] I tested the change in the browser
- [ ] `npx tsc --noEmit` and `npx prettier --check .` pass
