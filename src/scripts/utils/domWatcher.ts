/**
 * Functions for waiting on DOM loading/DOM changes applying.
 *
 * @module DOMWatcher
 */

/**
 * Wait for a document load state.
 * Does by default wait for the `"interactive"` state (DOM loaded), but the `targetState` can also be set to
 * `"complete"` (document fully loaded).
 *
 * @param {Document} [doc=document] - the document to check the `readyState`
 * @param {"interactive"|"complete"} [targetState="complete"] - the "minimum" state to wait for
 * @returns {Promise<Document>} the loaded document
 */
export async function waitForDOMLoaded(doc = document, targetState = "interactive") {
	/** @type {DocumentReadyState[]} */
	const targetStates = targetState == "complete" ? ["complete"] : ["interactive", "complete"]
	if (!targetStates.includes(doc.readyState)) {
		// not yet loaded
		return new Promise((resolve) => {
			const eventListener = (/** @type {Event} */ event) => {
				if (targetStates.includes(event.target.readyState)) {
					// DOM loaded
					doc.removeEventListener("readystatechange", eventListener)
					resolve(event.target)
				}
			}
			doc.addEventListener("readystatechange", eventListener)
		})
	}
	return doc
}

/**
 * Wait for an element to be done loading.
 *
 * Supported elements:
 *
 * 	- {@link HTMLScriptElement}: waits on entire document to be complete
 * 	- {@link HTMLImageElement}: fully supported
 * 	- {@link HTMLObjectElement}: fully supported for object containing XML-like data
 *
 * @template {HTMLElement|string} T
 * @param {T} id - the element or its id
 * @param {Document} [doc=document] - the containing document
 * @returns {Promise<T extends HTMLElement ? (T|null) : HTMLElement>} the element
 */
export async function waitForElementLoaded(id, doc = document) {
	/** @type {HTMLElement|null} */
	let element
	if (id instanceof HTMLElement) {
		element = id
	} else {
		// Minimum document state: DOM loaded
		doc = (await waitForDOMLoaded(doc, "interactive")) as Document
		element = doc.getElementById(id)
		if (!element) return element // Not found
	}

	// There is no good solution for scripts --> entire document should be loaded completely
	if (element instanceof HTMLScriptElement) return waitForDOMLoaded(doc, "complete").then(() => element)

	const objDocumentStates = ["inactive", "complete"]
	const SVG_MIME = "image/svg+xml"

	if (
		!(element instanceof HTMLImageElement || element instanceof HTMLObjectElement) || // element without external source? --> done
		(element instanceof HTMLImageElement && element.complete) || // <-- for images
		(element instanceof HTMLObjectElement &&
			(!element.data ||
				(element.type === SVG_MIME &&
					objDocumentStates.includes(element.getSVGDocument?.()?.readyState ?? "")) ||
				(element.type !== SVG_MIME && objDocumentStates.includes(element.contentDocument?.readyState ?? ""))))
	)
		return element

	return new Promise((resolve) => element.addEventListener("load", () => resolve(element), { once: true }))
}

/**
 * @todo Test & document
 * @template {Element} T
 * @param {T} element
 * @returns {Promise<T>}
 */
export function waitForElementHasChildren(element) {
	return new Promise((resolve) => {
		if (element.children && element.children.length > 0) resolve(element)
		window.requestAnimationFrame(() => waitForElementHasChildren(element).then(() => resolve(element)))
	})
}
