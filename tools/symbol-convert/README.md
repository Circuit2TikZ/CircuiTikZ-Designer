# Symbol Convert

Generates the symbol database of CircuiTikZ-Designer, [`src/data/symbols.svg`](../../src/data/symbols.svg), from CircuiTikZ. The components and their options are defined in [`nodes.jsonc`](nodes.jsonc) (node-style components) and [`paths.jsonc`](paths.jsonc) (path-style components). Don't edit `symbols.svg` by hand, the next run overwrites it.

This tool was previously maintained in the [SymbolConvert](https://github.com/Circuit2TikZ/SymbolConvert) repository, which has the older history.

You only need it to add or change symbols, not to build or run the app.

## Dependencies

The output depends on the tool versions. These are the versions in use on Linux:

| Tool                  | Version                | Pinned by                                            |
| --------------------- | ---------------------- | ---------------------------------------------------- |
| CircuiTikZ            | 1.8.5                  | `toolchain.py`, installed by `npm run symbols:setup` |
| TeX Live (`lualatex`) | 2026 (LuaHBTeX 1.24.0) | not pinned, other versions give a warning            |
| `dvisvgm`             | 3.6 (from TeX Live)    | not pinned, other versions give a warning            |
| svgo                  | 4.0.1                  | `package.json` in the repository root                |
| Node.js               | 26.13.1                | not pinned                                           |
| Python                | 3.12                   | `.python-version`                                    |
| Python packages       | see `uv.lock`          | `uv.lock`                                            |

### Python and svgo

You need [uv](https://docs.astral.sh/uv/) and Node.js with npm. In the repository root, run:

```bash
npm ci
```

There is no separate setup step for Python: the first run of the converter creates the environment in `tools/symbol-convert/.venv/` (and downloads Python if needed).

The converter finds the local svgo installation itself, you don't need to add it to your `PATH`.

### TeX Live

Install [TeX Live](https://tug.org/texlive/) and make sure that `lualatex`, `kpsewhich` and `dvisvgm` are on your `PATH`.

### CircuiTikZ

Newer CircuiTikZ versions change how some symbols are drawn, so the converter uses its own copy of the version listed above. Install it once, in the repository root:

```bash
npm run symbols:setup
```

This downloads the release, verifies its files with a checksum and puts them into `tools/symbol-convert/.circuitikz/`. Only the converter uses this copy, it doesn't change your TeX installation or other documents. It takes priority over the CircuiTikZ of TeX Live and of your personal TeX folder.

## Usage

In the repository root, run:

```bash
npm run symbols
```

The result overwrites `src/data/symbols.svg`, and its checksums are saved in `checksums.txt`. Commit both together with your changes to the converter or the component files, also if `symbols.svg` didn't change.

Every run starts by deleting `build/` and creates all symbols again. The intermediate files of the last run stay in `build/`, e.g. to debug a failed one.

### Is `symbols.svg` up to date?

```bash
npm run symbols:check
```

This check is **only informative**. It compares the current files with the checksums which the last successful run saved in [`checksums.txt`](checksums.txt). It doesn't run the converter and doesn't need TeX. It answers two questions:

- **Is `symbols.svg` the file which the converter wrote?** A manual edit shows a mismatch.
- **Do you need to run the converter again?** Changes since the last run are listed: the files of this folder which can affect the output (component files, code, TeX templates, `uv.lock`, ...) and the svgo version in `package.json`. Not every change affects the output, e.g. a new comment. After a run the check passes again, even if `symbols.svg` stays the same.

A passing check doesn't prove that the symbols are correct, and it can't detect:

- someone editing `checksums.txt` by hand,
- other tools on your computer, e.g. another version of TeX, its packages or `dvisvgm`,
- updates of the packages which svgo depends on.

CI runs the check as `symbols (informative)`. If it fails, you can still merge. If two branches both changed `symbols.svg`, `checksums.txt` has a merge conflict: combine the other changes, then run the converter again, which rewrites the file.

Which files are left out is listed in [`checksums.py`](checksums.py), new files in this folder are included automatically.

### Checks and errors

Before `build/` is deleted, the converter checks the tools and their versions, that TeX uses its CircuiTikZ copy, and the component files against their schemas ([`nodes.schema.json`](nodes.schema.json) and [`paths.schema.json`](paths.schema.json), with shared definitions in [`common.schema.json`](common.schema.json)). Unknown keys and components or options which result in the same symbol ID are errors. All problems are listed at once.

If symbols fail during the conversion, the first ones are printed with their component and its position in `nodes.jsonc` or `paths.jsonc`, for LaTeX errors with the relevant part of the log. All of them are in `build/errors.log`, the full TeX logs of failed symbols stay in `build/`. `symbols.svg` is only written if every symbol was converted.
