import {
	ComponentSymbol,
	DiagnosticsCollector,
	DrawStatement,
	ImportResult,
	MainController,
	NodeStatement,
	TikzCoordinate,
	TikzDocument,
	TikzOption,
	TikzOptionList,
	TikzPathConnector,
	TikzPathElement,
	TikzStatement,
	parseTikz,
} from "../internal"
import type { ComponentSaveObject } from "../internal"

/**
 * Stage 6/7 — translate a parsed {@link TikzDocument} into Designer
 * {@link ComponentSaveObject}s. The output plugs straight into `applyImportResult`, which hands
 * each entry to `CircuitComponent.fromJson`.
 *
 * The translation is deliberately best-effort:
 *  • Anything we can't map lands in diagnostics (warning for "skipped", info for "approximated").
 *  • We never throw — a surprising construct is always better to flag and skip than to abort.
 *  • Diagnostics carry the original line/column so the Import Report modal can point at the
 *    offending source.
 *
 * The transformer isn't a full CircuiTikZ compiler. It's a pragmatic importer whose target is
 * CircuiTikZ output produced by Designer, and hand-written CircuiTikZ that stays within the set
 * of primitives Designer itself can produce. Things it understands:
 *
 *   • `\draw (a,b) to[R=1] (c,d);`             → PathSymbolComponent
 *   • `\draw (a,b) -- (c,d);` / `-|` / `|-`    → WireComponent(s)
 *   • `\draw (a,b) -- (c,d) -- (e,f);`         → multi-segment WireComponent
 *   • `\node[nmos] (M1) at (x,y) {};`          → NodeSymbolComponent
 *   • `\node (n1) at (x,y) {text};`            → RectangleComponent with text
 *   • Named references `(R1)` / `(R1.north)`   → resolved against earlier coordinates
 *   • `\coordinate (p) at (x,y);`              → adds a named point (no component)
 *   • `\ctikzset{...}`, `\usetikzlibrary{...}` → already hoisted by the parser; ignored here
 *
 * Things it doesn't handle (and why):
 *   • Arbitrary Bezier curves / `plot` / `arc`  — Designer has no equivalent primitive.
 *   • `pic`, `rectangle`, `circle` filled shapes — partial support via shape detection below.
 */
export function transformTikz(sourceText: string): ImportResult {
	const collector = new DiagnosticsCollector(sourceText)
	const doc = parseTikz(sourceText, collector)
	const ctx = new TransformContext(collector)

	const components: ComponentSaveObject[] = []
	for (const stmt of doc.statements) {
		try {
			const produced = transformStatement(stmt, ctx)
			if (produced && produced.length > 0) components.push(...produced)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			collector.error("Internal error while converting a statement — skipping it.", {
				line: stmt.line,
				column: stmt.column,
				code: "transform-internal",
				suggestion: "Raw message: " + msg,
			})
		}
	}

	// If we parsed something but produced nothing, and there are no errors yet, that's a notable
	// silent failure — surface it so the user isn't left staring at an empty canvas wondering why.
	if (components.length === 0 && doc.statements.length > 0 && !collector.hasErrors()) {
		collector.warning("The CircuiTikZ code parsed cleanly but didn't produce any components I could render.", {
			code: "transform-empty",
			suggestion:
				"Check that the file contains \\draw / \\node statements at the top level. Lines hidden inside a \\begin{tikzpicture} are fine — just make sure they use recognised components.",
		})
	}

	const hasErrors = collector.hasErrors()
	return {
		format: "tikz",
		success: components.length > 0 && !hasErrors ? true : components.length > 0,
		components,
		diagnostics: collector.all(),
		sourceText,
	}
}

// ===================================================================================== //
// Transform context: symbol lookup, named-point table, diagnostics
// ===================================================================================== //

/**
 * CircuiTikZ short-form aliases. In CircuiTikZ itself, `to[R=1k]` expands into the currently
 * configured resistor symbol (american or european depending on `\ctikzset{resistors/style=...}`).
 * The Designer's symbol library stores the expanded names (`"american resistor"`, …) so we need
 * this map to resolve the short form.
 *
 * Each entry lists candidate long-names in preference order — if the first isn't available (some
 * bundles ship only one style), the next is tried. Lowercase keys; lookup lowercases the input.
 */
