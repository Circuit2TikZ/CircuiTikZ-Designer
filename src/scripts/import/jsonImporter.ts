import { DiagnosticsCollector, ImportResult, currentSaveVersion } from "../internal"

/**
 * Parse a JSON save file into an {@link ImportResult} without applying it to the canvas.
 *
 * This stays a pure function — applying components to the scene is the job of
 * `applyImportResult`. Separating parse from apply means we can surface diagnostics before we
 * touch user state, and the caller can decide whether to proceed when there are errors.
 *
 * Diagnostic policy (to match the "don't just fail" requirement):
 *   • JSON syntax errors produce a single diagnostic with line/column extracted from the error
 *     message; we return a result with zero components so the user can retry.
 *   • Schema anomalies (missing fields, wrong types) produce warnings but we still hand back
 *     whatever components we could rescue.
 *   • Unknown save-file versions produce an info note — we don't refuse, we just flag.
 */
export function importFromJSON(sourceText: string): ImportResult {
	const collector = new DiagnosticsCollector(sourceText)

	// --------------------- JSON.parse with location recovery -------------- //
	let parsed: unknown
	try {
		parsed = JSON.parse(sourceText)
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		const loc = jsonErrorLocation(msg, sourceText)
		collector.error("The file isn't valid JSON.", {
			line: loc.line,
			column: loc.column,
			suggestion:
				"Common causes: a trailing comma, an unmatched brace or bracket, or an unescaped quote. " +
				"Opening the file in a JSON validator (or pasting it into the browser's console as JSON.parse) " +
				"will point at the exact character.",
			code: "json-syntax",
		})
		// Retain the raw parser message as an info note for completeness.
		collector.info("Raw parser message: " + msg, { code: "json-syntax-raw" })
		return {
			format: "json",
			success: false,
			components: [],
			diagnostics: collector.all(),
			sourceText,
		}
	}

	// --------------------- Schema validation ------------------------------ //
	// Legacy format (pre-0.6): the root is a plain array of components. We preserve support for
	// this for backwards compatibility and flag it so the user knows to re-save.
	if (Array.isArray(parsed)) {
		collector.warning(
			"This file uses the old save format (no 'version' field). It will import, but we recommend re-saving it to avoid issues with future releases.",
			{ code: "legacy-format", suggestion: "After import, press Save to write a fresh file in the current format." }
		)
		return {
			format: "json",
			success: true,
			components: normalizeComponentsArray(parsed, collector),
			diagnostics: collector.all(),
			sourceText,
		}
	}

	if (parsed === null || typeof parsed !== "object") {
		collector.error(
			"The JSON was valid but didn't contain a save file — expected an object with a 'components' array.",
			{ code: "schema-root", suggestion: "Make sure the file is a save exported from this app." }
		)
		return {
			format: "json",
			success: false,
			components: [],
			diagnostics: collector.all(),
			sourceText,
		}
	}

	const root = parsed as Record<string, unknown>

	// Version check — not required for import, but the user deserves a heads-up on mismatch.
	const version = typeof root.version === "string" ? root.version : undefined
	if (version === undefined) {
		collector.warning(
			"This save file has no 'version' field — it may have been produced by an old release. Importing anyway.",
			{ code: "schema-version", suggestion: "Re-save after import to upgrade the file to the current format." }
		)
	} else if (version !== currentSaveVersion) {
		collector.info(
			`Save-file version ${version} differs from the current ${currentSaveVersion}. Importing — we'll do our best to translate any differences.`,
			{ code: "version-mismatch" }
		)
	}

	// Components: required array.
	if (!Array.isArray(root.components)) {
		collector.error(
			"The save file is missing its 'components' list (or it isn't an array). There's nothing to import.",
			{ code: "schema-components", suggestion: "Check that the file was written by this app's Save button." }
		)
		return {
			format: "json",
			success: false,
			components: [],
			diagnostics: collector.all(),
			sourceText,
		}
	}

	// tikzSettings: optional; if present must be an object.
	let tikzSettings: unknown = undefined
	if (root.tikzSettings !== undefined) {
		if (typeof root.tikzSettings === "object" && root.tikzSettings !== null) {
			tikzSettings = root.tikzSettings
		} else {
			collector.warning(
				"The 'tikzSettings' field was present but wasn't an object — skipping it and keeping your current settings.",
				{ code: "schema-tikzsettings" }
			)
		}
	}

	return {
		format: "json",
		success: true,
		components: normalizeComponentsArray(root.components, collector),
		tikzSettings,
		diagnostics: collector.all(),
		sourceText,
	}
}

/**
 * Sanity-check each entry in a components array, dropping obvious garbage with a warning. We
 * don't try to hydrate here — that's `applyImportResult`'s job — but we do make sure each entry
 * at least has a `type` string so the downstream factory lookup has something to work with.
 */
function normalizeComponentsArray(raw: unknown[], collector: DiagnosticsCollector): any[] {
	const out: any[] = []
	for (let i = 0; i < raw.length; i++) {
		const entry = raw[i]
		if (entry === null || typeof entry !== "object") {
			collector.warning(`Component #${i + 1} in the save file wasn't an object — skipped.`, {
				code: "schema-component-shape",
			})
			continue
		}
		const type = (entry as Record<string, unknown>).type
		if (typeof type !== "string" || type.length === 0) {
			collector.warning(`Component #${i + 1} has no 'type' field — skipped.`, {
				code: "schema-component-type",
				suggestion: "Every component needs a 'type' (e.g. 'wire', 'node', 'rect'). This one will be ignored.",
			})
			continue
		}
		out.push(entry)
	}
	return out
}

/**
 * Best-effort extraction of line/column from a JSON.parse error message. Different engines write
 * the location differently; we try the two common forms.
 */
function jsonErrorLocation(msg: string, source: string): { line?: number; column?: number } {
	// V8: "Unexpected token } in JSON at position 123"
	const posMatch = msg.match(/position\s+(\d+)/)
	if (posMatch) {
		const pos = Math.max(0, parseInt(posMatch[1], 10))
		const clipped = source.slice(0, pos)
		const line = clipped.split(/\r?\n/).length
		const lastNL = clipped.lastIndexOf("\n")
		const column = lastNL === -1 ? pos + 1 : pos - lastNL
		return { line, column }
	}
	// SpiderMonkey/others: "line 3 column 5"
	const lcMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
	if (lcMatch) {
		return { line: parseInt(lcMatch[1], 10), column: parseInt(lcMatch[2], 10) }
	}
	return {}
}
