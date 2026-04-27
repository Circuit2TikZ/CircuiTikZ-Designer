import type { DiagnosticsCollector } from "./diagnostics"
import { tokenizeTikz } from "./tikzLexer"
import type { TikzToken, TikzTokenType } from "./tikzLexer"

// ===================================================================================== //
// AST node types
// ===================================================================================== //
//
// The AST is deliberately flat and "forgiving" — we parse structure (draws, nodes, options,
// coordinates, operators) but don't enforce semantics. Bad or unrecognised fragments survive
// as `UnknownFragment` or `UnknownStatement` nodes with a note attached, so the transformer can
// either try to recover them or skip them gracefully.
//
// All nodes carry a `line`/`column` where they start in the original source, so diagnostics the
// transformer raises later can still point at the right spot.

export interface TikzDocument {
	statements: TikzStatement[]
	/** The environment options captured from \begin{tikzpicture}[...] if present. */
	environmentOptions: TikzOptionList | undefined
	/** Any \ctikzset{...} statements encountered at the top level, concatenated in order. */
	ctikzsetOptions: TikzOptionList
	/** Any \usetikzlibrary{a,b,c} libraries declared at the top level. */
	usedLibraries: string[]
}

export type TikzStatement =
	| DrawStatement
	| NodeStatement
	| CtikzsetStatement
	| UseTikzLibraryStatement
	| BeginTikzPictureStatement
	| EndTikzPictureStatement
	| UnknownStatement

export interface BaseNode {
	line: number
	column: number
}

/** `\draw [options] <path elements> ;` — also covers `\path`. */
export interface DrawStatement extends BaseNode {
	kind: "draw"
	/** The command name without the backslash — "draw", "path", "draw*". */
	command: string
	options: TikzOptionList | undefined
	elements: TikzPathElement[]
}

/** `\node [options] (name) at (x,y) {label} ;` */
export interface NodeStatement extends BaseNode {
	kind: "node"
	/** Command name — "node", "coordinate". */
	command: string
	options: TikzOptionList | undefined
	name: string | undefined
	at: TikzCoordinate | undefined
	label: string | undefined
	/** If `\coordinate` or a plain node without a label was used, this is true. */
	labelOmitted: boolean
}

/** `\ctikzset{option list}` */
export interface CtikzsetStatement extends BaseNode {
	kind: "ctikzset"
	options: TikzOptionList
}

/** `\usetikzlibrary{a, b}` */
export interface UseTikzLibraryStatement extends BaseNode {
	kind: "usetikzlibrary"
	libraries: string[]
}

/** `\begin{tikzpicture}[options]` */
export interface BeginTikzPictureStatement extends BaseNode {
	kind: "begin-tikzpicture"
	options: TikzOptionList | undefined
}

/** `\end{tikzpicture}` */
export interface EndTikzPictureStatement extends BaseNode {
	kind: "end-tikzpicture"
}

/** An uninterpreted statement we couldn't match — preserved so the user sees it in diagnostics. */
export interface UnknownStatement extends BaseNode {
	kind: "unknown"
	/** Original source text, trimmed to a reasonable length. */
	source: string
	reason: string
}

// ------------ Path elements ---------------------------------------------------------------- //
//
// A `\draw` statement is a sequence of path elements separated by connectors and terminated by ';'.
// We group them into coordinates, named points (`(name)`), connectors (`--`, `-|`, etc), "to"
// specifiers, embedded nodes (`node[...]{...}` inside a path), and unknown blobs.

export type TikzPathElement =
	| TikzPathCoordinate
	| TikzPathNamedPoint
	| TikzPathConnector
	| TikzPathToClause
	| TikzPathEmbeddedNode
	| TikzPathUnknown

export interface TikzPathCoordinate extends BaseNode {
	kind: "coord"
	/** Present when the source wrote "++" before the coordinate — relative displacement. */
	relative: boolean
	coord: TikzCoordinate
}

export interface TikzPathNamedPoint extends BaseNode {
	kind: "named-point"
	name: string
	/** Optional `.anchor` suffix, e.g. (R1.north). */
	anchor?: string
}

export interface TikzPathConnector extends BaseNode {
	kind: "connector"
	/** Raw operator as written: "--", "-|", "|-", "->", "<-", "<->", "-->". */
	operator: string
}

export interface TikzPathToClause extends BaseNode {
	kind: "to"
	options: TikzOptionList | undefined
}

export interface TikzPathEmbeddedNode extends BaseNode {
	kind: "embedded-node"
	options: TikzOptionList | undefined
	name: string | undefined
	label: string | undefined
}

export interface TikzPathUnknown extends BaseNode {
	kind: "unknown-element"
	source: string
	reason: string
}

// ------------ Coordinates & options --------------------------------------------------------- //