const CIRCUITIKZ_ALIASES: Record<string, string[]> = {
	// Passives
	r: ["american resistor", "european resistor", "generic"],
	vr: ["american potentiometer", "european potentiometer", "american resistor"],
	l: ["american inductor", "cute inductor", "european inductor"],
	vl: ["american inductor", "cute inductor"],
	c: ["capacitor"],
	vc: ["capacitor"],
	// Diodes
	d: ["empty diode", "full diode", "empty led", "full led"],
	led: ["empty led", "full led"],
	zd: ["empty Zener diode", "full Zener diode"],
	zzd: ["empty ZZener diode", "full ZZener diode"],
	sd: ["empty Schottky diode", "full Schottky diode"],
	td: ["empty tunnel diode", "full tunnel diode"],
	pd: ["empty photodiode", "full photodiode"],
	tvsd: ["empty TVS diode", "full TVS diode"],
	sr: ["empty Shockley diode", "full Shockley diode"],
	// Sources
	v: ["american voltage source", "european voltage source", "battery"],
	i: ["american current source", "european current source"],
	sv: ["sinusoidal voltage source", "american voltage source"],
	si: ["sinusoidal current source", "american current source"],
	iv: ["american voltage source"],
	// Meters
	ammeter: ["ammeter"],
	voltmeter: ["voltmeter"],
	ohmmeter: ["rmeter"],
	// Switches / misc
	sw: ["cute switch", "switch"],
	short: [], // `to[short]` means "just a wire" — empty candidate list so we fall through to wire.
	battery: ["battery"],
	battery1: ["battery1"],
	battery2: ["battery2"],
	lamp: ["lamp"],
	bulb: ["lamp"],
	ground: ["ground"],
}

class TransformContext {
	/** `MainController.instance.symbols` snapshot — captured once per import for speed. */
	private readonly symbols: ComponentSymbol[]
	/**
	 * Index from tikzName (both the canonical version and the dash-separated variant seen in
	 * CircuiTikZ) to the ComponentSymbol.
	 */
	private readonly symbolsByTikzName: Map<string, ComponentSymbol> = new Map()
	/** Resolved named points (`\coordinate (p) at (0,0)` or `\node (M1) at (...)`). */
	private readonly namedPoints: Map<string, { x: number; y: number }> = new Map()

	constructor(public readonly collector: DiagnosticsCollector) {
		this.symbols = MainController.instance?.symbols ?? []
		for (const s of this.symbols) {
			if (s.tikzName) {
				this.symbolsByTikzName.set(s.tikzName, s)
				// Some CircuiTikZ authors write "american-resistor" for "american resistor" when
				// dashes are stripped from spaces — accept both.
				this.symbolsByTikzName.set(s.tikzName.replace(/\s+/g, "-"), s)
				// Lowercase variant so case-insensitive lookup works for all symbols.
				this.symbolsByTikzName.set(s.tikzName.toLowerCase(), s)
			}
		}
	}

	findSymbol(name: string): ComponentSymbol | undefined {
		// 1. Direct match (canonical, dash-to-space, or lowercased form).
		const direct =
			this.symbolsByTikzName.get(name) ??
			this.symbolsByTikzName.get(name.replace(/-/g, " ")) ??
			this.symbolsByTikzName.get(name.toLowerCase())
		if (direct) return direct
		// 2. CircuiTikZ short-form aliases (R, V, L, C, D, ...). Try each candidate long-name in
		// preference order until one resolves.
		const aliases = CIRCUITIKZ_ALIASES[name.toLowerCase()]
		if (aliases) {
			for (const candidate of aliases) {
				const hit = this.symbolsByTikzName.get(candidate) ?? this.symbolsByTikzName.get(candidate.toLowerCase())
				if (hit) return hit
			}
		}
		return undefined
	}

	rememberPoint(name: string, point: { x: number; y: number }): void {
		this.namedPoints.set(name, point)
	}

	lookupPoint(name: string): { x: number; y: number } | undefined {
		return this.namedPoints.get(name)
	}
}

// ===================================================================================== //
// Statement dispatch
// ===================================================================================== //

