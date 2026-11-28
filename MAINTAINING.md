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
| `pr-title`      | `pr-title.yml`      | `dev`, `main` |
| `source-branch` | `source-branch.yml` | `main`        |

- `check` runs the type check and the formatting check on every push and pull request. `build` runs the production build, the [third-party notices](#third-party-notices) check and a desktop packaging test for `main`, `dev` and pull requests targeting them.
- `symbols (informative)` (`ci.yml`) is **not** a required check. It fails if `src/data/symbols.svg` or the symbol converter changed since the last recorded converter run, see [tools/symbol-convert](tools/symbol-convert/README.md#is-symbolssvg-up-to-date). Check its result on `dev` before a release.
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
3. The `Release` workflow runs on the push to `main`. It computes the version and the notes again, builds the website and the desktop app, and only when every build succeeded creates the tag and the GitHub release (with the notes and all files). If a build fails, nothing is released: fix the cause, or re-run the failed jobs from the Actions tab, and the release follows.
4. Deploy the website manually: download the zip from the release and upload it to the server.

The release contains:

| File                                          | Content                               |
| --------------------------------------------- | ------------------------------------- |
| `circuitikz-designer-web-vX.Y.Z.zip`          | the website (what you deploy)         |
| `circuitikz-designer-X.Y.Z-win-x64-setup.exe` | Windows installer (Squirrel)          |
| `CircuiTikZ-Designer-win32-x64-X.Y.Z.zip`     | Windows, portable                     |
| `circuitikz-designer_X.Y.Z_amd64.deb`         | Debian/Ubuntu and derivatives (x64)   |
| `circuitikz-designer-X.Y.Z-1.x86_64.rpm`      | Fedora/openSUSE and derivatives (x64) |
| `CircuiTikZ-Designer-linux-x64-X.Y.Z.zip`     | Linux, any distribution, portable     |
| `CircuiTikZ-Designer-darwin-arm64-X.Y.Z.zip`  | macOS (Apple Silicon)                 |
| `SHA256SUMS.txt`                              | checksums of all files above          |

The desktop apps are **not code signed**. Windows shows a SmartScreen warning ("Windows protected your PC", then "More info", then "Run anyway") and macOS refuses to open the unsigned app at first (right click the app, "Open", or remove the quarantine flag). Signing needs a paid Apple Developer account for macOS and a certificate (or a signing service) for Windows, and is not set up yet. There is no Intel macOS or arm64 Linux build yet.

**Dry run:** to test the builds without releasing, run the `Release` workflow manually (Actions tab → Release → Run workflow, optionally with a dummy version). It builds the website and the desktop apps for all platforms and keeps the files as workflow artifacts for 3 days. It creates no tag and no release. Do this after changing the desktop packaging or the release workflow.

The desktop packaging is configured in `forge.config.js`, the icons are in `src/icons/` (`app.ico` and `app.icns` are generated from `android-icon-512x512.png`). Pull requests only run a packaging smoke test on Linux (`electron-forge package` in the `build` check), the installers are built by the release workflow. To try the packaging locally: `npm run package` (`npm run make` also creates the installers, which needs `dpkg`, `fakeroot` and `rpmbuild` on Linux). The source maps in `dist/` are not packaged into the desktop apps. The website zip contains them, so that errors on the deployed website can be debugged.

No commit is made for a release: the version in `package.json` (and the lockfile) is the placeholder `0.0.0` and is intentionally never changed. The tag is the source of truth. The website and desktop jobs of the release workflow run `npm version <version> --no-git-tag-version` in the CI workspace before building, so only the released builds contain the real version. Local and development builds show `v0.0.0`. Do not run `npm version` yourself or commit a version bump. A new build job in the release workflow needs the same step before it builds.

### Version rules

The version is calculated by `scripts/release.mjs` from the squashed commit titles since the latest `vX.Y.Z` tag:

| Base       | breaking | `feat` | `fix` / `perf` |
| ---------- | -------- | ------ | -------------- |
| 0.x        | minor    | minor  | patch          |
| 1.0 and up | major    | minor  | patch          |

Other types never release. A release is only created if at least one `feat`, `fix`, `perf` or breaking commit is included, or if the version is [overridden](#going-to-10-or-overriding-a-version). The preview in the PR description shows exactly what would be released. Commits whose title is not a conventional commit are silently ignored, so if something is missing from the preview, check its title.

### Going to 1.0 (or overriding a version)

Add a label named `release-as:X.Y.Z` (for example `release-as:1.0.0`) to the release PR **before merging**. The description updates to the new version and the release uses it. The version must be greater than the latest release, otherwise the workflow fails with an error and nothing is released. The label can be created on the fly in the PR sidebar.

### Fixing a release PR

- **Wrong version or notes:** a title was wrong. The merged commit cannot be changed. Override the version with `release-as`, or edit the notes of the GitHub release after it has been created.
- **Release notes of an old commit are missing:** the commit title wasn't conventional. Add an empty commit with a proper `fix:` or `feat:` title through a PR (this is how the Firefox label fix was kept in the notes).
- **Release failed:** check the `Release` workflow run. Nothing is created until the last step, so fix the cause and re-run the workflow.

## Third-party notices

Every build ships `src/licenses/THIRD-PARTY-NOTICES.txt` (linked from the About dialog) with the licenses of the third-party packages, fonts and icons it contains. The file is generated by `scripts/generateNotices.mjs` from the source maps of a build, so it lists exactly the packages whose code is in the bundles, plus what only the desktop app ships (`electron-squirrel-startup`) and the icon font package.

- The `build` check runs `npm run notices:check`. It fails if a package is in the bundles but missing in the file, and tells you what to do. Version updates alone don't make it fail.
- After adding a dependency (or when a new package shows up in the bundles): build into an **empty** directory and regenerate, then commit the file:
    ```sh
    npx parcel build --public-url ./ --dist-dir /tmp/notices-build
    node scripts/generateNotices.mjs --dist=/tmp/notices-build
    ```
    (`npm run build && npm run notices` works too if `dist/` is clean, the script refuses to read a `dist/` with the output of several builds.)
- The script stops with an error for things it can't resolve by itself: a dependency whose code isn't in any bundle (add it to `DESKTOP_EXTRAS` if the desktop app ships it), or code that was compiled into another package (add it to `INLINED` with its license text). Packages whose metadata has a wrong license go to `OVERRIDES`.
- Fonts, icons and other data that aren't npm packages are described in the header of the file (in the script). Add new ones there, with the license text in `src/fonts/` or `src/icons/`, and link the license from the About dialog if the license requires the text to be shown.
- The notices of the desktop runtime (Electron and Chromium) are the files `LICENSE` and `LICENSES.chromium.html` next to the executable, they are created by Electron's packager.

## Secrets and settings

- **GitHub App for the release PR:** the `Release preview` workflow opens and updates the release PR with a short-lived token of a GitHub App owned by the organization, so the PR is authored by the app (`<app name>[bot]`), not by a person. PRs opened with the default `GITHUB_TOKEN` don't run the pull request workflows, so the required checks would never report; that's why an app token is used. It needs:
    - the repository **variable** `RELEASE_APP_CLIENT_ID` (the app's client ID) and the repository **secret** `RELEASE_APP_PRIVATE_KEY` (the full content of a private key generated for the app),
    - an app with the repository permissions _Pull requests: read and write_ and _Contents: read_ (nothing else), installed on this repository only.

    Without the variable the workflow falls back to `GITHUB_TOKEN`: the PR is still opened and updated, but it has to be closed and reopened once to run the required checks. The token is created per run and expires after an hour, so there is nothing to renew. To rotate the key, generate a new private key in the app's settings, update the secret and delete the old key. Because the app authors the release PR, a maintainer can approve it themselves if approvals are required.

- **Default branch** is `dev`, so new pull requests target it by default.
- **Merge settings:** allow squash merging (default message: the PR title) and merge commits. Rebase merging can stay disabled.
- **Dependabot** (`.github/dependabot.yml`) opens monthly updates against `dev`, for npm packages (grouped) and GitHub Actions. All updates of `svgo` and major updates of `typescript`, `hotkeys-js`, `electron` and `mathjax` are ignored and have to be done manually; the reasons are in the file. The Python packages of the symbol converter are not covered.

## Workflows

| File                  | Trigger                          | Purpose                                                    |
| --------------------- | -------------------------------- | ---------------------------------------------------------- |
| `ci.yml`              | every push, pull requests        | type check, formatting, symbol check, build `main`/`dev`   |
| `pr-title.yml`        | pull requests                    | conventional commit check for the PR title                 |
| `source-branch.yml`   | pull requests into `main`        | only `dev` may be merged into `main`                       |
| `release-preview.yml` | push to `dev`, release PR events | opens/updates the draft release PR                         |
| `release.yml`         | push to `main`                   | version, tag, GitHub release, website zip and desktop apps |

When changing the release logic, `scripts/release.mjs` can be run locally:
`node scripts/release.mjs --ref origin/dev --preview` prints the next version and the notes without changing anything.