/**
 * A coordinate can be numeric (`(x, y)`), named (`(R1)` / `(R1.north)`), or polar (`(90:1cm)`).
 * Unresolvable forms are preserved verbatim as `raw` so the transformer can fall back.
 */
export type TikzCoordinate =
	| { kind: "xy"; x: number; y: number; xUnit?: string; yUnit?: string; line: number; column: number }
	| { kind: "named"; name: string; anchor?: string; line: number; column: number }
	| { kind: "polar"; angle: number; radius: number; radiusUnit?: string; line: number; column: number }
	/**
	 * TikZ coordinate-intersection shorthand:
	 *   `(A |- B)` → (A.x, B.y)  — vertical-from-A, horizontal-to-B
	 *   `(A -| B)` → (B.x, A.y)  — horizontal-from-A, vertical-to-B
	 * `xFrom` is the named point contributing the x coord, `yFrom` the y.
	 */
	| { kind: "intersection"; xFrom: string; yFrom: string; line: number; column: number }
	| { kind: "raw"; raw: string; line: number; column: number }

/**
 * A parsed CircuiTikZ/TikZ option list — the `[...]` bracket section.
 *
 * Options are key/value pairs but most CircuiTikZ component-name tokens are bare keys (no "=")
 * whose value is the empty string. We keep the raw source too so fine-grained things the parser
 * didn't understand can still be displayed back to the user.
 */
export interface TikzOptionList extends BaseNode {
	entries: TikzOption[]
	/** The original text inside the brackets, without surrounding [ and ]. */
	raw: string
}

export interface TikzOption {
	key: string
	value: string | undefined
	line: number
	column: number
}

// ===================================================================================== //
// Parser entry point
// ===================================================================================== //

/**
 * Parse CircuiTikZ source into a {@link TikzDocument}.
 *
 * Error recovery strategy: when a statement fails to parse, we emit a warning + an
 * {@link UnknownStatement} and advance to the next plausible statement boundary
 * (a `;`, a top-level `\draw`/`\node`/`\ctikzset`/`\begin`/`\end`, or EOF). This keeps one bad
 * line from wrecking the whole import.
 */
export function parseTikz(source: string, collector: DiagnosticsCollector): TikzDocument {
	const tokens = tokenizeTikz(source, collector)
	const parser = new TikzParser(tokens, collector)
	return parser.parseDocument()
}

class TikzParser {
	private pos = 0

	constructor(
		private readonly tokens: TikzToken[],
		private readonly collector: DiagnosticsCollector
	) {}

	// ------------- Document level ---------------------------------------------------------- //

	parseDocument(): TikzDocument {
		const doc: TikzDocument = {
			statements: [],
			environmentOptions: undefined,
			ctikzsetOptions: { entries: [], raw: "", line: 0, column: 0 },
			usedLibraries: [],
		}

		while (!this.isAtEnd()) {
			// Comments sit anywhere and are harmless.
			if (this.match("COMMENT")) continue

			const startTok = this.peek()
			try {
				const stmt = this.parseStatement()
				if (stmt) {
					doc.statements.push(stmt)
					// Hoist environment-level bookkeeping.
					if (stmt.kind === "begin-tikzpicture" && stmt.options) {
						doc.environmentOptions = stmt.options
					} else if (stmt.kind === "ctikzset") {
						// Aggregate every \ctikzset entry so the transformer has a flat list.
						for (const e of stmt.options.entries) doc.ctikzsetOptions.entries.push(e)
						if (doc.ctikzsetOptions.raw.length > 0 && stmt.options.raw.length > 0) {
							doc.ctikzsetOptions.raw += ", " + stmt.options.raw
						} else if (stmt.options.raw.length > 0) {
							doc.ctikzsetOptions.raw = stmt.options.raw
						}
					} else if (stmt.kind === "usetikzlibrary") {
						for (const lib of stmt.libraries) doc.usedLibraries.push(lib)
					}
				}
			} catch (err) {
				// Any unexpected exception inside statement parsing is recovered here.
				const msg = err instanceof Error ? err.message : String(err)
				this.collector.error("Couldn't parse a statement — skipping to the next one.", {
					line: startTok.line,
					column: startTok.column,
					code: "parse-statement",
					suggestion: "Raw parser message: " + msg,
				})
				doc.statements.push({
					kind: "unknown",
					line: startTok.line,
					column: startTok.column,
					source: this.captureSliceUntilSync(startTok),
					reason: msg,
				})
				this.synchronize()
			}
		}

		return doc
	}

	// ------------- Statement dispatch ------------------------------------------------------ //