function transformStatement(stmt: TikzStatement, ctx: TransformContext): ComponentSaveObject[] | null {
	switch (stmt.kind) {
		case "draw":
			return transformDraw(stmt, ctx)
		case "node":
			return transformNode(stmt, ctx)
		// Environment-level statements were hoisted by the parser already.
		case "begin-tikzpicture":
		case "end-tikzpicture":
		case "ctikzset":
		case "usetikzlibrary":
			return null
		case "unknown":
			// A diagnostic was already emitted at parse-time; no extra noise here.
			return null
		default:
			return null
	}
}

// ===================================================================================== //
// \draw and \path statements
// ===================================================================================== //

/**
 * Convert a `\draw` statement into one or more save objects. A single `\draw` can produce:
 *  • zero components (if it's malformed or empty),
 *  • one path-symbol (`\draw (a) to[R] (b);`),
 *  • one or more wire segments joined at corner points,
 *  • embedded node components for any inline `node[...]{...}` in the path.
 */
function transformDraw(stmt: DrawStatement, ctx: TransformContext): ComponentSaveObject[] {
	const produced: ComponentSaveObject[] = []

	// 1. Resolve all coordinates in order and note which connector separates each pair.
	const resolved = resolvePathElements(stmt.elements, ctx, stmt.line)
	if (resolved.points.length < 2) {
		// Nothing drawable. If there's an embedded node, emit that; otherwise warn.
		if (resolved.embeddedNodes.length > 0) {
			for (const en of resolved.embeddedNodes) produced.push(en)
			return produced
		}
		ctx.collector.info("A \\draw statement didn't have at least two coordinates — ignoring it.", {
			line: stmt.line,
			column: stmt.column,
			code: "transform-draw-sparse",
		})
		return produced
	}

	// 2. Shape detection — `(a) rectangle (b)` produces a RectangleComponent.
	const shapeElem = resolved.connectors.find((c) => c.keyword === "rectangle" || c.keyword === "circle")
	if (shapeElem && resolved.points.length === 2) {
		if (shapeElem.keyword === "rectangle") {
			produced.push(buildRectangleSave(resolved.points[0], resolved.points[1], stmt))
		} else {
			produced.push(buildEllipseSave(resolved.points[0], resolved.points[1], stmt))
		}
		for (const en of resolved.embeddedNodes) produced.push(en)
		return produced
	}

	// 3. Walk the connector list and emit a path-symbol for each `to[Symbol=...]` clause, grouping
	// runs of plain connectors (--, -|, |-) into wires. This handles both the simple
	//   \draw (a) to[R=1k] (b);
	// and the chained CircuiTikZ idiom
	//   \draw (a) to[V] (b) to[R] (c) to[R] (d) -- (a);
	// without the chained form collapsing into a single unadorned wire.
	const topLevelHit = stmt.options ? findSymbolInOptions(stmt.options.entries, ctx, false) : null
	let topLevelApplied = false

	// Wire-run buffer state.
	let wireStart = -1
	let wireDirs: string[] = []
	let wireStartArrow: string | undefined
	let wireEndArrow: string | undefined

	const flushWire = (endPointIdx: number) => {
		if (wireStart === -1) return
		const segPoints = resolved.points.slice(wireStart, endPointIdx + 1)
		if (segPoints.length >= 2) {
			const save: any = {
				type: "wire",
				points: segPoints,
				directions: wireDirs.slice(),
			}
			if (wireStartArrow) save.startArrow = wireStartArrow
			if (wireEndArrow) save.endArrow = wireEndArrow
			produced.push(save as ComponentSaveObject)
		}
		wireStart = -1
		wireDirs = []
		wireStartArrow = undefined
		wireEndArrow = undefined
	}

	for (let i = 0; i < resolved.connectors.length; i++) {
		const c = resolved.connectors[i]
		let symbolHit: { symbol: ComponentSymbol; options: TikzOption[]; matchedKey: string } | null = null
		if (c.toOptions) symbolHit = findSymbolInOptions(c.toOptions.entries, ctx, false)
		// `\draw[R] (a) -- (b)` idiom: top-level symbol applies to the single segment if no
		// to-clause claimed it. We only apply it once.
		if (!symbolHit && topLevelHit && !topLevelApplied && resolved.connectors.length === 1) {
			symbolHit = topLevelHit
			topLevelApplied = true
		}

		if (symbolHit) {
			flushWire(i)
			produced.push(buildPathSymbolSave(symbolHit, resolved.points[i], resolved.points[i + 1], stmt, ctx))
			continue
		}

		// Plain connector — extend the current wire run.
		if (wireStart === -1) wireStart = i
		const op = c.operator
		let dir = "--"
		if (op === "-|") dir = "-|"
		else if (op === "|-") dir = "|-"
		else if (op === "->") wireEndArrow = wireEndArrow ?? "to.tip"
		else if (op === "<-") wireStartArrow = wireStartArrow ?? "to.tip"
		else if (op === "<->") {
			wireStartArrow = wireStartArrow ?? "to.tip"
			wireEndArrow = wireEndArrow ?? "to.tip"
		} else if (op !== "--" && op !== "to") {
			ctx.collector.info(`Treating path connector '${op}' as a straight wire.`, {
				line: c.line,
				column: c.column,
				code: "transform-connector",
			})
		}
		wireDirs.push(dir)
	}
	flushWire(resolved.points.length - 1)

	for (const en of resolved.embeddedNodes) produced.push(en)
	return produced
}

