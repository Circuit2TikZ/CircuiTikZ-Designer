import { Modal } from "bootstrap"
import FileSaver from "file-saver"
import { ImportController, ImportDiagnostic, ImportResult, formatImportLog } from "../internal"

/**
 * Owns the Import Report modal. Rendered after every import that produces diagnostics (and also
 * on user request via the "Import report" link in the main import modal — Stage 9).
 *
 * Design goals:
 *   • Make it obvious what went wrong, in plain English.
 *   • Let the user jump from a diagnostic to the exact line in the source.
 *   • Offer a "Fix and retry" shortcut so the user doesn't have to re-paste everything.
 *   • Keep the markup self-contained so we don't spray DOM queries across the codebase.
 */
export class ImportReportController {
	private static _instance: ImportReportController
	public static get instance(): ImportReportController {
		if (!ImportReportController._instance) {
			ImportReportController._instance = new ImportReportController()
		}
		return ImportReportController._instance
	}

	private modalElement: HTMLDivElement
	private modal: Modal

	private summaryEl: HTMLDivElement
	private diagnosticsList: HTMLDivElement
	private sourceEl: HTMLTextAreaElement

	private copyBtn: HTMLButtonElement
	private downloadBtn: HTMLButtonElement
	private retryBtn: HTMLButtonElement

	/** The result currently on screen — null when the modal is closed. */
	private currentResult: ImportResult | null = null

	private constructor() {
		this.modalElement = document.getElementById("importReportModal") as HTMLDivElement
		this.modal = new Modal(this.modalElement)

		this.summaryEl = document.getElementById("importReportSummary") as HTMLDivElement
		this.diagnosticsList = document.getElementById("importReportDiagnostics") as HTMLDivElement
		this.sourceEl = document.getElementById("importReportSource") as HTMLTextAreaElement

		this.copyBtn = document.getElementById("importReportCopy") as HTMLButtonElement
		this.downloadBtn = document.getElementById("importReportDownload") as HTMLButtonElement
		this.retryBtn = document.getElementById("importReportRetry") as HTMLButtonElement

		this.copyBtn.addEventListener("click", () => this.copyLog())
		this.downloadBtn.addEventListener("click", () => this.downloadLog())
		this.retryBtn.addEventListener("click", () => this.retry())

		this.modalElement.addEventListener(
			"hidden.bs.modal",
			() => {
				this.currentResult = null
			},
			{ passive: true }
		)
	}

	/**
	 * Show the modal for the given import result. Caller decides whether to show the modal — this
	 * controller never auto-opens itself.
	 */
	public show(result: ImportResult): void {
		this.currentResult = result
		this.renderSummary(result)
		this.renderDiagnostics(result.diagnostics)
		this.sourceEl.value = result.sourceText
		this.sourceEl.scrollTop = 0
		this.modal.show()
	}

	/**
	 * Close the modal programmatically (rare — the user normally dismisses it).
	 */
	public hide(): void {
		this.modal.hide()
	}

	// --------------------------------------------------------------------- //
	// Rendering
	// --------------------------------------------------------------------- //

	private renderSummary(result: ImportResult): void {
		const errors = result.diagnostics.filter((d) => d.severity === "error").length
		const warnings = result.diagnostics.filter((d) => d.severity === "warning").length
		const info = result.diagnostics.filter((d) => d.severity === "info").length

		let cls: string
		let icon: string
		let headline: string
		if (errors > 0 && result.components.length === 0) {
			cls = "alert alert-danger"
			icon = "error"
			headline = "Nothing was imported."
		} else if (errors > 0) {
			cls = "alert alert-warning"
			icon = "warning"
			headline = `Imported ${result.components.length} component${result.components.length === 1 ? "" : "s"}, but ran into some problems.`
		} else if (warnings > 0) {
			cls = "alert alert-warning"
			icon = "warning"
			headline = `Imported ${result.components.length} component${result.components.length === 1 ? "" : "s"} with ${warnings} warning${warnings === 1 ? "" : "s"}.`
		} else {
			cls = "alert alert-success"
			icon = "check_circle"
			headline = `Imported ${result.components.length} component${result.components.length === 1 ? "" : "s"} cleanly.`
		}

		this.summaryEl.className = `${cls} d-flex gap-2 align-items-start mb-3`
		this.summaryEl.innerHTML = ""

		const iconSpan = document.createElement("span")
		iconSpan.className = "material-symbols-outlined"
		iconSpan.textContent = icon
		this.summaryEl.appendChild(iconSpan)

		const textDiv = document.createElement("div")
		const strong = document.createElement("strong")
		strong.textContent = headline
		textDiv.appendChild(strong)

		const detail = document.createElement("div")
		detail.className = "small"
		const bits: string[] = []
		if (errors > 0) bits.push(`${errors} error${errors === 1 ? "" : "s"}`)
		if (warnings > 0) bits.push(`${warnings} warning${warnings === 1 ? "" : "s"}`)
		if (info > 0) bits.push(`${info} note${info === 1 ? "" : "s"}`)
		detail.textContent = bits.length > 0 ? bits.join(" · ") : "No issues."
		textDiv.appendChild(detail)

		this.summaryEl.appendChild(textDiv)
	}