	private parseStatement(): TikzStatement | null {
		const tok = this.peek()

		// Top-level \begin{...} and \end{...}.
		if (tok.type === "COMMAND" && tok.parsed?.name === "begin") {
			return this.parseBegin()
		}
		if (tok.type === "COMMAND" && tok.parsed?.name === "end") {
			return this.parseEnd()
		}

		// \ctikzset{...}
		if (tok.type === "COMMAND" && tok.parsed?.name === "ctikzset") {
			return this.parseCtikzset()
		}

		// \usetikzlibrary{...} (also \tikzstyle is ignored for now — covered by UnknownStatement)
		if (tok.type === "COMMAND" && tok.parsed?.name === "usetikzlibrary") {
			return this.parseUseTikzLibrary()
		}

		// \draw / \path / \draw*
		if (tok.type === "COMMAND" && (tok.parsed?.name === "draw" || tok.parsed?.name === "path" || tok.parsed?.name === "draw*" || tok.parsed?.name === "path*")) {
			return this.parseDraw()
		}

		// \node / \coordinate
		if (tok.type === "COMMAND" && (tok.parsed?.name === "node" || tok.parsed?.name === "coordinate")) {
			return this.parseNode()
		}

		// Anything else at the top level: consume up to the next `;` or command as an unknown
		// statement. We only warn for COMMANDs (bare identifiers outside statements are usually
		// leftovers from options that were already consumed).
		if (tok.type === "COMMAND") {
			this.collector.warning(
				`I don't know what to do with the command '\\${tok.parsed?.name ?? tok.value}' at the top level — skipping it.`,
				{
					line: tok.line,
					column: tok.column,
					code: "parse-unknown-command",
					suggestion:
						"Only \\draw, \\node, \\coordinate, \\path, \\ctikzset, \\usetikzlibrary, \\begin and \\end are understood. The rest of the circuit will still be imported.",
				}
			)
		}

		const captured = this.captureSliceUntilSync(tok)
		const stmt: UnknownStatement = {
			kind: "unknown",
			line: tok.line,
			column: tok.column,
			source: captured,
			reason: `unrecognised token '${tok.value}'`,
		}
		this.synchronize()
		return stmt
	}

	// ------------- \begin / \end ----------------------------------------------------------- //

	private parseBegin(): BeginTikzPictureStatement | UnknownStatement {
		const startTok = this.consume("COMMAND", "\\begin") // already verified
		// Expect {name}
		if (!this.check("LBRACE")) return this.unknownFromHere(startTok, "\\begin without a following {environment}")
		this.advance()
		const nameTok = this.peek()
		const envName = nameTok.type === "IDENTIFIER" ? nameTok.value : ""
		if (nameTok.type !== "IDENTIFIER") {
			return this.unknownFromHere(startTok, "\\begin{...} environment name missing or not a plain identifier")
		}
		this.advance()
		if (!this.match("RBRACE")) {
			return this.unknownFromHere(startTok, "\\begin{...} was never closed with a '}'")
		}

		// Only tikzpicture/circuitikz are meaningful to us. Anything else becomes an unknown
		// statement so we don't try to treat its body as top-level.
		if (envName !== "tikzpicture" && envName !== "circuitikz") {
			this.collector.warning(
				`Ignoring environment \\begin{${envName}} — only tikzpicture / circuitikz are understood.`,
				{
					line: startTok.line,
					column: startTok.column,
					code: "parse-unknown-env",
					suggestion: "If this environment contains your circuit, unwrap it so the \\draw / \\node statements are at the top level.",
				}
			)
			return { kind: "begin-tikzpicture", options: undefined, line: startTok.line, column: startTok.column }
		}

		// Optional [options].
		let options: TikzOptionList | undefined
		if (this.check("LBRACKET")) {
			options = this.parseOptionList()
		}
		return { kind: "begin-tikzpicture", options, line: startTok.line, column: startTok.column }
	}

	private parseEnd(): EndTikzPictureStatement | UnknownStatement {
		const startTok = this.consume("COMMAND", "\\end")
		if (!this.match("LBRACE")) return this.unknownFromHere(startTok, "\\end without a following {environment}")
		// Consume identifier + close brace — the name is purely cosmetic for our purposes.
		if (this.check("IDENTIFIER")) this.advance()
		this.match("RBRACE")
		return { kind: "end-tikzpicture", line: startTok.line, column: startTok.column }
	}

	// ------------- \ctikzset ---------------------------------------------------------------- //

	private parseCtikzset(): CtikzsetStatement | UnknownStatement {
		const startTok = this.consume("COMMAND", "\\ctikzset")
		if (!this.check("LBRACE")) return this.unknownFromHere(startTok, "\\ctikzset without a following { option list }")

		// Collect everything up to the matching '}' as one big option list body. \ctikzset uses
		// braces instead of brackets but the body is semantically the same.
		const braceOptions = this.parseBraceOptionList()
		// Optional trailing ';' — some authors write it, most don't.
		this.match("SEMICOLON")
		return {
			kind: "ctikzset",
			line: startTok.line,
			column: startTok.column,
			options: braceOptions,
		}
	}