// ------------- Resolve a path's elements into a coord / connector sequence --------------- //

interface ResolvedPath {
	/** Concrete points in Designer pixel space — first to last along the path. */
	points: { x: number; y: number }[]
	/** One less than `points.length`; describes what joined points[i] to points[i+1]. */
	connectors: ResolvedConnector[]
	/** Embedded `node[...]{...}` save-objects picked up along the path. */
	embeddedNodes: ComponentSaveObject[]
}

interface ResolvedConnector {
	operator: string
	/** A path-keyword picked up between coordinates, e.g. "to", "rectangle", "circle". */
	keyword?: string
	toOptions?: TikzOptionList
	line: number
	column: number
}

function resolvePathElements(elements: TikzPathElement[], ctx: TransformContext, stmtLine: number): ResolvedPath {
	const points: { x: number; y: number }[] = []
	const connectors: ResolvedConnector[] = []
	const embeddedNodes: ComponentSaveObject[] = []
	// Pending connector bookkeeping — the operator/keyword collected since the last coordinate.
	let pendingConn: ResolvedConnector | null = null

	const flushPendingIfCoordinatePresent = () => {
		// When a connector was declared but didn't get a trailing coordinate (e.g. trailing "--"),
		// we drop it silently.
		pendingConn = null
	}

	for (let i = 0; i < elements.length; i++) {
		const el = elements[i]
		switch (el.kind) {
			case "coord": {
				const last = points[points.length - 1]
				const abs = coordToAbsolute(el.coord, ctx, last, el.line)
				if (!abs) break
				// Apply ++ relative semantics.
				let p = abs
				if (el.relative && last) p = { x: last.x + abs.x, y: last.y + abs.y }
				points.push(p)
				if (pendingConn && points.length > 1) {
					connectors.push(pendingConn)
					pendingConn = null
				}
				break
			}
			case "named-point": {
				const pt = ctx.lookupPoint(el.name)
				if (!pt) {
					ctx.collector.warning(
						`Named point '${el.name}' isn't defined — skipping the coordinate (anchors are not supported).`,
						{
							line: el.line,
							column: el.column,
							code: "transform-named-point",
							suggestion:
								"Named points must be declared with \\coordinate or \\node earlier in the file. Anchors like (R1.north) aren't supported yet — use a plain coordinate instead.",
						}
					)
					flushPendingIfCoordinatePresent()
					break
				}
				points.push(pt)
				if (pendingConn && points.length > 1) {
					connectors.push(pendingConn)
					pendingConn = null
				}
				break
			}
			case "connector": {
				// Multiple connectors in a row usually means the source wrote something like "-- --";
				// just use the latest one.
				pendingConn = { operator: el.operator, line: el.line, column: el.column }
				break
			}
			case "to": {
				// "to[options]" — like a single connector with options attached.
				pendingConn = {
					operator: "to",
					keyword: "to",
					toOptions: el.options,
					line: el.line,
					column: el.column,
				}
				break
			}
			case "embedded-node": {
				// Embedded nodes attach to the previous coordinate — convert and continue.
				const pos = points[points.length - 1]
				if (pos) {
					// Register the node's name (if any) so later `(drain)` or `(M1)` references
					// can resolve. Covers both `coordinate (drain)` (pure bookkeeping, no body)
					// and `node[nmos] (M1) {}` (named symbol placement).
					if (el.name) ctx.rememberPoint(el.name, pos)
					const save = buildEmbeddedNodeSave(el, pos, ctx)
					if (save) embeddedNodes.push(save)
				} else {
					ctx.collector.info("An inline node appeared before any coordinate — skipping it.", {
						line: el.line,
						column: el.column,
						code: "transform-embedded-node-orphan",
					})
				}
				break
			}
			case "unknown-element": {
				// A stray keyword — "rectangle", "circle", "arc", etc. Tag as the connector's
				// keyword so shape detection can use it.
				if (pendingConn) {
					pendingConn.keyword = el.source.trim() || pendingConn.keyword
				} else {
					pendingConn = {
						operator: "--",
						keyword: el.source.trim(),
						line: el.line,
						column: el.column,
					}
					if (el.source.trim() !== "rectangle" && el.source.trim() !== "circle") {
						ctx.collector.info(
							`Path keyword '${el.source.trim()}' isn't fully supported — treating it as a straight connection.`,
							{
								line: el.line,
								column: el.column,
								code: "transform-path-keyword",
							}
						)
					}
				}
				break
			}
		}
	}

	void stmtLine // reserved for future "path didn't start with a coordinate" diagnostics
	return { points, connectors, embeddedNodes }
}

