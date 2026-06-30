import type { ComponentSaveObject, ImportFormat } from "../internal"

/**
 * Severity buckets for user-facing diagnostics. Matches the colours used by the Import Report
 * modal (error = danger, warning = warning, info = info).
 */
export type DiagnosticSeverity = "error" | "warning" | "info"

/**
 * A single import diagnostic — one piece of feedback surfaced to the user.
 *
 * Every field is written with the target audience in mind (PhD students who know their circuits
 * but not necessarily LaTeX grammars): messages are plain English, snippets are the original
 * source text so the user can recognise what triggered the diagnostic, and suggestions are
 * actionable ("did you mean X?" / "add a coordinate after `to`").
 */
export interface ImportDiagnostic {
	severity: DiagnosticSeverity
	/** 1-based line number in the source text, if known. */
	line?: number
	/** 1-based column number in the source text, if known. */
	column?: number
	/**
	 * The raw source snippet the diagnostic refers to. Usually the offending line, possibly
	 * trimmed. The collector auto-populates this from `line` if it's absent.
	 */
	snippet?: string
	/** Plain-English description of the problem. Required. */
	message: string
	/** Optional actionable suggestion ("did you mean 'resistor'?"). */
	suggestion?: string
	/**
	 * Machine-readable category — used only for grouping / filtering in the report, never shown
	 * directly to the user. Keep short, e.g. "unknown-component", "syntax", "schema".
	 */
	code?: string
}

/**
 * Final envelope returned by every importer. `components` is the list that will be fed into the
 * existing {@link CircuitComponent.fromJson} factory; `diagnostics` is what the Import Report
 * modal renders.
 */
export interface ImportResult {
	format: ImportFormat
	/**
	 * True iff we produced at least one component and encountered no hard errors that would have
	 * invalidated the result. A result can be "successful" and still carry warnings — the user is
	 * told about them either way.
	 */
	success: boolean
	components: ComponentSaveObject[]
	diagnostics: ImportDiagnostic[]
	/**
	 * Source text that produced this result, retained so the Import Report modal can display it
	 * alongside diagnostics and so "Fix and retry" can restore it verbatim.
	 */
	sourceText: string
	/**
	 * Optional top-level tikz settings (preamble, environment options) parsed from a JSON save
	 * file. Ignored for TikZ imports — the TikZ transformer synthesises these from
	 * \ctikzset / \usetikzlibrary statements into its own settings object, which callers apply
	 * independently.
	 */
	tikzSettings?: unknown
}

/**
 * Collects diagnostics while an importer runs. Keeps a copy of the source text so it can
 * auto-populate snippets and line counts, and provides terse helpers so the parser/transformer
 * can stay readable.
 */
export class DiagnosticsCollector {
	private readonly items: ImportDiagnostic[] = []
	private readonly sourceLines: string[]

	constructor(public readonly sourceText: string) {
		this.sourceLines = sourceText.split(/\r?\n/)
	}

	error(message: string, opts: Omit<Partial<ImportDiagnostic>, "severity" | "message"> = {}): void {
		this.add({ severity: "error", message, ...opts })
	}

	warning(message: string, opts: Omit<Partial<ImportDiagnostic>, "severity" | "message"> = {}): void {
		this.add({ severity: "warning", message, ...opts })
	}

	info(message: string, opts: Omit<Partial<ImportDiagnostic>, "severity" | "message"> = {}): void {
		this.add({ severity: "info", message, ...opts })
	}

	add(diag: ImportDiagnostic): void {
		if (diag.line && !diag.snippet) {
			const line = this.sourceLines[diag.line - 1]
			if (line !== undefined) {
				diag.snippet = line.trim().slice(0, 240)
			}
		}
		this.items.push(diag)
	}

	all(): ImportDiagnostic[] {
		return this.items.slice()
	}

	count(severity?: DiagnosticSeverity): number {
		return severity === undefined ? this.items.length : this.items.filter((d) => d.severity === severity).length
	}

	hasErrors(): boolean {
		return this.count("error") > 0
	}

	hasAny(): boolean {
		return this.items.length > 0
	}
}

/**
 * Render an ImportResult as a plain-text log. Used by the "Copy log" and "Download log" buttons
 * in the Import Report modal, and by the console fall-back when the modal can't open.
 */
export function formatImportLog(result: ImportResult): string {
	const headerLines = [
		"CircuiTikZ Designer — Import report",
		`Format: ${result.format}`,
		`Components imported: ${result.components.length}`,
		`Errors: ${result.diagnostics.filter((d) => d.severity === "error").length}`,
		`Warnings: ${result.diagnostics.filter((d) => d.severity === "warning").length}`,
		`Info: ${result.diagnostics.filter((d) => d.severity === "info").length}`,
		"",
	]

	if (result.diagnostics.length === 0) {
		return headerLines.concat(["(no diagnostics — import succeeded cleanly)"]).join("\n")
	}

	const bodyLines: string[] = []
	for (const d of result.diagnostics) {
		const loc =
			d.line !== undefined ?
				d.column !== undefined ?
					` (line ${d.line}, col ${d.column})`
				:	` (line ${d.line})`
			:	""
		bodyLines.push(`[${d.severity.toUpperCase()}]${loc} ${d.message}`)
		if (d.snippet) bodyLines.push(`    context: ${d.snippet}`)
		if (d.suggestion) bodyLines.push(`    suggestion: ${d.suggestion}`)
		bodyLines.push("")
	}

	return headerLines.concat(bodyLines).join("\n")
}