	// ------------- \usetikzlibrary ---------------------------------------------------------- //

	private parseUseTikzLibrary(): UseTikzLibraryStatement | UnknownStatement {
		const startTok = this.consume("COMMAND", "\\usetikzlibrary")
		if (!this.match("LBRACE"))
			return this.unknownFromHere(startTok, "\\usetikzlibrary without a following { library list }")
		const libs: string[] = []
		while (!this.isAtEnd() && !this.check("RBRACE")) {
			const t = this.advance()
			if (t.type === "IDENTIFIER") libs.push(t.value)
			// Commas and whitespace (already stripped) are ignored; anything else is also ignored
			// silently — we only care about the names.
		}
		this.match("RBRACE")
		this.match("SEMICOLON")
		return { kind: "usetikzlibrary", libraries: libs, line: startTok.line, column: startTok.column }
	}

	// ------------- \draw / \path ------------------------------------------------------------ //

	private parseDraw(): DrawStatement {
		const cmdTok = this.advance() // COMMAND
		const cmdName = cmdTok.parsed?.name ?? cmdTok.value.replace(/^\\/, "")

		// Optional [options]
		let options: TikzOptionList | undefined
		if (this.check("LBRACKET")) options = this.parseOptionList()

		const elements: TikzPathElement[] = []

		// Parse path elements until ';' or EOF or unexpected top-level command.
		while (!this.isAtEnd() && !this.check("SEMICOLON")) {
			if (this.check("COMMENT")) {
				this.advance()
				continue
			}

			// Terminate early if another top-level statement starts without a `;` — emits a
			// diagnostic but doesn't abort.
			if (this.looksLikeStatementStart()) {
				this.collector.warning("A \\draw statement wasn't ended with ';' — inserting one mentally and moving on.", {
					line: this.peek().line,
					column: this.peek().column,
					code: "parse-missing-semicolon",
					suggestion: "Every \\draw / \\node line should end with a ';'.",
				})
				break
			}

			const el = this.parsePathElement()
			if (el) elements.push(el)
		}

		// Consume the terminating ';'.
		this.match("SEMICOLON")

		return {
			kind: "draw",
			command: cmdName,
			options,
			elements,
			line: cmdTok.line,
			column: cmdTok.column,
		}
	}

	private parsePathElement(): TikzPathElement | null {
		const tok = this.peek()

		// (coordinate) / (name) / (name.anchor)
		if (tok.type === "LPAREN") {
			return this.parseParenElement()
		}

		// ++(x,y) — relative coordinate
		if (tok.type === "OPERATOR" && tok.value === "++") {
			this.advance()
			if (!this.check("LPAREN")) {
				this.collector.warning("Expected '(' after '++'.", {
					line: tok.line,
					column: tok.column,
					code: "parse-rel-coord",
				})
				return null
			}
			const inner = this.parseParenElement()
			if (inner && inner.kind === "coord") {
				inner.relative = true
				return inner
			}
			if (inner && inner.kind === "named-point") {
				// CircuiTikZ allows ++(name) semantically; flag it so the transformer can decide.
				this.collector.info("Relative-by-name coordinate ('++(name)') — will be resolved by anchor lookup later.", {
					line: tok.line,
					column: tok.column,
					code: "parse-rel-named",
				})
			}
			return inner
		}

		// Path connector operators.
		if (tok.type === "OPERATOR") {
			this.advance()
			return { kind: "connector", operator: tok.value, line: tok.line, column: tok.column }
		}

		// `to [options]` — the TikZ "to" path-element with optional options.
		if (tok.type === "IDENTIFIER" && tok.value === "to") {
			this.advance()
			let opts: TikzOptionList | undefined
			if (this.check("LBRACKET")) opts = this.parseOptionList()
			return { kind: "to", options: opts, line: tok.line, column: tok.column }
		}

		// Embedded node inside a path: `node [options] (name) {label}`.
		// Both `\node` (COMMAND) and the bare `node` (IDENTIFIER) are legal inside paths —
		// TikZ treats them identically.
		if (tok.type === "COMMAND" && (tok.parsed?.name === "node" || tok.parsed?.name === "coordinate")) {
			return this.parseEmbeddedNode()
		}
		if (tok.type === "IDENTIFIER" && (tok.value === "node" || tok.value === "coordinate")) {
			return this.parseEmbeddedNode()
		}

		// Bare identifier at path position — probably an option name that escaped its brackets or
		// a keyword we don't model ("rectangle", "circle", etc). Record it as unknown-element so
		// the transformer can decide.
		if (tok.type === "IDENTIFIER") {
			const start = tok.offset
			this.advance()
			// Greedy-collect until the next structural token.
			while (
				!this.isAtEnd() &&
				!this.check("SEMICOLON") &&
				!this.check("LPAREN") &&
				!this.check("LBRACKET") &&
				!(this.peek().type === "OPERATOR") &&
				!(this.peek().type === "COMMAND" && this.looksLikeStatementStart())
			) {
				this.advance()
			}
			return {
				kind: "unknown-element",
				source: this.sourceBetween(start, this.previousEnd()),
				reason: `unrecognised keyword in path`,
				line: tok.line,
				column: tok.column,
			}
		}

		// Anything else: emit info + advance to avoid an infinite loop.
		this.collector.info(`Skipping unexpected token '${tok.value}' inside a \\draw path.`, {
			line: tok.line,
			column: tok.column,
			code: "parse-path-skip",
		})
		this.advance()
		return null
	}