// ------------- Path-symbol detection --------------------------------------------------- //

/**
 * Walk option entries looking for the first one whose key matches a known symbol's tikzName —
 * directly or through the CircuiTikZ short-form alias table.
 * `nodeMode` restricts to node symbols for \node statements.
 * `matchedKey` is the original option key the user wrote (e.g. "R") — needed later to recognise
 * the "R=1k" label idiom when the symbol's long tikzName is "american resistor".
 */
function findSymbolInOptions(
	entries: TikzOption[],
	ctx: TransformContext,
	nodeMode: boolean
): { symbol: ComponentSymbol; options: TikzOption[]; matchedKey: string } | null {
	for (const e of entries) {
		const candidate = ctx.findSymbol(e.key)
		if (candidate && candidate.isNodeSymbol === nodeMode) {
			return { symbol: candidate, options: entries, matchedKey: e.key }
		}
	}
	return null
}

// ------------- PathSymbolComponent save-object ------------------------------------------- //

function buildPathSymbolSave(
	hit: { symbol: ComponentSymbol; options: TikzOption[]; matchedKey: string },
	start: { x: number; y: number },
	end: { x: number; y: number },
	stmt: DrawStatement,
	ctx: TransformContext
): ComponentSaveObject {
	// Collect any extra options the symbol recognises — best-effort string matching against
	// possibleOptions and enumOptions.
	const recognised: string[] = []
	const known = new Set<string>()
	for (const o of hit.symbol.possibleOptions) known.add(o.name)
	for (const e of hit.symbol.possibleEnumOptions) for (const o of e.options) known.add(o.name)
	for (const o of hit.options) {
		if (o.key === hit.matchedKey || o.key === hit.symbol.tikzName) continue
		if (known.has(o.key)) recognised.push(o.key)
	}

	// Capture `name=...` and `<label>=value` where present. We recognise `=value` on the symbol's
	// primary key as the component label (the "R=1k" idiom). The primary key is whatever the user
	// wrote — either the CircuiTikZ short form (R) or the canonical tikzName (american resistor).
	let label: string | undefined
	let name: string | undefined
	for (const o of hit.options) {
		if ((o.key === hit.matchedKey || o.key === hit.symbol.tikzName) && o.value) label = o.value
		if (o.key === "name" && o.value) name = o.value
	}

	const save: any = {
		type: "path",
		id: hit.symbol.tikzName,
		points: [start, end],
	}
	if (recognised.length > 0) save.options = recognised
	if (name) save.name = name
	if (label) {
		save.label = { value: label }
		// Diagnostic: labels are a best-effort port, and math-mode users might have richer labels.
		ctx.collector.info(
			`Imported label "${label}" as plain text — you may want to re-wrap it in $...$ for math mode.`,
			{ line: stmt.line, column: stmt.column, code: "transform-label-plain" }
		)
	}
	return save as ComponentSaveObject
}

// ------------- Shape primitives --------------------------------------------------------- //