	private renderDiagnostics(diags: ImportDiagnostic[]): void {
		this.diagnosticsList.innerHTML = ""

		if (diags.length === 0) {
			const empty = document.createElement("div")
			empty.className = "text-muted small p-3"
			empty.textContent = "No issues to report."
			this.diagnosticsList.appendChild(empty)
			return
		}

		// Sort: errors first, then warnings, then info. Within each severity, by line number.
		const severityRank: Record<string, number> = { error: 0, warning: 1, info: 2 }
		const sorted = diags.slice().sort((a, b) => {
			const ra = severityRank[a.severity] ?? 3
			const rb = severityRank[b.severity] ?? 3
			if (ra !== rb) return ra - rb
			const la = a.line ?? Number.POSITIVE_INFINITY
			const lb = b.line ?? Number.POSITIVE_INFINITY
			return la - lb
		})

		for (const d of sorted) {
			this.diagnosticsList.appendChild(this.buildDiagnosticItem(d))
		}
	}

	private buildDiagnosticItem(d: ImportDiagnostic): HTMLElement {
		const item = document.createElement("button")
		item.type = "button"
		item.className = "list-group-item list-group-item-action d-flex flex-column gap-1 text-start"
		item.setAttribute("aria-label", `${d.severity}: ${d.message}`)

		const header = document.createElement("div")
		header.className = "d-flex align-items-center gap-2 flex-wrap"

		// Severity pill
		const sev = document.createElement("span")
		sev.className = `badge ${severityBadgeClass(d.severity)}`
		sev.textContent = d.severity.toUpperCase()
		header.appendChild(sev)

		// Line / column badge
		if (d.line !== undefined) {
			const loc = document.createElement("span")
			loc.className = "badge text-bg-secondary"
			loc.textContent = d.column !== undefined ? `line ${d.line}:${d.column}` : `line ${d.line}`
			header.appendChild(loc)
		}

		// Main message
		const msg = document.createElement("span")
		msg.className = "flex-grow-1"
		msg.textContent = d.message
		header.appendChild(msg)

		item.appendChild(header)

		// Context snippet
		if (d.snippet) {
			const snip = document.createElement("code")
			snip.className = "small text-body-secondary d-block text-break"
			snip.textContent = d.snippet
			item.appendChild(snip)
		}

		// Suggestion
		if (d.suggestion) {
			const sug = document.createElement("div")
			sug.className = "small fst-italic text-info-emphasis"
			sug.textContent = "Tip: " + d.suggestion
			item.appendChild(sug)
		}

		// Click to highlight source
		item.addEventListener("click", () => this.highlightSourceLine(d.line, d.column))

		return item
	}

	/**
	 * Select the given line in the source textarea and scroll it into view. Done with the
	 * textarea's native selection because it's simple and reliable — no custom highlighter
	 * overlay to keep in sync with wrapping / resizing.
	 */
	private highlightSourceLine(line?: number, column?: number): void {
		if (line === undefined) return

		const text = this.sourceEl.value
		const lines = text.split("\n")
		if (line < 1 || line > lines.length) return

		let start = 0
		for (let i = 0; i < line - 1; i++) start += lines[i].length + 1 // +1 for \n
		const lineLen = lines[line - 1]?.length ?? 0
		const end = start + lineLen

		// If column is known, refine selection to a single character for precise visual pointer.
		const selStart = column !== undefined ? start + Math.max(0, column - 1) : start
		const selEnd = column !== undefined ? Math.min(end, selStart + 1) : end

		this.sourceEl.focus()
		this.sourceEl.setSelectionRange(selStart, selEnd)

		// Manual scroll: textareas don't autoscroll the selection into view across browsers.
		const lineHeight = parseFloat(getComputedStyle(this.sourceEl).lineHeight) || 16
		this.sourceEl.scrollTop = Math.max(0, (line - 3) * lineHeight)
	}

	// --------------------------------------------------------------------- //
	// Footer actions
	// --------------------------------------------------------------------- //

	private copyLog(): void {
		if (!this.currentResult) return
		const text = formatImportLog(this.currentResult)
		navigator.clipboard.writeText(text).catch((err) => {
			console.warn("Copy failed:", err)
		})
	}

	private downloadLog(): void {
		if (!this.currentResult) return
		const text = formatImportLog(this.currentResult)
		FileSaver.saveAs(new Blob([text], { type: "text/plain;charset=utf-8" }), "circuitikz-import-report.log")
	}

	private retry(): void {
		if (!this.currentResult) return
		const { sourceText, format } = this.currentResult
		this.modal.hide()
		// Give the hide animation a frame so two modals don't fight over focus.
		setTimeout(() => {
			ImportController.instance.openForRetry(sourceText, format)
		}, 200)
	}
}

function severityBadgeClass(severity: string): string {
	switch (severity) {
		case "error":
			return "text-bg-danger"
		case "warning":
			return "text-bg-warning"
		case "info":
			return "text-bg-info"
		default:
			return "text-bg-secondary"
	}
}
