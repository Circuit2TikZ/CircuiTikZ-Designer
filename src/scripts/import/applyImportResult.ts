import {
	CanvasController,
	CircuitComponent,
	DiagnosticsCollector,
	EnvironmentVariableController,
	GlobalTikzSettings,
	ImportResult,
	SaveController,
	SelectionController,
	SelectionMode,
	Undo,
	currentSaveVersion,
} from "../internal"

export interface ApplyOptions {
	/** Clear the existing scene before applying the import (the "Remove existing components" checkbox). */
	removeExisting: boolean
	/** Select the newly imported components on the canvas so the user can see what landed. */
	selectImported: boolean
	/** The collector to extend with per-component hydration diagnostics. Caller owns it. */
	collector: DiagnosticsCollector
	/** Zoom / pan the canvas so the imported components land in view. Defaults to true. */
	fitViewAfter?: boolean
}

/**
 * Apply an {@link ImportResult} to the canvas.
 *
 * Runs inside a single Undo boundary (one `Undo.addState` at the end) so the whole import is
 * revertible with one Ctrl+Z. Each individual component hydration is wrapped in try/catch — one
 * bad component can never abort the others, and every failure ends up as a diagnostic in the
 * caller's collector.
 *
 * Returns the hydrated components (for Stage 8's auto-select + fit-view work, currently handled
 * inline here).
 */
export function applyImportResult(result: ImportResult, opts: ApplyOptions): CircuitComponent[] {
	// --------------------- Clear existing scene if requested ----------------
	if (opts.removeExisting) {
		SelectionController.instance.selectAll()
		SelectionController.instance.removeSelection()
	}

	// PathSymbolComponent.fromJson branches on SaveController.currentlyLoadedSaveVersion: an empty
	// string puts it into the "legacy id_foo_bar" parser. Our TikZ transformer and the modern JSON
	// importer both emit modern save objects, so force the version into "current" before we start
	// hydrating. This is idempotent — a subsequent real JSON load will reset it.
	if (!SaveController.instance.currentlyLoadedSaveVersion) {
		SaveController.instance.currentlyLoadedSaveVersion = currentSaveVersion
	}

	// --------------------- TikZ settings ----------------------------------- //
	if (result.tikzSettings) {
		try {
			EnvironmentVariableController.instance.fromJson(result.tikzSettings as GlobalTikzSettings)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			opts.collector.warning("Couldn't apply imported TikZ settings — keeping your current ones.", {
				suggestion: "Raw error: " + msg,
				code: "tikzsettings-apply",
			})
		}
	}

	// --------------------- Per-component hydration ------------------------- //
	const hydrated: CircuitComponent[] = []
	for (let i = 0; i < result.components.length; i++) {
		const saveObj = result.components[i]
		const declaredType = (saveObj as { type?: string })?.type ?? "unknown"
		try {
			const c = CircuitComponent.fromJson(saveObj)
			if (c) {
				hydrated.push(c)
			} else {
				// fromJson returned nothing — the constructor opted out silently.
				opts.collector.warning(
					`Component #${i + 1} (type "${declaredType}") was skipped by the app — the format may be out of date.`,
					{ code: "component-skipped" }
				)
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			const isUnknownType = msg.includes("no component of type")
			opts.collector.error(
				isUnknownType ?
					`Component #${i + 1}: I don't recognise the type "${declaredType}".`
				:	`Component #${i + 1} (type "${declaredType}") couldn't be loaded.`,
				{
					suggestion:
						isUnknownType ?
							"This component type isn't available in the current version. The rest of the circuit was imported."
						:	"Raw error: " + msg,
					code: isUnknownType ? "component-unknown-type" : "component-hydration",
				}
			)
		}
	}

	// --------------------- Post-apply bookkeeping -------------------------- //
	if (opts.selectImported && hydrated.length > 0) {
		SelectionController.instance.deactivateSelection()
		SelectionController.instance.activateSelection()
		SelectionController.instance.selectComponents(hydrated, SelectionMode.RESET)
	}

	// Fit view. We skip this when the user asked us not to, or when the import is a partial /
	// additive save-file load where the user might prefer their current camera. For TikZ imports,
	// coordinates often land far from the canvas origin, so fitting the view is almost always
	// the right default.
	const shouldFit = opts.fitViewAfter ?? true
	if (shouldFit && hydrated.length > 0) {
		try {
			CanvasController.instance.fitView()
		} catch (err) {
			// fitView depends on SVG bboxes being populated, which requires the components to be
			// rendered. If we're running during a reset race, swallow the error — the user still
			// has the imported circuit, just with the camera unchanged.
			const msg = err instanceof Error ? err.message : String(err)
			opts.collector.info("Couldn't auto-fit the view — the import itself succeeded.", {
				code: "fit-view-skipped",
				suggestion: "Raw error: " + msg,
			})
		}
	}

	Undo.addState()

	return hydrated
}
