import type { DiagnosticsCollector } from "./diagnostics"

/**
 * The tokens recognised by the CircuiTikZ lexer. Chosen to stay close to the surface syntax of
 * the TikZ/CircuiTikZ source — the parser in Stage 5 does the semantic work.
 */
export type TikzTokenType =
	| "COMMAND" // \draw, \node, \begin, \end, \ctikzset, \usetikzlibrary, ...
	| "LBRACE"
	| "RBRACE"
	| "LBRACKET"
	| "RBRACKET"
	| "LPAREN"
	| "RPAREN"
	| "COMMA"
	| "SEMICOLON"
	| "EQUALS"
	| "DOT"
	| "COLON"
	| "ASTERISK"
	| "AMPERSAND"
	| "DOLLAR" // $ — math-mode delimiter inside labels
	| "NUMBER" // 1, -1.5, 1e-3 (with optional unit suffix captured separately)
	| "IDENTIFIER" // word characters, including dashes — CircuiTikZ option names use dashes
	| "OPERATOR" // -- -| |- ++ -> <- <-> (path connectors / arrow specifiers)
	| "COMMENT" // % ... to end of line
	| "ILLEGAL" // truly unknown character — reported as a diagnostic, lexer carries on
	| "EOF"

export interface TikzToken {
	type: TikzTokenType
	/** The raw source text of the token. */
	value: string
	/** 1-based line number where the token starts. */
	line: number
	/** 1-based column number where the token starts. */
	column: number
	/** 0-based character offset in the source where the token starts. */
	offset: number
	/** 0-based character offset one past the last character of the token. */
	end: number
	/**
	 * Parsed payload for tokens whose value is more than just text:
	 *  - NUMBER   → { numeric: Number, unit?: string }
	 *  - COMMAND  → { name: string } (name without the leading backslash)
	 */
	parsed?: { numeric?: number; unit?: string; name?: string }
}

/**
 * Tokenize CircuiTikZ/TikZ source text into a flat list of tokens.
 *
 * The lexer is deliberately non-throwing: invalid characters produce an ILLEGAL token and a
 * diagnostic, then lexing continues. This keeps the rest of the pipeline reachable even when the
 * source is partially broken.
 */
