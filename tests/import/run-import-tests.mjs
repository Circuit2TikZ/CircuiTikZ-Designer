#!/usr/bin/env node
/**
 * Minimal fixture harness for the TikZ import pipeline.
 *
 * Runs on Node 22's native TypeScript support (`--experimental-strip-types`). We deliberately
 * bypass the `internal.ts` barrel because it re-exports DOM-only modules (SVG.js controllers)
 * that break under Node. Instead we import tikzLexer.ts / tikzParser.ts / diagnostics.ts
 * directly and provide hand-written fixtures.
 *
 * To run:
 *   node --experimental-strip-types tests/import/run-import-tests.mjs
 *
 * The harness returns a non-zero exit code on any assertion failure so it's trivially wireable
 * into CI. No external test framework required.
 */

// --- Local import paths (bypass barrel) ------------------------------------------------ //
// The internal.ts barrel pulls in SVG.js and controllers which aren't safe to import under
// Node. `tikzLexer` has no runtime deps; `tikzParser` only imports from `internal` — but only
// the *type* of DiagnosticsCollector + tikzLexer output. We stub-import from a narrow shim.

import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const rootSrc = path.resolve(here, "../../src/scripts")

// Node strips TS at import time when the extension is .ts; our files are .ts so this works.
const { tokenizeTikz } = await import(`${rootSrc}/import/tikzLexer.ts`)
const diagnosticsMod = await import(`${rootSrc}/import/diagnostics.ts`)
const parserMod = await import(`${rootSrc}/import/tikzParser.ts`)
const { DiagnosticsCollector } = diagnosticsMod
const { parseTikz } = parserMod

// --- Tiny assertion helpers -------------------------------------------------------------- //

let failures = 0
let passes = 0

function assert(cond, label, detail) {
	if (cond) {
		passes++
		return
	}
	failures++
	console.error(`  ✗ ${label}`)
	if (detail !== undefined) console.error("    " + detail)
}

function eqDeep(a, b) {
	return JSON.stringify(a) === JSON.stringify(b)
}

function summary(title) {
	console.log(`\n=== ${title} ===`)
}

// --- Fixture: basic lexer behaviour ------------------------------------------------------- //

summary("Lexer: path operators and numbers")
{
	const collector = new DiagnosticsCollector("\\draw (0,0) -- (1.5cm, -2.5e-1) to[R=1k] (3,4);")
	const toks = tokenizeTikz(collector.sourceText, collector)
	const types = toks.map((t) => t.type)
	assert(types[0] === "COMMAND", "Starts with COMMAND", `got ${types[0]}`)
	assert(types.includes("OPERATOR"), "Contains OPERATOR token")
	const semiIdx = types.indexOf("SEMICOLON")
	assert(semiIdx > 0, "Has terminating SEMICOLON")
	assert(types[types.length - 1] === "EOF", "Ends with EOF")

	// Verify the 1.5cm number carries its unit.
	const cmTok = toks.find((t) => t.type === "NUMBER" && t.parsed?.unit === "cm")
	assert(!!cmTok, "Picks up cm-suffixed number")
	assert(cmTok.parsed.numeric === 1.5, "Parses 1.5 as numeric", `got ${cmTok?.parsed?.numeric}`)

	// Negative exponent.
	const negExp = toks.find((t) => t.type === "NUMBER" && Math.abs(t.parsed?.numeric + 0.25) < 1e-9)
	assert(!!negExp, "Parses -2.5e-1 as -0.25")
}

summary("Lexer: ILLEGAL character produces diagnostic, not a throw")
{
	const collector = new DiagnosticsCollector("\\draw \u0000 (0,0);")
	const toks = tokenizeTikz(collector.sourceText, collector)
	const illegal = toks.find((t) => t.type === "ILLEGAL")
	assert(!!illegal, "Emits an ILLEGAL token for NUL")
	assert(collector.count("warning") >= 1, "Emits a warning diagnostic")
}

// --- Fixture: parser AST shapes ---------------------------------------------------------- //

