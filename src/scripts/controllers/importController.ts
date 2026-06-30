import { Modal, Tab } from "bootstrap"
import {
	DiagnosticsCollector,
	ImportReportController,
	ImportResult,
	applyImportResult,
	importFromJSON,
	transformTikz,
} from "../internal"

/**
 * What the user wants to import.
 * - "auto"  : infer from the content (file extension or paste text).
 * - "json"  : force JSON save-file parsing.
 * - "tikz"  : force CircuiTikZ LaTeX parsing.
 */
export type ImportFormat = "auto" | "json" | "tikz"

/**
 * Which tab the import modal should show when opened.
 */
export type ImportTab = "upload" | "paste"

/**
 * Owner of the unified Import modal (JSON + CircuiTikZ paste + file upload).
 *
 * SaveController delegates its legacy {@link SaveController.load} entry point here, so that every
 * import path in the application goes through a single validated pipeline (paving the way for the
 * diagnostic infrastructure in Stage 2).
 */
export class ImportController {
	private static _instance: ImportController
	public static get instance(): ImportController {
		if (!ImportController._instance) {
			ImportController._instance = new ImportController()
		}
		return ImportController._instance
	}

	private modalElement: HTMLDivElement
	private modal: Modal

	// Tabs
	private tabUpload: HTMLButtonElement
	private tabPaste: HTMLButtonElement

	// Upload-tab DOM
	private loadInput: HTMLInputElement
	private loadMessage: HTMLSpanElement
	private loadArea: HTMLDivElement
	private loadAreaBackground: HTMLDivElement

	// Paste-tab DOM
	private pasteTextArea: HTMLTextAreaElement
	private pasteDetectionHint: HTMLSpanElement
	private pasteFormatAuto: HTMLInputElement
	private pasteFormatJSON: HTMLInputElement
	private pasteFormatTikZ: HTMLInputElement

	// Shared footer
	private importButton: HTMLButtonElement
	private loadCheckRemove: HTMLInputElement

	/**
	 * Pending file selected via Browse / Drag-drop. Read lazily when the user clicks Import so that
	 * we never block on a large file the user may still change their mind about.
	 */
	private pendingFile: File | null = null

	/**
	 * Inferred format for the pending file, based on its extension. Used when the Upload tab is
	 * active; the Paste tab uses the radio buttons instead.
	 */
	private pendingFileFormat: ImportFormat = "auto"

	private constructor() {
		this.modalElement = document.getElementById("loadModal") as HTMLDivElement
		this.modal = new Modal(this.modalElement)

		this.tabUpload = document.getElementById("importTabUpload") as HTMLButtonElement
		this.tabPaste = document.getElementById("importTabPaste") as HTMLButtonElement

		this.loadInput = document.getElementById("file-input") as HTMLInputElement
		this.loadMessage = document.getElementById("load-message") as HTMLSpanElement
		this.loadArea = document.getElementById("dragdroparea") as HTMLDivElement
		this.loadAreaBackground = document.getElementById("dragdropbackground") as HTMLDivElement

		this.pasteTextArea = document.getElementById("pasteTextArea") as HTMLTextAreaElement
		this.pasteDetectionHint = document.getElementById("pasteDetectionHint") as HTMLSpanElement
		this.pasteFormatAuto = document.getElementById("pasteFormatAuto") as HTMLInputElement
		this.pasteFormatJSON = document.getElementById("pasteFormatJSON") as HTMLInputElement
		this.pasteFormatTikZ = document.getElementById("pasteFormatTikZ") as HTMLInputElement

		this.importButton = document.getElementById("loadJSONButton") as HTMLButtonElement
		this.loadCheckRemove = document.getElementById("loadCheckRemove") as HTMLInputElement

		this.wireUploadArea()
		this.wirePasteArea()
		this.wireImportButton()

		// Reset transient state when the modal fully closes.
		this.modalElement.addEventListener("hidden.bs.modal", () => this.resetState(), { passive: true })
	}

	/**
	 * Open the import modal.
	 *
	 * @param tab       Which tab to activate. Defaults to "upload" for parity with the legacy
	 *                  Load flow; pass "paste" for the new CircuiTikZ-paste entry point.
	 * @param format    For the paste tab, which format radio to pre-select. Ignored for uploads.
	 */
	public open(tab: ImportTab = "upload", format: ImportFormat = "auto"): void {
		this.resetState()

		if (tab === "paste") {
			Tab.getOrCreateInstance(this.tabPaste).show()
			this.selectPasteFormat(format)
			// Defer focus until after the Bootstrap show animation so it actually lands in the
			// textarea rather than being stolen by the modal focus trap.
			this.tabPaste.addEventListener(
				"shown.bs.tab",
				() => {
					this.pasteTextArea.focus()
				},
				{ once: true }
			)
		} else {
			Tab.getOrCreateInstance(this.tabUpload).show()
		}

		this.modal.show()
	}

	/**
	 * Hide the modal programmatically — e.g. after a successful import.
	 */
	public close(): void {
		this.modal.hide()
	}

