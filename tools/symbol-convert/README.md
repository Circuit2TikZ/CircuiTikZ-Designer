# Symbol Convert

Generates the symbol database of CircuiTikZ-Designer, [`src/data/symbols.svg`](../../src/data/symbols.svg), from CircuiTikZ. The components and their options are defined in [`nodes.jsonc`](nodes.jsonc). Don't edit `symbols.svg` by hand, the next run overwrites it.

This tool was previously maintained in the [SymbolConvert](https://github.com/Circuit2TikZ/SymbolConvert) repository, which has the older history.

You only need it to add or change symbols, not to build or run the app.

## Dependencies

The output depends on the tool versions. These are the versions in use on Linux:

| Tool                  | Version                | Pinned by                             |
| --------------------- | ---------------------- | ------------------------------------- |
| CircuiTikZ            | 1.8.5                  | manual installation, see below        |
| TeX Live (`lualatex`) | 2026 (LuaHBTeX 1.24.0) | not pinned                            |
| `dvisvgm`             | 3.6 (from TeX Live)    | not pinned                            |
| svgo                  | 4.0.1                  | `package.json` in the repository root |
| Node.js               | 26.13.1                | not pinned                            |
| Python                | 3.12                   | `.python-version`                     |
| Python packages       | see `uv.lock`          | `uv.lock`                             |

### Python and svgo

You need [uv](https://docs.astral.sh/uv/) and Node.js with npm. In the repository root, run:

```bash
npm ci
```

There is no separate setup step for Python: the first run of the converter creates the environment in `tools/symbol-convert/.venv/` (and downloads Python if needed).

The converter finds the local svgo installation itself, you don't need to add it to your `PATH`.

### TeX Live

Install [TeX Live](https://tug.org/texlive/) and make sure that `lualatex` and `dvisvgm` are on your `PATH`.

### CircuiTikZ 1.8.5

TeX Live may contain another CircuiTikZ version. Newer versions change how some symbols are drawn. To use 1.8.5, install it into your personal TeX folder (`TEXMFHOME`). It then takes priority for **all** documents you compile. This overwrites any CircuiTikZ files already in that folder.

```bash
src="$(mktemp -d)"
git clone --depth 1 --branch v1.8.5 https://github.com/circuitikz/circuitikz.git "$src"
dest="$(kpsewhich -var-value=TEXMFHOME)/tex"
mkdir -p "$dest/latex/circuitikz" "$dest/generic/circuitikz"
cp "$src"/tex/*.sty "$src"/tex/circuitikz-*-body.tex "$dest/latex/circuitikz/"
cp "$src"/tex/pgfcirc*.tex "$src"/tex/ctikzstyle-*.tex "$dest/generic/circuitikz/"
```

These are bash commands. Check the result, it should show `1.8.5`:

```bash
grep 'def\\pgfcircversion{' "$(kpsewhich -progname=lualatex circuitikz.sty)"
```

## Usage

In the repository root, run:

```bash
npm run symbols
```

The result overwrites `src/data/symbols.svg`. Commit it together with your changes to the converter or `nodes.jsonc`.

Every run starts by deleting `build/` and creates all symbols again. The intermediate files of the last run stay in `build/`, e.g. to debug a failed one.