summary("Parser: simple wire")
{
	const src = "\\draw (0,0) -- (2,3);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	assert(doc.statements.length === 1, "One statement")
	const stmt = doc.statements[0]
	assert(stmt.kind === "draw", "Statement is a draw")
	assert(stmt.elements.length === 3, "Three path elements (coord, connector, coord)", `got ${stmt.elements.length}`)
	assert(stmt.elements[0].kind === "coord", "First element is a coord")
	assert(stmt.elements[1].kind === "connector", "Middle element is a connector")
	assert(stmt.elements[1].operator === "--", "Connector is '--'")
	assert(stmt.elements[2].kind === "coord", "Third element is a coord")
	assert(collector.count("error") === 0, "No errors", JSON.stringify(collector.all()))
}

summary("Parser: to[R=1k] path-symbol")
{
	const src = "\\draw (0,0) to[R=1k] (2,0);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const stmt = doc.statements[0]
	const toEl = stmt.elements.find((e) => e.kind === "to")
	assert(!!toEl, "Has a 'to' path element")
	assert(!!toEl.options && toEl.options.entries.length > 0, "to[...] has options")
	const rOpt = toEl.options?.entries.find((o) => o.key === "R")
	assert(!!rOpt, "R option was extracted")
	assert(rOpt.value === "1k", `R's value is "1k"`, `got "${rOpt?.value}"`)
}

summary("Parser: tikzpicture environment + options")
{
	const src = "\\begin{tikzpicture}[thick]\n  \\draw (0,0) -- (1,0);\n\\end{tikzpicture}"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	assert(!!doc.environmentOptions, "Captured environment options")
	assert(doc.environmentOptions?.entries.some((o) => o.key === "thick"), "'thick' key present in environment options")
	assert(doc.statements.some((s) => s.kind === "draw"), "Draw inside the env is still a top-level statement")
}

summary("Parser: \\ctikzset aggregation")
{
	const src = "\\ctikzset{resistors/scale=1.2}\n\\ctikzset{americanresistors}\n\\draw (0,0) -- (1,0);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	assert(doc.ctikzsetOptions.entries.length >= 2, "Aggregates both \\ctikzset declarations", `got ${doc.ctikzsetOptions.entries.length}`)
	assert(
		doc.ctikzsetOptions.entries.some((o) => o.key.includes("resistors/scale")),
		"First setting key preserved"
	)
}

summary("Parser: recovery from a broken line")
{
	const src = "\\garbage;\n\\draw (0,0) -- (1,0);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	// An unknown command at the top level should not prevent the following \draw from parsing.
	const draw = doc.statements.find((s) => s.kind === "draw")
	assert(!!draw, "\\draw still parsed despite a preceding unknown statement")
	assert(collector.count("warning") >= 1, "Emitted at least one warning for the unknown command")
}

summary("Parser: labelled node")
{
	const src = "\\node [nmos] (M1) at (2,3) {$M_1$};"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const node = doc.statements.find((s) => s.kind === "node")
	assert(!!node, "Node parsed")
	assert(node.name === "M1", `Name is M1`, `got ${node?.name}`)
	assert(node.label === "$M_1$", `Label preserved verbatim`, `got ${node?.label}`)
	assert(
		node.at?.kind === "xy" && node.at.x === 2 && node.at.y === 3,
		`Position is (2,3)`,
		`got ${JSON.stringify(node?.at)}`
	)
}

summary("Parser: polar coordinate")
{
	const src = "\\draw (0,0) -- (45:2cm);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const coord = doc.statements[0].elements.find((e) => e.kind === "coord" && e.coord.kind === "polar")
	assert(!!coord, "Polar coordinate recognised")
	assert(coord.coord.angle === 45, "Angle 45°")
	assert(coord.coord.radius === 2 && coord.coord.radiusUnit === "cm", "Radius 2cm")
}

summary("Parser: missing semicolon -> warning, still recovers")
{
	const src = "\\draw (0,0) -- (1,0)\n\\draw (0,0) -- (0,1);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const draws = doc.statements.filter((s) => s.kind === "draw")
	assert(draws.length === 2, "Both \\draw statements survived", `got ${draws.length}`)
	assert(
		collector.all().some((d) => d.code === "parse-missing-semicolon"),
		"Emitted 'parse-missing-semicolon' diagnostic"
	)
}