	private parseParenElement(): TikzPathCoordinate | TikzPathNamedPoint | null {
		const open = this.advance() // LPAREN
		// Collect the raw body first — cheaper than trying to parse-then-backtrack on failure.
		const bodyStart = this.pos
		let depth = 1
		while (!this.isAtEnd() && depth > 0) {
			const t = this.peek()
			if (t.type === "LPAREN") depth++
			else if (t.type === "RPAREN") depth--
			if (depth === 0) break
			this.advance()
		}
		const bodyTokens = this.tokens.slice(bodyStart, this.pos)
		this.match("RPAREN")

		if (bodyTokens.length === 0) {
			return {
				kind: "coord",
				relative: false,
				coord: { kind: "raw", raw: "", line: open.line, column: open.column },
				line: open.line,
				column: open.column,
			}
		}

		// Coordinate shape detection.
		// 1. `x, y`       → xy numeric
		// 2. `angle : r`  → polar
		// 3. `name` or `name.anchor` → named-point
		// 4. anything else → raw coord passthrough

		const commaIdx = bodyTokens.findIndex((t) => t.type === "COMMA")
		const colonIdx = bodyTokens.findIndex((t) => t.type === "COLON")

		if (commaIdx !== -1 && (colonIdx === -1 || commaIdx < colonIdx)) {
			// Numeric xy.
			const left = bodyTokens.slice(0, commaIdx)
			const right = bodyTokens.slice(commaIdx + 1)
			const x = numberFromTokens(left)
			const y = numberFromTokens(right)
			if (x && y) {
				return {
					kind: "coord",
					relative: false,
					coord: {
						kind: "xy",
						x: x.value,
						y: y.value,
						xUnit: x.unit,
						yUnit: y.unit,
						line: open.line,
						column: open.column,
					},
					line: open.line,
					column: open.column,
				}
			}
			// Fall through to raw.
		}

		if (colonIdx !== -1) {
			const left = bodyTokens.slice(0, colonIdx)
			const right = bodyTokens.slice(colonIdx + 1)
			const angle = numberFromTokens(left)
			const radius = numberFromTokens(right)
			if (angle && radius) {
				return {
					kind: "coord",
					relative: false,
					coord: {
						kind: "polar",
						angle: angle.value,
						radius: radius.value,
						radiusUnit: radius.unit,
						line: open.line,
						column: open.column,
					},
					line: open.line,
					column: open.column,
				}
			}
			// fall through to raw.
		}

		// TikZ coordinate intersection: `(A |- B)` or `(A -| B)`.
		// The `|-` / `-|` operators already exist as OPERATOR tokens (they're used by the
		// multi-segment bent-wire rule). When one appears inside a paren expression flanked
		// by two IDENTIFIER-based references, it's the intersection shorthand, not a path
		// operator. Semantics per TikZ manual:
		//   (A |- B) = (A.x, B.y)    — draw a vertical then horizontal line, ending at B.y
		//   (A -| B) = (B.x, A.y)    — draw a horizontal then vertical line, ending at A.y
		{
			const opIdx = bodyTokens.findIndex(
				(t) => t.type === "OPERATOR" && (t.value === "|-" || t.value === "-|")
			)
			if (opIdx > 0 && opIdx < bodyTokens.length - 1) {
				const leftToks = bodyTokens.slice(0, opIdx)
				const rightToks = bodyTokens.slice(opIdx + 1)
				const leftName = leftToks[0]?.type === "IDENTIFIER" ? leftToks[0].value : null
				const rightName = rightToks[0]?.type === "IDENTIFIER" ? rightToks[0].value : null
				// Both sides must be parseable as references. We only need the base name for the
				// intersection — anchors on either side are preserved via the raw text but we
				// use the primary name for lookup. (CircuiTikZ rarely puts anchors inside `|-`.)
				if (leftName && rightName) {
					const op = bodyTokens[opIdx].value
					const xFrom = op === "|-" ? leftName : rightName
					const yFrom = op === "|-" ? rightName : leftName
					return {
						kind: "coord",
						relative: false,
						coord: {
							kind: "intersection",
							xFrom,
							yFrom,
							line: open.line,
							column: open.column,
						},
						line: open.line,
						column: open.column,
					}
				}
			}
		}

		// Named point: single IDENTIFIER, optionally followed by DOT + anchor.
		// The anchor is usually a single IDENTIFIER (e.g. `R1.north`, `oa.-`) but CircuiTikZ's
		// DIP-chip / multi-pin components expose compound anchor names like `pin 15`, `pin 1`,
		// `pin edge`. We accept anchors that are a run of IDENTIFIER / NUMBER tokens and
		// preserve their original spacing via source slice so the transformer can match the
		// CircuiTikZ pin-name convention directly (`pin 15`, not `pin15` or `pin.15`).
		if (bodyTokens[0].type === "IDENTIFIER") {
			const name = bodyTokens[0].value
			let anchor: string | undefined
			let anchorEnd = 0
			if (bodyTokens.length >= 3 && bodyTokens[1].type === "DOT" && bodyTokens[2].type === "IDENTIFIER") {
				// Greedy: absorb trailing IDENTIFIER / NUMBER tokens into the anchor.
				let lastAnchorIdx = 2
				for (let k = 3; k < bodyTokens.length; k++) {
					const t = bodyTokens[k]
					if (t.type === "IDENTIFIER" || t.type === "NUMBER") {
						lastAnchorIdx = k
					} else {
						break
					}
				}
				// Preserve original spacing so `pin 15` stays as `pin 15`.
				anchor = this.collector.sourceText
					.slice(bodyTokens[2].offset, bodyTokens[lastAnchorIdx].end)
					.trim()
				anchorEnd = lastAnchorIdx
			}
			const expectedLen = anchor ? anchorEnd + 1 : 1
			if (bodyTokens.length === expectedLen) {
				return {
					kind: "named-point",
					name,
					anchor,
					line: open.line,
					column: open.column,
				}
			}
		}

		// Raw fallback — include the literal text so the transformer can retry or flag.
		const raw = this.sourceOfTokens(bodyTokens)
		return {
			kind: "coord",
			relative: false,
			coord: { kind: "raw", raw, line: open.line, column: open.column },
			line: open.line,
			column: open.column,
		}
	}