	/**
	 * Re-open the modal on the Paste tab with an existing source already in the textarea. Used by
	 * the "Fix and retry" button in the Import Report modal so the user never loses their work.
	 */
	public openForRetry(sourceText: string, format: ImportFormat): void {
		this.resetState()
		Tab.getOrCreateInstance(this.tabPaste).show()
		this.selectPasteFormat(format)
		this.pasteTextArea.value = sourceText
		// Fire input so the detection hint updates.
		this.pasteTextArea.dispatchEvent(new Event("input", { bubbles: true }))
		this.tabPaste.addEventListener(
			"shown.bs.tab",
			() => {
				this.pasteTextArea.focus()
				this.pasteTextArea.setSelectionRange(sourceText.length, sourceText.length)
			},
			{ once: true }
		)
		this.modal.show()
	}

	// --------------------------------------------------------------------- //
	// Wiring
	// --------------------------------------------------------------------- //

	private wireUploadArea(): void {
		const showDropShade = () => (this.loadAreaBackground.style.opacity = "0.3")
		const hideDropShade = () => (this.loadAreaBackground.style.opacity = "0")

		this.loadArea.addEventListener("dragenter", showDropShade)
		this.loadArea.addEventListener("dragleave", hideDropShade)
		this.loadArea.addEventListener("drop", hideDropShade)

		this.loadInput.addEventListener("change", () => {
			const file = this.loadInput.files?.[0] ?? null
			this.setPendingFile(file)
		})
	}

	private wirePasteArea(): void {
		// Live auto-detect hint as the user types.
		const updateHint = () => {
			const selected = this.getSelectedPasteFormat()
			if (selected !== "auto") {
				this.pasteDetectionHint.textContent = ""
				return
			}
			const detected = ImportController.detectFormat(this.pasteTextArea.value)
			if (!this.pasteTextArea.value.trim()) {
				this.pasteDetectionHint.textContent = ""
			} else if (detected === "json") {
				this.pasteDetectionHint.textContent = "Looks like JSON."
			} else if (detected === "tikz") {
				this.pasteDetectionHint.textContent = "Looks like CircuiTikZ."
			} else {
				this.pasteDetectionHint.textContent = "Unrecognised — pick a format."
			}
		}

		this.pasteTextArea.addEventListener("input", updateHint)
		this.pasteFormatAuto.addEventListener("change", updateHint)
		this.pasteFormatJSON.addEventListener("change", updateHint)
		this.pasteFormatTikZ.addEventListener("change", updateHint)
	}

	private wireImportButton(): void {
		this.importButton.addEventListener("click", () => {
			this.performImport().catch((err) => {
				// Final safety net — Stage 2 replaces this with a diagnostic report.
				console.error("Import failed:", err)
				alert("Import failed: " + (err instanceof Error ? err.message : String(err)))
			})
		})
	}

	// --------------------------------------------------------------------- //
	// Import dispatch (delegates to format-specific importers)
	// --------------------------------------------------------------------- //

	private async performImport(): Promise<void> {
		const activeTab = this.getActiveTab()
		let sourceText: string
		let format: ImportFormat

		if (activeTab === "upload") {
			if (!this.pendingFile) {
				this.loadMessage.textContent = "No file selected"
				return
			}
			sourceText = await this.pendingFile.text()
			format = this.pendingFileFormat === "auto" ? ImportController.detectFormat(sourceText) : this.pendingFileFormat
		} else {
			sourceText = this.pasteTextArea.value
			if (!sourceText.trim()) {
				this.pasteDetectionHint.textContent = "Nothing to import — paste something first."
				return
			}
			const chosen = this.getSelectedPasteFormat()
			format = chosen === "auto" ? ImportController.detectFormat(sourceText) : chosen
		}

		if (format === "json") {
			this.importJSON(sourceText)
		} else if (format === "tikz") {
			this.importTikZ(sourceText)
		} else {
			// Unknown format — surface a clear message rather than crashing. Stage 2 upgrades this
			// to a proper diagnostic report.
			alert(
				"Could not recognise the content as either JSON or CircuiTikZ.\n\n" +
					"Tip: for JSON, the content should start with '{' and contain a \"components\" array. " +
					"For CircuiTikZ, it should contain \\begin{tikzpicture} or at least one \\draw / \\node line."
			)
		}
	}

	/**
	 * Parse a JSON save file and apply it to the canvas, with full diagnostic reporting.
	 */
	private importJSON(text: string): void {
		const result = importFromJSON(text)
		this.finishImport(result)
	}