summary("Parser: named point with anchor")
{
	const src = "\\coordinate (A) at (0,0);\n\\draw (A.north) -- (1,1);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const draw = doc.statements.find((s) => s.kind === "draw")
	const named = draw.elements.find((e) => e.kind === "named-point")
	assert(!!named, "Parses (A.north) as a named-point element")
	assert(named.name === "A" && named.anchor === "north", "Name and anchor extracted")
}

summary("Parser: embedded node inside a path")
{
	const src = "\\draw (0,0) -- (2,0) node[above] (lbl) {$V_{cc}$};"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const draw = doc.statements[0]
	const embedded = draw.elements.find((e) => e.kind === "embedded-node")
	assert(!!embedded, "Embedded node element present")
	assert(embedded.name === "lbl", "Name captured")
	assert(embedded.label === "$V_{cc}$", `Label preserved`, `got ${embedded?.label}`)
}

summary("Parser: multi-segment bent wire")
{
	const src = "\\draw (0,0) -- (2,0) -| (4,2) |- (6,2);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const draw = doc.statements[0]
	const ops = draw.elements.filter((e) => e.kind === "connector").map((c) => c.operator)
	assert(eqDeep(ops, ["--", "-|", "|-"]), "Connectors in correct order", `got ${JSON.stringify(ops)}`)
}

summary("Parser: op-amp anchor sign-names (oa.-) / (oa.+)")
{
	// Op-amp pins in CircuiTikZ are named `-` (inverting) and `+` (non-inverting). The lexer
	// must tokenize the bare signs as IDENTIFIERs so the paren rule can match `IDENT . IDENT`.
	const src = "\\draw (oa.-) -- (1,1); \\draw (oa.+) -- (1,0);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	// No lex-illegal warnings for the signs.
	const illegals = collector.all().filter((d) => d.code === "lex-illegal")
	assert(illegals.length === 0, "No ILLEGAL warnings for '-' / '+' as anchor names",
		`got ${illegals.length}: ${illegals.map((d) => d.message).join("; ")}`)
	const named = doc.statements.flatMap((s) => s.elements ?? []).filter((e) => e.kind === "named-point")
	assert(named.length === 2, "Both (oa.-) and (oa.+) parse as named-points", `got ${named.length}`)
	assert(named[0].name === "oa" && named[0].anchor === "-", "oa.- captured", `got ${JSON.stringify(named[0])}`)
	assert(named[1].name === "oa" && named[1].anchor === "+", "oa.+ captured", `got ${JSON.stringify(named[1])}`)
}

summary("Lexer: math-mode label with leading sign stays silent")
{
	// `{$+V_{CC}$}` used to emit an ILLEGAL warning for the inner '+'. The label body is
	// reconstructed from source slice, so the rendered label is already correct — the only
	// visible regression would be the extra warning, which this test guards against.
	const src = "\\node at (0,0) {$+V_{CC}$};"
	const collector = new DiagnosticsCollector(src)
	parseTikz(src, collector)
	const illegals = collector.all().filter((d) => d.code === "lex-illegal")
	assert(illegals.length === 0, "No ILLEGAL warnings for signs inside math labels",
		`got ${illegals.length}`)
}

summary("Lexer: annotation-position modifiers i^= / v^= tokenize cleanly")
{
	// CircuiTikZ uses `i^=...` and `v^=...` to place a current or voltage label above the
	// component (the `_` counterpart places it below). Before the fix the `^` caret tripped
	// the ILLEGAL-char fallback even though the rendered label was still correct. This test
	// guards against the regression for both `i^` and `v^` modifiers.
	const src = "\\draw (0,0) to[R, l=$R_C$, i^=$I_C$, v^=$V_R$] (2,0);"
	const collector = new DiagnosticsCollector(src)
	parseTikz(src, collector)
	const illegals = collector.all().filter((d) => d.code === "lex-illegal")
	assert(illegals.length === 0, "No ILLEGAL warnings for caret inside option keys",
		`got ${illegals.length}: ${illegals.map((d) => d.message).join("; ")}`)
}

