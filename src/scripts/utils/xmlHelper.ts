/**
 * Useful functions for traversing an DOM or XML tree.
 * @module xmlHelper
 */

//-- Helper functions
/**
 * Searches a child node by name and by an additional filter if present.
 *
 * @param {Element} root - the root node to find the child
 * @param {string} tagName - the name of the xml tag to find; compared ignoring case
 * @param {string} [namespaceURI] - compare the namespace; case sensitive
 * @param {function(Element): boolean} [additionalFilter] - filter function returning true if node matches the criteria
 * @returns {Element|null} the found node or null if not found
 */
export function getNamedTag(root: Element, tagName: string, namespaceURI: string, additionalFilter: (arg0: Element) => boolean = null): Element | null {
	tagName = tagName.toLowerCase();
	return Array.prototype.find.call(
		root.children,
		(node: Element) =>
			// node.nodeType === Node.ELEMENT_NODE && // node instanceof Element; not needed if .children is used
			(namespaceURI
				? tagName == node.localName.toLowerCase() && namespaceURI == node.namespaceURI
				: node.tagName.toLowerCase() === tagName) &&
			(!additionalFilter || additionalFilter(node))
	);
}

/**
 * Filters child nodes by name and by an additional filter if present.
 *
 * @param {Element} root - the root node to find the children
 * @param {string} tagName - the name of the xml tag to filter; compared ignoring case
 * @param {string} [namespaceURI] - compare the namespace; case sensitive
 * @param {function(Element): boolean} [additionalFilter] - filter function returning true if node matches the criteria
 * @returns {Element[]} the filtered nodes (may be empty)
 */
export function getNamedTags(root: Element, tagName: string, namespaceURI: string, additionalFilter: (arg0: Element) => boolean = null): Element[] {
	return Array.prototype.filter.call(
		/** @type {HTMLCollection} */ root.children,
		(/** @type {Element} */ node: Element) =>
			(namespaceURI
				? tagName == node.localName.toLowerCase() && namespaceURI == node.namespaceURI
				: node.tagName.toLowerCase() === tagName) &&
			(!additionalFilter || additionalFilter(node))
	);
}