	private parseEmbeddedNode(): TikzPathEmbeddedNode {
		const cmdTok = this.advance()
		let options: TikzOptionList | undefined
		if (this.check("LBRACKET")) options = this.parseOptionList()

		let name: string | undefined
		if (this.check("LPAREN")) {
			const paren = this.parseParenElement()
			if (paren && paren.kind === "named-point") name = paren.name
			else if (paren && paren.kind === "coord" && paren.coord.kind === "raw") name = paren.coord.raw
		}

		let label: string | undefined
		if (this.check("LBRACE")) label = this.parseBracedText()

		return {
			kind: "embedded-node",
			line: cmdTok.line,
			column: cmdTok.column,
			options,
			name,
			label,
		}
	}

	// ------------- \node / \coordinate ------------------------------------------------------ //

	private parseNode(): NodeStatement {
		const cmdTok = this.advance()
		const cmdName = cmdTok.parsed?.name ?? cmdTok.value.replace(/^\\/, "")

		let options: TikzOptionList | undefined
		if (this.check("LBRACKET")) options = this.parseOptionList()

		let name: string | undefined
		if (this.check("LPAREN")) {
			const paren = this.parseParenElement()
			if (paren && paren.kind === "named-point") name = paren.name
		}

		// Optional `at (coord)` — either a numeric coord, a polar coord, or a reference to
		// a previously defined node / coordinate (e.g. `at (ant.north)`).
		let at: TikzCoordinate | undefined
		if (this.check("IDENTIFIER") && this.peek().value === "at") {
			this.advance()
			if (this.check("LPAREN")) {
				const paren = this.parseParenElement()
				if (paren && paren.kind === "coord") at = paren.coord
				else if (paren && paren.kind === "named-point") {
					at = {
						kind: "named",
						name: paren.name,
						anchor: paren.anchor,
						line: paren.line,
						column: paren.column,
					}
				}
			}
		}

		// Label body (for \node), absent for \coordinate.
		let label: string | undefined
		let labelOmitted = true
		if (this.check("LBRACE")) {
			label = this.parseBracedText()
			labelOmitted = false
		}

		// Terminating ';' — enforced but missing is only a warning.
		if (!this.match("SEMICOLON")) {
			this.collector.warning("A \\node / \\coordinate statement wasn't ended with ';'.", {
				line: cmdTok.line,
				column: cmdTok.column,
				code: "parse-missing-semicolon",
				suggestion: "Every \\node / \\coordinate line should end with a ';'.",
			})
		}

		return {
			kind: "node",
			command: cmdName,
			line: cmdTok.line,
			column: cmdTok.column,
			options,
			name,
			at,
			label,
			labelOmitted,
		}
	}

	// ------------- Option lists ------------------------------------------------------------- //