function buildRectangleSave(a: { x: number; y: number }, b: { x: number; y: number }, stmt: DrawStatement): ComponentSaveObject {
	const x = (a.x + b.x) / 2
	const y = (a.y + b.y) / 2
	const w = Math.abs(a.x - b.x)
	const h = Math.abs(a.y - b.y)
	return {
		type: "rect",
		position: { x, y },
		size: { x: w, y: h },
	} as unknown as ComponentSaveObject
	// Note: stmt retained for future stroke/fill extraction from options.
	void stmt
}

function buildEllipseSave(a: { x: number; y: number }, b: { x: number; y: number }, stmt: DrawStatement): ComponentSaveObject {
	// CircuiTikZ `circle` uses the second coord's x as radius. We support the common form
	// `(cx,cy) circle (r)` by interpreting b as {x:r, y:r}.
	const position = { x: a.x, y: a.y }
	// Designer's ellipse size is {x:radiusX, y:radiusY} — default to equal radii for circles.
	const radius = Math.abs(b.x) || Math.abs(b.y) || 10
	return {
		type: "ellipse",
		position,
		size: { x: radius, y: radius },
	} as unknown as ComponentSaveObject
	void stmt
}

// ===================================================================================== //
// \node and \coordinate statements
// ===================================================================================== //

function transformNode(stmt: NodeStatement, ctx: TransformContext): ComponentSaveObject[] | null {
	// Resolve the coordinate first so it's available both for the output and for the named-point
	// table.
	let pos: { x: number; y: number } | undefined
	if (stmt.at) {
		const abs = coordToAbsolute(stmt.at, ctx, undefined, stmt.line)
		if (abs) pos = abs
	}

	if (stmt.name && pos) ctx.rememberPoint(stmt.name, pos)

	// \coordinate (without a label) is pure bookkeeping — no visible component.
	if (stmt.command === "coordinate") return null

	if (!pos) {
		ctx.collector.warning("A \\node didn't have an 'at (x,y)' position I could understand — skipping it.", {
			line: stmt.line,
			column: stmt.column,
			code: "transform-node-no-pos",
			suggestion: "Write the position as `at (x,y)` with numeric coordinates.",
		})
		return null
	}

	// Did the user tag it with a node-symbol name?
	if (stmt.options) {
		const hit = findSymbolInOptions(stmt.options.entries, ctx, true)
		if (hit) {
			const save: any = {
				type: "node",
				id: hit.symbol.tikzName,
				position: pos,
			}
			if (stmt.name) save.name = stmt.name
			const rotation = numericOption(stmt.options.entries, "rotate") ?? numericOption(stmt.options.entries, "rotation")
			if (rotation !== undefined) save.rotation = rotation
			if (stmt.label && stmt.label.length > 0) save.label = { value: stmt.label }
			return [save as ComponentSaveObject]
		}
	}

	// Fall-back: a plain node with a label renders as a rectangle with text.
	const textContent = stmt.label ?? ""
	const save: any = {
		type: "rect",
		position: pos,
		size: { x: estimateTextWidthPx(textContent), y: 24 },
	}
	if (stmt.name) save.name = stmt.name
	if (textContent.length > 0) {
		save.text = { text: textContent }
	}
	return [save as ComponentSaveObject]
}

function buildEmbeddedNodeSave(
	el: Extract<TikzPathElement, { kind: "embedded-node" }>,
	pos: { x: number; y: number },
	ctx: TransformContext
): ComponentSaveObject | null {
	// Try to match a node-symbol tag first.
	if (el.options) {
		const hit = findSymbolInOptions(el.options.entries, ctx, true)
		if (hit) {
			const save: any = { type: "node", id: hit.symbol.tikzName, position: pos }
			if (el.name) save.name = el.name
			if (el.label && el.label.length > 0) save.label = { value: el.label }
			return save as ComponentSaveObject
		}
	}
	// Fallback — a labelled rectangle.
	const text = el.label ?? ""
	const save: any = {
		type: "rect",
		position: pos,
		size: { x: estimateTextWidthPx(text), y: 24 },
	}
	if (el.name) save.name = el.name
	if (text.length > 0) save.text = { text }
	return save as ComponentSaveObject
}

// ===================================================================================== //
// Coordinate conversion
// ===================================================================================== //

