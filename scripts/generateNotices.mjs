#!/usr/bin/env node
// Generates src/licenses/THIRD-PARTY-NOTICES.txt: the licenses of the third-party software that ships with the app.
//
//   npm run build && npm run notices         write the file (after changing dependencies)
//   npm run build && npm run notices:check   fail if a bundled package is missing in the file (used in CI)
//   --dist=<dir>                             read the build from another directory than dist/
// The build directory has to be clean: old build output (other hashes) would add packages that are gone.
//
// Which packages are included:
//  - every npm package whose code is in the bundles of the build: read from the source maps in dist/
//    (this also finds the Node polyfills and Parcel's runtime that are no regular dependencies)
//  - the packages only the desktop app adds (DESKTOP_EXTRAS) and the icon font package
// Fonts, icons and data that are no npm packages are described in the header of the file.
// The file is shown from the About dialog and shipped with every build.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUTPUT = path.join(root, "src/licenses/THIRD-PARTY-NOTICES.txt")

// packages the desktop app contains that are not in the bundles in dist/ (main.js requires the first one)
// and the icon font package (its font file is copied into dist/, no code)
const DESKTOP_EXTRAS = ["electron-squirrel-startup"]
const ICON_FONT_PACKAGE = "@fontsource/material-symbols-outlined"

// The license of these packages is wrong or missing in their metadata.
const OVERRIDES = {
	[ICON_FONT_PACKAGE]: {
		license: "Apache-2.0",
		textFile: "src/fonts/LICENSE-material-symbols.txt",
		note: "Material Symbols by Google. The metadata of the npm package says OFL-1.1, which doesn't match the license Google publishes for the font.",
	},
}

// Code that was compiled into another package and doesn't exist as a package of its own (found through the
// source map of the package that contains it).
const INLINED = {
	"core-js-pure": {
		version: "3.49.0",
		license: "MIT",
		homepage: "https://core-js.io",
		textFile: "src/licenses/LICENSE-core-js-pure.txt",
		note: "Compiled into @svgdotjs/svg.js by its authors.",
	},
}

function readJSON(file) {
	return JSON.parse(readFileSync(file, "utf8"))
}

/** Directory of a package for a dependency of `fromDir`, with node's lookup (nested node_modules first). */
function findPackageDir(name, fromDir) {
	let dir = fromDir
	while (true) {
		const candidate = path.join(dir, "node_modules", name)
		if (existsSync(path.join(candidate, "package.json"))) return candidate
		const parent = path.dirname(dir)
		if (parent === dir || !dir.startsWith(root)) return undefined
		dir = parent
	}
}

/** The package and its dependencies (not dev, optional or peer dependencies). */
function closure(name, fromDir, found = new Map()) {
	const dir = findPackageDir(name, fromDir)
	if (!dir || found.has(dir)) return found
	found.set(dir, name)
	for (const dep of Object.keys(readJSON(path.join(dir, "package.json")).dependencies ?? {})) {
		closure(dep, dir, found)
	}
	return found
}

/**
 * Package directories (absolute path -> name) of all node_modules code in the source maps of dist/, and the
 * names of packages in the maps that don't exist on disk.
 */
function bundledPackageDirs() {
	const distArg = process.argv.find((a) => a.startsWith("--dist="))
	const dist = path.resolve(root, distArg ? distArg.slice("--dist=".length) : "dist")
	const maps = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith(".map")) : []
	if (!maps.length) throw new Error(`No source maps in ${dist}. Run \`npm run build\` first.`)
	const bases = maps.map((f) => f.replace(/\.[0-9a-f]{8}\./, "."))
	if (new Set(bases).size !== bases.length) {
		throw new Error(`${dist} contains output of several builds (maps with the same name). Use an empty directory.`)
	}
	const dirs = new Map()
	const inlined = new Set()
	for (const map of maps) {
		for (const source of readJSON(path.join(dist, map)).sources ?? []) {
			const marker = source.lastIndexOf("node_modules/")
			if (marker === -1) continue
			const parts = source.slice(marker + "node_modules/".length).split("/")
			const name = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
			const dir = path.join(root, source.slice(0, marker), "node_modules", name)
			if (existsSync(path.join(dir, "package.json"))) dirs.set(dir, name)
			else inlined.add(name)
		}
	}
	return { dirs, inlined }
}

