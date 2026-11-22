# Maintaining CircuiTikZ-Designer

Notes for maintainers on branches, pull requests and releases. Contributors only need
[CONTRIBUTING.md](CONTRIBUTING.md).

## Branches and rules

| Branch | Receives                                 | Merge method          |
| ------ | ---------------------------------------- | --------------------- |
| `dev`  | all pull requests from contributors      | squash and merge      |
| `main` | only the release pull request from `dev` | create a merge commit |

Both branches are protected by rulesets: no direct pushes, no force pushes, no deletion, pull request required, and the status checks below must pass. The bypass list is empty.

| Check           | Workflow            | Required on   |
| --------------- | ------------------- | ------------- |
| `check`         | `ci.yml`            | `dev`, `main` |
| `build`         | `ci.yml`            | `dev`, `main` |
| `pr-title`      | `pr-title.yml`      | `dev`         |
| `source-branch` | `source-branch.yml` | `main`        |

- `check` runs the type check and the formatting check on every push and pull request. `build` runs the production build for `main`, `dev` and pull requests targeting them.
- `pr-title` validates that the PR title is a conventional commit.
- `source-branch` fails for pull requests into `main` that don't come from `dev` of this repository.
- Require the `(pull_request)` runs, not the `(push)` runs, where a check exists for both.
- Do not enable "Require branches to be up to date" for `main`. After a release, `dev` is one merge commit behind `main`, and that setting would force a back-merge each time.

## Reviewing and merging a pull request

1. Check that the PR does **one thing**. If not, ask for a split. A squash commit with a good title is the goal.
2. Check the title: the right type, a scope if useful, and a description that reads well in release notes. Fix the title yourself if needed.
3. Check for breaking changes. They need `!` in the title, otherwise the version bump will be wrong.
4. Squash and merge. The commit message is the PR title (with the PR number appended).

Because the version and the notes are derived from the squash commit, a wrong title cannot be fixed by editing it after the merge.

## Releasing

Everything except the final merge and the website deployment is automatic.

1. Whenever `dev` contains a releasable change (`feat`, `fix`, `perf` or a breaking change since the last release), the `Release preview` workflow opens a **draft** pull request `chore(release): next release` from `dev` to `main`. On every further push to `dev` it updates the description with the next version and the notes. With only `chore`, `ci`, `docs`, `refactor`, `test` or `build` changes, no PR is opened.
2. When you want to release, review the version and notes in the description, mark the PR **Ready for review**, wait for the checks and merge it with a **merge commit**.
3. The `Release` workflow runs on the push to `main`. It computes the version and the notes again, builds the website and creates the tag, the GitHub release (with the notes) and the zip `circuitikz-designer-web-vX.Y.Z.zip`.
4. Deploy the website manually: download the zip from the release and upload it to the server.

No commit is made for a release: the version in `package.json` (and the lockfile) is the placeholder `0.0.0` and is intentionally never changed. The tag is the source of truth. The release workflow runs `npm version <version> --no-git-tag-version` in the CI workspace before building, so only the released build contains the real version. Local and development builds show `v0.0.0`. Do not run `npm version` yourself or commit a version bump. Any future build job (for example Electron) needs the same step before it builds.

### Version rules

The version is calculated by `scripts/release.mjs` from the squashed commit titles since the latest `vX.Y.Z` tag:

| Base       | breaking | `feat` | `fix` / `perf` |
| ---------- | -------- | ------ | -------------- |
| 0.x        | minor    | minor  | patch          |
| 1.0 and up | major    | minor  | patch          |

Other types never release. A release is only created if at least one `feat`, `fix`, `perf` or breaking commit is included. The preview in the PR description shows exactly what would be released. Commits whose title is not a conventional commit are silently ignored, so if something is missing from the preview, check its title.

### Going to 1.0 (or overriding a version)

Add a label named `release-as:X.Y.Z` (for example `release-as:1.0.0`) to the release PR **before merging**. The description updates to the new version and the release uses it. The version must be greater than the latest release, otherwise the workflow fails with an error and nothing is released. The label can be created on the fly in the PR sidebar.

### Fixing a release PR

- **Wrong version or notes:** a title was wrong. The merged commit cannot be changed. Override the version with `release-as`, or edit the notes of the GitHub release after it has been created.
- **Release notes of an old commit are missing:** the commit title wasn't conventional. Add an empty commit with a proper `fix:` or `feat:` title through a PR (this is how the Firefox label fix was kept in the notes).
- **Release failed:** check the `Release` workflow run. Nothing is created until the last step, so fix the cause and re-run the workflow.

## Secrets and settings

- **GitHub App for the release PR:** the `Release preview` workflow opens and updates the release PR with a short-lived token of a GitHub App owned by the organization, so the PR is authored by the app (`<app name>[bot]`), not by a person. PRs opened with the default `GITHUB_TOKEN` don't run the pull request workflows, so the required checks would never report; that's why an app token is used. It needs:
    - the repository **variable** `RELEASE_APP_CLIENT_ID` (the app's client ID) and the repository **secret** `RELEASE_APP_PRIVATE_KEY` (the full content of a private key generated for the app),
    - an app with the repository permissions _Pull requests: read and write_ and _Contents: read_ (nothing else), installed on this repository only.

    Without the variable the workflow falls back to `GITHUB_TOKEN`: the PR is still opened and updated, but it has to be closed and reopened once to run the required checks. The token is created per run and expires after an hour, so there is nothing to renew. To rotate the key, generate a new private key in the app's settings, update the secret and delete the old key. Because the app authors the release PR, a maintainer can approve it themselves if approvals are required.

- **Default branch** is `dev`, so new pull requests target it by default.
- **Merge settings:** allow squash merging (default message: the PR title) and merge commits. Rebase merging can stay disabled.
- **Dependabot** (`.github/dependabot.yml`) opens grouped monthly dependency updates against `dev`. Major updates of `typescript`, `hotkeys-js` and `electron` are ignored and have to be done manually; the reasons are in the file.

## Workflows

| File                  | Trigger                          | Purpose                                        |
| --------------------- | -------------------------------- | ---------------------------------------------- |
| `ci.yml`              | every push, pull requests        | type check, formatting, build for `main`/`dev` |
| `pr-title.yml`        | pull requests                    | conventional commit check for the PR title     |
| `source-branch.yml`   | pull requests into `main`        | only `dev` may be merged into `main`           |
| `release-preview.yml` | push to `dev`, release PR events | opens/updates the draft release PR             |
| `release.yml`         | push to `main`                   | version, tag, GitHub release and website zip   |

When changing the release logic, `scripts/release.mjs` can be run locally:
`node scripts/release.mjs --ref origin/dev --preview` prints the next version and the notes without changing anything.