/**
 * Convert a parsed {@link TikzCoordinate} into Designer pixel space.
 * CircuiTikZ uses centimetres with Y pointing up; Designer uses pixels with Y pointing down.
 *
 * Returns undefined if we can't make sense of the coordinate (e.g. a raw fallback that isn't a
 * recognisable format). That always emits a diagnostic.
 */
function coordToAbsolute(
	coord: TikzCoordinate,
	ctx: TransformContext,
	_relativeOrigin: { x: number; y: number } | undefined,
	fallbackLine: number
): { x: number; y: number } | undefined {
	switch (coord.kind) {
		case "xy": {
			const x = toPixels(coord.x, coord.xUnit ?? "cm")
			const y = -toPixels(coord.y, coord.yUnit ?? "cm")
			return { x, y }
		}
		case "named": {
			const p = ctx.lookupPoint(coord.name)
			if (p) return p
			ctx.collector.warning(`Coordinate refers to unknown point '${coord.name}'.`, {
				line: coord.line || fallbackLine,
				column: coord.column,
				code: "transform-coord-named",
				suggestion: "Make sure the name was defined earlier with \\coordinate or \\node.",
			})
			return undefined
		}
		case "polar": {
			const theta = (coord.angle * Math.PI) / 180
			const r = toPixels(coord.radius, coord.radiusUnit ?? "cm")
			return { x: Math.cos(theta) * r, y: -Math.sin(theta) * r }
		}
		case "intersection": {
			// TikZ's `(A |- B)` / `(A -| B)` shorthand: take x from one named point and y
			// from the other. Emit a targeted warning if either side is unknown so the user
			// sees which name needs to be declared, rather than a generic "couldn't parse".
			const xp = ctx.lookupPoint(coord.xFrom)
			const yp = ctx.lookupPoint(coord.yFrom)
			if (!xp || !yp) {
				const missing = [!xp && coord.xFrom, !yp && coord.yFrom].filter(Boolean).join(", ")
				ctx.collector.warning(
					`Intersection coordinate references unknown point${missing.includes(",") ? "s" : ""} '${missing}' — using (0,0) as a fallback.`,
					{
						line: coord.line || fallbackLine,
						column: coord.column,
						code: "transform-coord-intersection",
						suggestion: "Both sides of '|-' / '-|' must be declared earlier with \\coordinate or \\node.",
					}
				)
				return { x: xp?.x ?? 0, y: yp?.y ?? 0 }
			}
			return { x: xp.x, y: yp.y }
		}
		case "raw": {
			ctx.collector.warning(
				`Couldn't parse coordinate '${coord.raw}' — using (0,0) as a fallback so the rest of the path still imports.`,
				{
					line: coord.line || fallbackLine,
					column: coord.column,
					code: "transform-coord-raw",
					suggestion: "Supported forms are (x,y), (angle:radius), and named references like (R1).",
				}
			)
			return { x: 0, y: 0 }
		}
	}
}

const CM_TO_PX = 4800 / 127 // matches impSVGNumber.unitConvertMap.cm.px

function toPixels(value: number, unit: string): number {
	switch (unit) {
		case "cm":
			return value * CM_TO_PX
		case "mm":
			return value * (CM_TO_PX / 10)
		case "in":
			return value * 96
		case "pt":
			return value * (4 / 3)
		case "em":
			// Rough approximation: 1em ≈ 10pt at default document size.
			return value * 10 * (4 / 3)
		case "ex":
			return value * 5 * (4 / 3)
		case "px":
			return value
		default:
			return value * CM_TO_PX
	}
}

// ===================================================================================== //
// Utility helpers
// ===================================================================================== //

function numericOption(entries: TikzOption[], key: string): number | undefined {
	for (const e of entries) {
		if (e.key === key && e.value) {
			const n = parseFloat(e.value)
			if (!Number.isNaN(n)) return n
		}
	}
	return undefined
}

/**
 * Rough text-width estimate for fallback rectangles. Designer's auto-sizing kicks in once the
 * text field is set, so this only affects the initial placeholder box — better to err a bit wide
 * than to have a tiny unreadable box. ~9px per character is a reasonable mean for 12pt sans.
 */
function estimateTextWidthPx(text: string): number {
	const len = text.length || 1
	return Math.max(40, Math.min(500, len * 9))
}

/** Unused at runtime; kept so downstream modules can reference TikzPathConnector strictly. */
export type __ConnectorAlias = TikzPathConnector