function collectPackages() {
	const { dirs, inlined } = bundledPackageDirs()
	for (const extra of [...DESKTOP_EXTRAS, ICON_FONT_PACKAGE]) closure(extra, root, dirs)
	const packages = []
	for (const [dir, name] of dirs) {
		const pkg = readJSON(path.join(dir, "package.json"))
		packages.push({ name, version: pkg.version, dir, pkg })
	}
	for (const name of [...inlined].filter((n) => !packages.some((p) => p.name === n))) {
		const entry = INLINED[name]
		if (!entry) {
			throw new Error(
				`${name} is compiled into a bundled package and not installed. Add it to INLINED in scripts/generateNotices.mjs with its license text.`
			)
		}
		packages.push({
			name,
			version: entry.version,
			pkg: { license: entry.license, homepage: entry.homepage },
			entry,
		})
	}
	// every dependency of the app has to be covered, otherwise it is neither in a bundle nor listed as an extra
	const names = new Set(packages.map((p) => p.name))
	const missing = Object.keys(readJSON(path.join(root, "package.json")).dependencies ?? {}).filter(
		(d) => !names.has(d)
	)
	if (missing.length) {
		throw new Error(
			`Dependencies without code in the build: ${missing.join(", ")}. Add them to DESKTOP_EXTRAS in scripts/generateNotices.mjs if the desktop app ships them.`
		)
	}
	return packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

function licenseId(pkg) {
	const l = pkg.license ?? pkg.licenses
	if (typeof l === "string") return l
	if (Array.isArray(l)) return l.map((x) => x.type ?? x).join(" OR ")
	return l?.type ?? "unknown"
}

function homepage(pkg) {
	const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url
	const url = pkg.homepage ?? repo ?? ""
	return url
		.replace(/^git\+/, "")
		.replace(/\.git$/, "")
		.replace(/^git:\/\//, "https://")
}

function licenseText(p) {
	const override = OVERRIDES[p.name] ?? p.entry
	if (override?.textFile) return readFileSync(path.join(root, override.textFile), "utf8").trim()
	if (!p.dir) return undefined
	const file = readdirSync(p.dir).find((f) => /^(licen[cs]e|copying|unlicense)([-._].*)?$/i.test(f))
	return file ? readFileSync(path.join(p.dir, file), "utf8").trim() : undefined
}

const LINE = "=".repeat(78)
const THIN = "-".repeat(78)

const HEADER = `THIRD-PARTY NOTICES
${LINE}

CircuiTikZ-Designer is licensed under the GNU General Public License v3.0 (the file LICENSE in the
repository). It contains the following third-party software, fonts and data, which are under their own
licenses. They are listed here together with their license texts. This file is generated by
scripts/generateNotices.mjs, do not edit it by hand.

ELECTRON AND CHROMIUM (desktop apps only)
${THIN}
The desktop apps are built with Electron (MIT license) and contain Chromium and further software. Their
license texts are in the files LICENSE and LICENSES.chromium.html next to the executable of the desktop app.

FONTS, ICONS AND DATA
${THIN}
- CMU Serif Roman (Computer Modern Unicode): the font of the text on the canvas, SIL Open Font License 1.1,
  copyright Andrey V. Panov and the authors of the original fonts, see the license text below.
- Material Symbols Outlined: the icon font, Apache License 2.0, copyright Google LLC. It is the npm package
  ${ICON_FONT_PACKAGE} further down.
- Bootstrap Icons 1.11.3 (https://icons.getbootstrap.com/): the icons of src/icons/bootstrap-icons.svg are a
  shortened copy, MIT license, copyright The Bootstrap Authors, see the license text below.
- Circuit symbols: src/data/symbols.svg contains symbols converted from the CircuiTikZ LaTeX package
  (https://github.com/circuitikz/circuitikz, copyright Romano Giannetti and contributors), which may be
  distributed under the LaTeX Project Public License and/or the GNU General Public License.

Some of the npm packages below contain the code of their own dependencies in their published files and
the licenses of those are published by the respective projects. Examples are MathJax (it bundles
speech-rule-engine, xmldom, wicked-good-xpath and commander, see https://github.com/mathjax/MathJax-src),
prettier and @svgdotjs/svg.js.

`

const FILES = [
	{
		title: "CMU Serif Roman (Computer Modern Unicode) - SIL Open Font License 1.1",
		file: "src/fonts/LICENSE-cmu-serif.txt",
	},
	{
		title: "Bootstrap Icons 1.11.3 - MIT License",
		file: "src/icons/LICENSE-bootstrap-icons.txt",
	},
]

function render(packages) {
	const out = [HEADER]
	for (const f of FILES) {
		out.push(`${f.title}\n${THIN}\n${readFileSync(path.join(root, f.file), "utf8").trim()}\n`)
	}
	out.push(`NPM PACKAGES\n${LINE}\n`)
	const printed = new Map() // license text -> first package that printed it
	for (const p of packages) {
		const url = homepage(p.pkg)
		const override = OVERRIDES[p.name] ?? p.entry
		const text = licenseText(p)
		const lines = [`${p.name}@${p.version}`, `License: ${override?.license ?? licenseId(p.pkg)}`]
		if (url) lines.push(`Source: ${url}`)
		if (override?.note) lines.push(`Note: ${override.note}`)
		lines.push("")
		if (!text) {
			lines.push("The package doesn't contain a license file, its package.json declares the license above.")
		} else if (printed.has(text)) {
			lines.push(`(license text identical to the one of ${printed.get(text)})`)
		} else {
			printed.set(text, `${p.name}@${p.version}`)
			lines.push(text)
		}
		out.push(lines.join("\n") + "\n\n" + THIN + "\n")
	}
	return out.join("\n")
}

function main() {
	const check = process.argv.includes("--check")
	const packages = collectPackages()
	if (check) {
		const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : ""
		// only the names: version updates by Dependabot don't have to be written down, a new package has to
		const missing = packages.filter((p) => !current.includes(`\n${p.name}@`))
		if (missing.length) {
			console.error(
				`${path.relative(root, OUTPUT)} doesn't list: ${missing.map((p) => p.name).join(", ")}\n` +
					"Run `npm run build && npm run notices` and commit the result."
			)
			process.exit(1)
		}
		console.log(`All ${packages.length} packages are listed in ${path.relative(root, OUTPUT)}.`)
		return
	}
	writeFileSync(OUTPUT, render(packages))
	console.log(`Wrote ${path.relative(root, OUTPUT)} with ${packages.length} packages.`)
}

main()