	/**
	 * Parse CircuiTikZ source code and load the resulting components. Delegates to the Stage 4–7
	 * pipeline (tokenize → parse → transform) which produces an {@link ImportResult} that flows
	 * through the same `finishImport` path as JSON imports.
	 *
	 * Parsing is deliberately never-throwing: every branch inside the pipeline collects diagnostics
	 * instead of bailing out, so even a half-valid paste gives the user something actionable in the
	 * Import Report modal.
	 */
	private importTikZ(text: string): void {
		let result: ImportResult
		try {
			result = transformTikz(text)
		} catch (err) {
			// Defensive — the pipeline shouldn't throw, but if it does we surface it as a
			// diagnostic rather than crashing the UI.
			const collector = new DiagnosticsCollector(text)
			const msg = err instanceof Error ? err.message : String(err)
			collector.error("Something went wrong while parsing your CircuiTikZ code.", {
				code: "tikz-unexpected",
				suggestion:
					"This is almost always a bug in the importer rather than in your file — please keep a copy of the source. Raw message: " +
					msg,
			})
			result = {
				format: "tikz",
				success: false,
				components: [],
				diagnostics: collector.all(),
				sourceText: text,
			}
		}
		this.finishImport(result)
	}

	/**
	 * Shared post-parse path. Applies the result to the canvas (if we have anything to apply) and
	 * surfaces the Import Report modal whenever there are diagnostics to show.
	 */
	private finishImport(result: ImportResult): void {
		// Only apply if we actually have components — parsers return success:false with no
		// components when parsing failed outright.
		if (result.components.length > 0) {
			const collector = new DiagnosticsCollector(result.sourceText)
			// Re-seed with the parser's diagnostics so the hydration diagnostics join the same list.
			for (const d of result.diagnostics) collector.add(d)

			applyImportResult(result, {
				removeExisting: this.loadCheckRemove.checked,
				selectImported: true,
				collector,
			})

			// Rebuild the final result with the augmented diagnostics list.
			result = { ...result, diagnostics: collector.all() }
		}

		this.modal.hide()

		// Show the report modal either when there are any diagnostics or when nothing could be
		// imported — the user always needs to see why an import went wrong.
		if (result.diagnostics.length > 0 || result.components.length === 0) {
			// Small delay so the hide animation of the import modal doesn't fight with the report
			// modal's show animation (Bootstrap 5 stacks modals but focus transfer is nicer with a
			// tiny gap).
			setTimeout(() => ImportReportController.instance.show(result), 180)
		}
	}

	// --------------------------------------------------------------------- //
	// State & helpers
	// --------------------------------------------------------------------- //

	private resetState(): void {
		this.pendingFile = null
		this.pendingFileFormat = "auto"
		this.loadInput.value = ""
		this.loadMessage.textContent = "No file selected"
		this.pasteDetectionHint.textContent = ""
	}

	private setPendingFile(file: File | null): void {
		this.pendingFile = file
		if (!file) {
			this.loadMessage.textContent = "No file selected"
			this.pendingFileFormat = "auto"
			return
		}
		this.pendingFileFormat = ImportController.formatFromFilename(file.name)
		const formatLabel =
			this.pendingFileFormat === "json" ? " — JSON"
			: this.pendingFileFormat === "tikz" ? " — CircuiTikZ"
			: ""
		this.loadMessage.textContent = file.name + formatLabel
	}

	private getActiveTab(): ImportTab {
		return this.tabPaste.classList.contains("active") ? "paste" : "upload"
	}

	private getSelectedPasteFormat(): ImportFormat {
		if (this.pasteFormatJSON.checked) return "json"
		if (this.pasteFormatTikZ.checked) return "tikz"
		return "auto"
	}

	private selectPasteFormat(format: ImportFormat): void {
		if (format === "json") this.pasteFormatJSON.checked = true
		else if (format === "tikz") this.pasteFormatTikZ.checked = true
		else this.pasteFormatAuto.checked = true
	}

	/**
	 * Infer import format from a filename's extension.
	 */
	public static formatFromFilename(name: string): ImportFormat {
		const lower = name.toLowerCase()
		if (lower.endsWith(".json")) return "json"
		if (lower.endsWith(".tex") || lower.endsWith(".tikz") || lower.endsWith(".pgf")) return "tikz"
		// .txt and anything else fall through to content-based detection.
		return "auto"
	}

	/**
	 * Infer import format by peeking at the content. Conservative — returns "auto" when nothing
	 * obvious is present so the caller can surface a helpful error instead of guessing wrong.
	 */
	public static detectFormat(text: string): ImportFormat {
		const trimmed = text.trim()
		if (!trimmed) return "auto"

		// JSON: starts with '{' or '[' and parses as JSON.
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				JSON.parse(trimmed)
				return "json"
			} catch {
				// Not actually valid JSON — fall through to TikZ check.
			}
		}

		// CircuiTikZ: look for the signature commands. We check for either the tikzpicture
		// environment or bare \draw / \node / \ctikzset / \usetikzlibrary usages. This is
		// intentionally loose so that partial snippets still import.
		if (/\\begin\s*\{\s*(circuitikz|tikzpicture)\s*\}/i.test(trimmed)) return "tikz"
		if (/\\(draw|node|ctikzset|usetikzlibrary|path)\b/.test(trimmed)) return "tikz"

		return "auto"
	}
}