	private parseOptionList(): TikzOptionList {
		const openTok = this.advance() // LBRACKET
		const bodyStart = this.pos
		let depth = 1
		while (!this.isAtEnd() && depth > 0) {
			const t = this.peek()
			if (t.type === "LBRACKET") depth++
			else if (t.type === "RBRACKET") depth--
			if (depth === 0) break
			this.advance()
		}
		const bodyTokens = this.tokens.slice(bodyStart, this.pos)
		this.match("RBRACKET")
		return {
			entries: splitOptionEntries(bodyTokens, this.collector.sourceText),
			raw: this.sourceOfTokens(bodyTokens),
			line: openTok.line,
			column: openTok.column,
		}
	}

	private parseBraceOptionList(): TikzOptionList {
		const openTok = this.advance() // LBRACE
		const bodyStart = this.pos
		let depth = 1
		while (!this.isAtEnd() && depth > 0) {
			const t = this.peek()
			if (t.type === "LBRACE") depth++
			else if (t.type === "RBRACE") depth--
			if (depth === 0) break
			this.advance()
		}
		const bodyTokens = this.tokens.slice(bodyStart, this.pos)
		this.match("RBRACE")
		return {
			entries: splitOptionEntries(bodyTokens, this.collector.sourceText),
			raw: this.sourceOfTokens(bodyTokens),
			line: openTok.line,
			column: openTok.column,
		}
	}

	/**
	 * Read balanced `{...}` text literally. Keeps inner braces intact so math-mode labels and
	 * nested groups survive.
	 */
	private parseBracedText(): string {
		this.advance() // LBRACE — position is all we need; start offset taken from next token.
		const bodyStart = this.pos
		let depth = 1
		while (!this.isAtEnd() && depth > 0) {
			const t = this.peek()
			if (t.type === "LBRACE") depth++
			else if (t.type === "RBRACE") depth--
			if (depth === 0) break
			this.advance()
		}
		const bodyTokens = this.tokens.slice(bodyStart, this.pos)
		this.match("RBRACE")
		// Reconstruct from original source rather than token values so we preserve spaces and
		// math-mode escapes verbatim.
		if (bodyTokens.length === 0) return ""
		const firstTok = bodyTokens[0]
		const lastTok = bodyTokens[bodyTokens.length - 1]
		return this.collector.sourceText.slice(firstTok.offset, lastTok.end)
	}

	// ------------- Helpers: token navigation ------------------------------------------------ //

	private peek(offset: number = 0): TikzToken {
		return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
	}

	private advance(): TikzToken {
		const t = this.tokens[this.pos]
		if (!this.isAtEnd()) this.pos++
		return t
	}

	private previousEnd(): number {
		const t = this.tokens[Math.max(0, this.pos - 1)]
		return t?.end ?? 0
	}

	private check(type: TikzTokenType): boolean {
		return this.peek().type === type
	}

	private match(type: TikzTokenType): boolean {
		if (this.check(type)) {
			this.advance()
			return true
		}
		return false
	}

	private isAtEnd(): boolean {
		return this.peek().type === "EOF"
	}

	/** Assert-and-consume for tokens we already know are there. */
	private consume(type: TikzTokenType, _label: string): TikzToken {
		if (!this.check(type)) {
			throw new Error(`internal: expected ${type} ('${_label}'), got ${this.peek().type}`)
		}
		return this.advance()
	}

	/** Does the current token look like the start of a top-level statement? */
	private looksLikeStatementStart(): boolean {
		const t = this.peek()
		if (t.type !== "COMMAND") return false
		const n = t.parsed?.name ?? ""
		return (
			n === "draw" ||
			n === "draw*" ||
			n === "node" ||
			n === "coordinate" ||
			n === "path" ||
			n === "path*" ||
			n === "ctikzset" ||
			n === "usetikzlibrary" ||
			n === "begin" ||
			n === "end"
		)
	}

	// ------------- Error-recovery utilities ------------------------------------------------ //

	private synchronize(): void {
		// Advance until we find a ';' or a token that looks like a new statement start.
		while (!this.isAtEnd()) {
			if (this.check("SEMICOLON")) {
				this.advance()
				return
			}
			if (this.looksLikeStatementStart()) return
			this.advance()
		}
	}

	/**
	 * Capture the source spanning from `startTok` up to (but not including) the next
	 * sync point. Used when we're building an UnknownStatement from a failure.
	 */
	private captureSliceUntilSync(startTok: TikzToken): string {
		// We don't consume here — just peek forward so callers that call synchronize() afterwards
		// still make the proper advance.
		let j = this.pos
		while (j < this.tokens.length && this.tokens[j].type !== "EOF") {
			if (this.tokens[j].type === "SEMICOLON") break
			const t = this.tokens[j]
			if (t.type === "COMMAND") {
				const n = t.parsed?.name ?? ""
				if (n === "draw" || n === "node" || n === "coordinate" || n === "ctikzset" || n === "begin" || n === "end")
					break
			}
			j++
		}
		const last = this.tokens[Math.max(this.pos, j - 1)]
		return this.collector.sourceText.slice(startTok.offset, last?.end ?? startTok.end).trim().slice(0, 240)
	}

