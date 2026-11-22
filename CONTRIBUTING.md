# Contributing to CircuiTikZ-Designer

Thanks for helping out! This page explains how pull requests and releases work in this repository.

By submitting a contribution you agree to the [Contributor License Agreement](CLA.md).

## Reporting bugs and requesting features

- Bugs: use the [issues page](https://github.com/Circuit2TikZ/CircuiTikZ-Designer/issues) and describe the steps to reproduce the bug.
- Feature ideas: discuss them on the [ideas page](https://github.com/Circuit2TikZ/CircuiTikZ-Designer/discussions/categories/ideas) first, especially for larger changes.

## Opening a pull request

1. Fork the repository and create a branch from **`dev`**.
2. Make your change and test it thoroughly in the browser (`npm start`).
3. Open the pull request against **`dev`**.

Pull requests into `main` are rejected: `main` only receives the release pull request from `dev`, which is opened by a bot and merged by the maintainers. Direct pushes to `main` and `dev` are not possible.

### One pull request, one change

Each pull request should contain **a single feature or a single bug fix**. Please do not bundle unrelated changes. If you notice something else while working, open a separate pull request for it.

Pull requests are squash merged, so the whole PR becomes one commit, and its title becomes both the commit message and the entry in the release notes. A PR that does several things cannot have a good title, so it will be asked to be split up.

### The pull request title

The title **must follow the [Conventional Commits](https://www.conventionalcommits.org/) format**. A check on the pull request validates it, and you can edit the title at any time (the check re-runs):

```
<type>(<optional scope>): <short description>
```

Write the description for the people reading the release notes: what changes for users, in the imperative mood, without a trailing period.

| Type                                               | Use for                                                               | Release                                 |
| -------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| `feat`                                             | a new feature or component                                            | minor version                           |
| `fix`                                              | a bug fix                                                             | patch version                           |
| `perf`                                             | a performance improvement                                             | patch version                           |
| `docs`, `refactor`, `test`, `build`, `ci`, `chore` | changes that don't affect users                                       | none, not listed in the release notes   |
| any of the above, with `!` (e.g. `feat(ui)!: ...`) | a breaking change (for example one that changes the save file format) | minor version below 1.0, major from 1.0 |

Examples:

- Good: `fix(ui): label position shift in Firefox after undo/redo`
- Good: `feat: add zener diode with adjustable voltage label`
- Good: `refactor(snapping): simplify grid snapping`
- Bad: `fixed stuff` (no type)
- Bad: `feat: various improvements and fixes` (several changes in one)
- Bad: `fix: bug` (says nothing in the release notes)

Mark breaking changes with `!` in the title and describe the impact in the PR description.

### Checks

Before pushing, you can run the checks that every pull request has to pass:

```sh
npm ci
npx tsc --noEmit        # type check
npx prettier --check .  # formatting, fix with: npx prettier --write .
npm run build           # production build
```

The pull request cannot be merged until the checks `check`, `build` and `pr-title` pass. You don't need to rebase or clean up your commits, because the maintainers squash merge.

## How releases work

You don't need to do anything for releases, but it explains why the title matters:

- Merged pull requests collect on `dev`.
- A bot keeps a draft pull request from `dev` to `main` whose description shows the next version and the release notes. Both are generated from the titles of the merged pull requests.
- When the maintainers merge that pull request, a release with the website build attached is created automatically.

Versions follow [semantic versioning](https://semver.org/). Maintainer details are in [MAINTAINING.md](MAINTAINING.md).