summary("Parser: \\node at (name.anchor) accepts named-points")
{
	// `at (ant.north)` used to be silently dropped by the `at`-clause handler because
	// only numeric / polar coords were accepted. The resulting stmt.at was undefined,
	// so the node was skipped with a "didn't have an 'at (x,y)' position" warning.
	const src = "\\coordinate (ant) at (5,5); \\node[above] at (ant.north) {2.4 GHz};"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const nodeStmt = doc.statements.find((s) => s.command === "node")
	assert(nodeStmt?.at?.kind === "named", "at-clause parsed as a named coord", `got ${nodeStmt?.at?.kind}`)
	assert(nodeStmt.at.name === "ant" && nodeStmt.at.anchor === "north",
		"name / anchor preserved", `got ${JSON.stringify(nodeStmt.at)}`)
	const skipWarnings = collector.all().filter((d) => d.code === "transform-node-no-pos")
	assert(skipWarnings.length === 0, "No 'no at (x,y) position' warnings", `got ${skipWarnings.length}`)
}

summary("Parser: coordinate-intersection shorthand (A |- B) / (A -| B)")
{
	// TikZ's perp-of-two-points. Semantics:
	//   (A |- B) = (A.x, B.y) — "go down from A, then across to B"
	//   (A -| B) = (B.x, A.y) — "go across from A, then up to B"
	const src = "\\coordinate (A) at (1,5); \\coordinate (B) at (4,2); \\draw (A) -- (A |- B) -- (A -| B);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const drawStmt = doc.statements.find((s) => s.kind === "draw")
	const coords = drawStmt.elements.filter((e) => e.kind === "coord").map((c) => c.coord)
	const intersections = coords.filter((c) => c.kind === "intersection")
	assert(intersections.length === 2, "Both intersections parsed", `got ${intersections.length}`)
	assert(intersections[0].xFrom === "A" && intersections[0].yFrom === "B",
		"|- takes x from left, y from right", `got ${JSON.stringify(intersections[0])}`)
	assert(intersections[1].xFrom === "B" && intersections[1].yFrom === "A",
		"-| takes x from right, y from left", `got ${JSON.stringify(intersections[1])}`)
	const rawWarnings = collector.all().filter((d) => d.code === "transform-coord-raw")
	assert(rawWarnings.length === 0, "No raw-coord fallback warnings", `got ${rawWarnings.length}`)
}

summary("Parser: compound anchor names like (ic.pin 15)")
{
	// CircuiTikZ's DIP-chip / multi-pin components expose anchor names that contain a space,
	// such as `(ic.pin 15)`, `(ic.pin 1)`, `(ic.pin edge)`. The named-point rule needs to
	// absorb the trailing IDENTIFIER/NUMBER tokens into the anchor and preserve the spacing.
	const src = "\\draw (ic.pin 15) -- (ic.pin 1) -- (chip.pin edge);"
	const collector = new DiagnosticsCollector(src)
	const doc = parseTikz(src, collector)
	const named = doc.statements.flatMap((s) => s.elements ?? []).filter((e) => e.kind === "named-point")
	assert(named.length === 3, "All three compound-anchor parens parse as named-points", `got ${named.length}`)
	assert(named[0].name === "ic" && named[0].anchor === "pin 15", "pin 15 preserved", `got ${JSON.stringify(named[0])}`)
	assert(named[1].name === "ic" && named[1].anchor === "pin 1", "pin 1 preserved", `got ${JSON.stringify(named[1])}`)
	assert(named[2].name === "chip" && named[2].anchor === "pin edge", "pin edge preserved", `got ${JSON.stringify(named[2])}`)
	// No "Couldn't parse coordinate" warnings should be emitted by the parser.
	const rawWarnings = collector.all().filter((d) => d.code === "transform-coord-raw")
	assert(rawWarnings.length === 0, "No raw-coordinate fallback warnings", `got ${rawWarnings.length}`)
}

// --- Done -------------------------------------------------------------------------------- //

console.log(`\n${passes} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