	private unknownFromHere(startTok: TikzToken, reason: string): UnknownStatement {
		this.collector.warning(reason, {
			line: startTok.line,
			column: startTok.column,
			code: "parse-unknown",
			suggestion: "The rest of your circuit will still be imported.",
		})
		const source = this.captureSliceUntilSync(startTok)
		this.synchronize()
		return { kind: "unknown", line: startTok.line, column: startTok.column, source, reason }
	}

	private sourceBetween(startOffset: number, endOffset: number): string {
		return this.collector.sourceText.slice(startOffset, endOffset)
	}

	private sourceOfTokens(toks: TikzToken[]): string {
		if (toks.length === 0) return ""
		return this.collector.sourceText.slice(toks[0].offset, toks[toks.length - 1].end)
	}
}

// ===================================================================================== //
// Standalone helpers
// ===================================================================================== //

/**
 * Reduce a token sequence like `-2.5 cm` into a single numeric value. Returns undefined when the
 * sequence doesn't look like a number (e.g. an identifier slipped in). Whitespace tokens are
 * impossible — the lexer dropped them — so the only shapes we need to handle are:
 *   NUMBER                    → {value, unit}
 *   NUMBER IDENTIFIER(unit)   → {value, unit}
 *   IDENTIFIER(unit-less name) → undefined
 */
function numberFromTokens(tokens: TikzToken[]): { value: number; unit?: string } | undefined {
	if (tokens.length === 0) return undefined
	const first = tokens[0]
	if (first.type !== "NUMBER") return undefined
	const value = first.parsed?.numeric
	if (value === undefined || Number.isNaN(value)) return undefined
	let unit = first.parsed?.unit
	if (unit === undefined && tokens.length >= 2 && tokens[1].type === "IDENTIFIER") {
		const candidate = tokens[1].value
		if (/^(cm|mm|pt|in|em|ex)$/.test(candidate)) unit = candidate
	}
	return { value, unit }
}

/**
 * Split a flat option-body token list into individual key/value entries on top-level commas.
 * Tracks brace/bracket depth so commas inside nested constructs (like `align={north east}` or
 * `pin={[pin edge={latex-}]above:V_CC}`) don't split incorrectly.
 *
 * `source` is the full original text so keys and values can be extracted as contiguous slices —
 * that way a value like `1k` or `resistors/scale` keeps its original shape instead of being
 * reconstructed from space-joined token values.
 */
function splitOptionEntries(tokens: TikzToken[], source: string): TikzOption[] {
	const entries: TikzOption[] = []
	let depth = 0
	let start = 0
	const push = (endIdx: number) => {
		const slice = tokens.slice(start, endIdx)
		if (slice.length === 0) return
		// Find top-level '=' split for key/value.
		let eqIdx = -1
		let d = 0
		for (let i = 0; i < slice.length; i++) {
			const t = slice[i]
			if (t.type === "LBRACE" || t.type === "LBRACKET") d++
			else if (t.type === "RBRACE" || t.type === "RBRACKET") d--
			else if (d === 0 && t.type === "EQUALS") {
				eqIdx = i
				break
			}
		}
		const first = slice[0]
		if (eqIdx === -1) {
			const key = sliceSourceOfTokens(slice, source)
			if (key.length === 0) return
			entries.push({ key, value: undefined, line: first.line, column: first.column })
		} else {
			const keySlice = slice.slice(0, eqIdx)
			const valSlice = slice.slice(eqIdx + 1)
			const key = sliceSourceOfTokens(keySlice, source)
			const value = sliceSourceOfTokens(valSlice, source)
			if (key.length === 0) return
			entries.push({ key, value, line: first.line, column: first.column })
		}
	}
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]
		if (t.type === "LBRACE" || t.type === "LBRACKET") depth++
		else if (t.type === "RBRACE" || t.type === "RBRACKET") depth--
		else if (depth === 0 && t.type === "COMMA") {
			push(i)
			start = i + 1
		}
	}
	push(tokens.length)
	return entries
}

/**
 * Extract the original source text spanned by a token range, trimmed. This preserves whatever
 * was between the tokens verbatim — critical for values like `1k`, `R1.north`, `{rgb,255:...}`
 * which would be scrambled by joining token .value strings with spaces.
 */
function sliceSourceOfTokens(tokens: TikzToken[], source: string): string {
	if (tokens.length === 0) return ""
	const first = tokens[0]
	const last = tokens[tokens.length - 1]
	return source.slice(first.offset, last.end).trim()
}