export function tokenizeTikz(source: string, collector: DiagnosticsCollector): TikzToken[] {
	const tokens: TikzToken[] = []
	let i = 0
	let line = 1
	let col = 1

	const push = (type: TikzTokenType, start: number, startLine: number, startCol: number, parsed?: TikzToken["parsed"]) => {
		tokens.push({
			type,
			value: source.slice(start, i),
			line: startLine,
			column: startCol,
			offset: start,
			end: i,
			parsed,
		})
	}

	const advance = (n: number = 1): void => {
		for (let k = 0; k < n; k++) {
			if (i >= source.length) return
			if (source.charCodeAt(i) === 10 /* \n */) {
				line++
				col = 1
			} else {
				col++
			}
			i++
		}
	}

	while (i < source.length) {
		const startLine = line
		const startCol = col
		const start = i
		const ch = source[i]
		const cc = source.charCodeAt(i)

		// ---------- Whitespace ------------------------------------------- //
		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			advance()
			continue
		}

		// ---------- Comment: % ... <newline> ----------------------------- //
		if (ch === "%") {
			while (i < source.length && source[i] !== "\n") advance()
			push("COMMENT", start, startLine, startCol)
			continue
		}

		// ---------- Command: \name --------------------------------------- //
		if (ch === "\\") {
			advance() // consume '\'
			// Special-cased single-char "commands" like \{ \} \$ \% \& — treat the backslash +
			// next char as a single COMMAND so they don't get mistaken for structure.
			if (i < source.length && /[^A-Za-z]/.test(source[i])) {
				advance()
				const val = source.slice(start, i)
				push("COMMAND", start, startLine, startCol, { name: val.slice(1) })
				continue
			}
			while (i < source.length && /[A-Za-z]/.test(source[i])) advance()
			// An asterisk may follow (\draw*, \path*); include it in the command name.
			if (i < source.length && source[i] === "*") advance()
			const name = source.slice(start + 1, i)
			push("COMMAND", start, startLine, startCol, { name })
			continue
		}

		// ---------- Multi-char operators --------------------------------- //
		// These MUST be checked before single-char tokens.
		// Check longest first.
		if (source.startsWith("<->", i)) {
			advance(3)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("-->", i)) {
			// Some TikZ dialects use --> as "draw with arrow"; treat as operator.
			advance(3)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		// CircuiTikZ end-marker decorations (`to[short, -*]`, `to[C, *-*]`, …).
		// These are path-terminator shapes — the Designer doesn't render them, but recognising
		// them as OPERATOR tokens prevents "Unrecognised character '-'" warnings from the lexer.
		// We only match the `*`-based forms here because `*` isn't an identifier character, so
		// there's no risk of eating a valid identifier. `o`-based forms (o-o, -o, o-) would
		// potentially absorb the leading 'o' of names like `o-option`, so we leave them alone.
		if (source.startsWith("*-*", i)) {
			advance(3)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("-*", i) || source.startsWith("*-", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("--", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("-|", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("|-", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("++", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("->", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}
		if (source.startsWith("<-", i)) {
			advance(2)
			push("OPERATOR", start, startLine, startCol)
			continue
		}

		// ---------- Number: optional sign + digits + optional fraction + optional exponent + optional unit
		if (isNumberStart(source, i)) {
			const parsed = readNumber(source, i)
			advance(parsed.length)
			// Optional unit suffix: cm, mm, pt, in, em, ex
			let unit: string | undefined
			const unitMatch = /^(cm|mm|pt|in|em|ex)\b/.exec(source.slice(i))
			if (unitMatch) {
				unit = unitMatch[1]
				advance(unitMatch[0].length)
			}
			push("NUMBER", start, startLine, startCol, { numeric: parsed.value, unit })
			continue
		}

		// ---------- Single-char punctuation ------------------------------ //
		switch (ch) {
			case "{":
				advance()
				push("LBRACE", start, startLine, startCol)
				continue
			case "}":
				advance()
				push("RBRACE", start, startLine, startCol)
				continue
			case "[":
				advance()
				push("LBRACKET", start, startLine, startCol)
				continue
			case "]":
				advance()
				push("RBRACKET", start, startLine, startCol)
				continue
			case "(":
				advance()
				push("LPAREN", start, startLine, startCol)
				continue
			case ")":
				advance()
				push("RPAREN", start, startLine, startCol)
				continue
			case ",":
				advance()
				push("COMMA", start, startLine, startCol)
				continue
			case ";":
				advance()
				push("SEMICOLON", start, startLine, startCol)
				continue
			case "=":
				advance()
				push("EQUALS", start, startLine, startCol)
				continue
			case ".":
				// A bare '.' is only a token when not part of a number (handled above).
				advance()
				push("DOT", start, startLine, startCol)
				continue
			case ":":
				advance()
				push("COLON", start, startLine, startCol)
				continue
			case "*":
				advance()
				push("ASTERISK", start, startLine, startCol)
				continue
			case "&":
				advance()
				push("AMPERSAND", start, startLine, startCol)
				continue
			case "$":
				advance()
				push("DOLLAR", start, startLine, startCol)
				continue
		}

		// ---------- Identifier: word characters + dashes ----------------- //
		// CircuiTikZ option names frequently contain dashes (e.g. "american inductor",
		// "draw=black"). We treat [A-Za-z_][A-Za-z0-9_ -]* but stop at the first non-identifier
		// char to avoid swallowing structural characters. Spaces are NOT part of identifiers;
		// multi-word option names are handled by the parser.
		// The caret `^` is accepted as a continuation char so CircuiTikZ annotation-position
		// modifiers like `i^=$I_C$` and `v^=$V_R$` (current/voltage label-above idioms) tokenize
		// cleanly as a single IDENTIFIER rather than triggering an ILLEGAL-char warning. The `_`
		// counterpart (`i_=...`) already rides along because `_` is in the base charset.
		if (/[A-Za-z_@]/.test(ch)) {
			advance()
			while (i < source.length && /[A-Za-z0-9_@^]/.test(source[i])) advance()
			// A trailing dash is allowed only when followed by another identifier char, to keep
			// operators like "--" from being absorbed.
			while (i + 1 < source.length && source[i] === "-" && /[A-Za-z0-9_^]/.test(source[i + 1])) {
				advance()
				while (i < source.length && /[A-Za-z0-9_^]/.test(source[i])) advance()
			}
			push("IDENTIFIER", start, startLine, startCol)
			continue
		}

		// ---------- Bare '-' / '+' as identifier --------------------------- //
		// Reached only if the earlier operator / number / identifier checks didn't claim the
		// character. In CircuiTikZ these appear as anchor names (`anchor=-`, `(oa.-)`, `(oa.+)`)
		// and occasionally inside math labels (`{$+V_{CC}$}`). Emitting them as IDENTIFIER lets
		// the paren-coordinate rule match `IDENT . IDENT` naturally and keeps label bodies clean.
		if (ch === "-" || ch === "+") {
			advance()
			push("IDENTIFIER", start, startLine, startCol)
			continue
		}

		// ---------- Unrecognised character ------------------------------- //
		advance()
		push("ILLEGAL", start, startLine, startCol)
		collector.warning(`Unrecognised character '${ch}' — ignored.`, {
			line: startLine,
			column: startCol,
			code: "lex-illegal",
			suggestion: "If you meant a LaTeX command, make sure it starts with a backslash (\\).",
		})
	}

	tokens.push({
		type: "EOF",
		value: "",
		line,
		column: col,
		offset: i,
		end: i,
	})
	return tokens
}

/** Does the source position look like the start of a number we can parse? */
function isNumberStart(src: string, i: number): boolean {
	const ch = src[i]
	if (ch >= "0" && ch <= "9") return true
	// Leading minus/plus is only a number when followed by a digit or a dot-digit — otherwise it
	// could be part of an operator like '--' or '-|'.
	if ((ch === "-" || ch === "+") && i + 1 < src.length) {
		const next = src[i + 1]
		if (next >= "0" && next <= "9") return true
		if (next === "." && i + 2 < src.length && /[0-9]/.test(src[i + 2])) return true
	}
	// A leading '.' is a number start when the next char is a digit.
	if (ch === "." && i + 1 < src.length && /[0-9]/.test(src[i + 1])) return true
	return false
}

/**
 * Read a decimal number starting at `i` — returns the parsed numeric value and the length of
 * source consumed. Supports optional sign, fractional part, and scientific exponent.
 */
function readNumber(src: string, i: number): { value: number; length: number } {
	const start = i
	if (src[i] === "+" || src[i] === "-") i++
	while (i < src.length && src[i] >= "0" && src[i] <= "9") i++
	if (src[i] === "." && i + 1 < src.length && src[i + 1] >= "0" && src[i + 1] <= "9") {
		i++
		while (i < src.length && src[i] >= "0" && src[i] <= "9") i++
	}
	if (src[i] === "e" || src[i] === "E") {
		const expStart = i
		i++
		if (src[i] === "+" || src[i] === "-") i++
		const digitsStart = i
		while (i < src.length && src[i] >= "0" && src[i] <= "9") i++
		if (i === digitsStart) i = expStart // bail out — not a valid exponent
	}
	const lit = src.slice(start, i)
	const value = parseFloat(lit)
	return { value, length: i - start }
}

/**
 * Join consecutive tokens back into source text. Useful for the parser when it needs to capture
 * the original source range of a construct (e.g. an option list's raw body, a label's verbatim
 * text).
 */
export function sliceSource(source: string, tokens: TikzToken[]): string {
	if (tokens.length === 0) return ""
	const first = tokens[0]
	const last = tokens[tokens.length - 1]
	return source.slice(first.offset, last.end)
}
