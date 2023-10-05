/**
 * @module componentSymbol
 */
import { getNamedTag, getNamedTags } from "./xmlHelper";
import * as SVG from "@svgdotjs/svg.js/dist/svg.esm";
import componentInstance from "./componentInstance";

const METADATA_NAMESPACE_URI = "urn:uuid:c93d8327-175d-40b7-bdf7-03205e4f8fc3";

/**
 * @typedef {object} TikZAnchor
 * @property {string} [name] - the anchor name; e.g. G for the gate of a transistor
 * @property {SVGLength} x - anchor x coordinate relative to the symbol mid/anchor; tikz-ish
 * @property {SVGLength} y - anchor y coordinate relative to the symbol mid; positive y is upward (!); tikz-ish
 * @property {SVG.Point} point - the point relative to the symbol = svg-ish
 * @property {boolean} isDefault - true, if the anchor is the default one for placing the node
 */

export default class componentSymbol extends SVG.Symbol {
	/** @type {SVGMetadataElement|null} */
	svgMetadataElement;

	/** @type {string|null} */
	groupName;

	/** @type {SVG.Point} */
	mid;

	/** @type {SVG.Box | null} */
	viewBox;

	/** @type {TikZAnchor[]} */
	pins = [];

	/** @type {TikZAnchor[]} */
	additionalAnchors = [];

	/** @type {TikZAnchor|null} */
	textAnchor = null;

	/** @type {TikZAnchor|null} */
	defaultAnchor = null;

	/**
	 *
	 * @param {SVGSymbolElement} symbolElement
	 */
	constructor(symbolElement) {
		super(symbolElement);
		// this.node.instance = this; // Overwrite node circular reference of SVG.Symbol

		this.svgMetadataElement =
			Array.prototype.find.call(this.node.children, (e) => e instanceof SVGMetadataElement) ?? null;

		// parse symbol
		let componentInformation =
			this.svgMetadataElement &&
			getNamedTag(this.svgMetadataElement, "componentinformation", METADATA_NAMESPACE_URI);

		// parse information in componentInformation attributes
		this.mid = new SVG.Point(
			SVG.Number.ensureInPx(componentInformation.getAttribute("refX") || 0),
			SVG.Number.ensureInPx(componentInformation.getAttribute("refY") || 0)
		);

		if (componentInformation?.hasAttribute("viewBox"))
			this.viewBox = new SVG.Box(componentInformation.getAttribute("viewBox"));
		else if (symbolElement.hasAttribute("viewBox"))
			this.viewBox = new SVG.Box(symbolElement.getAttribute("viewBox"));
		else this.viewBox = null;

		this.groupName = componentInformation.getAttribute("groupName") || null;

		// parse pins & anchors
		let pins = componentInformation && getNamedTag(componentInformation, "pins", METADATA_NAMESPACE_URI);
		let pinArray = pins ? getNamedTags(pins, "pin", METADATA_NAMESPACE_URI) : [];
		this.pins = pinArray.map(this.#parseAnchor, this);

		let additionalAnchors =
			componentInformation && getNamedTag(componentInformation, "additionalAnchors", METADATA_NAMESPACE_URI);
		let additionalAnchorArray = additionalAnchors
			? getNamedTags(additionalAnchors, "anchor", METADATA_NAMESPACE_URI)
			: [];
		this.additionalAnchors = additionalAnchorArray.map(this.#parseAnchor, this);

		let textPosition =
			componentInformation && getNamedTag(componentInformation, "textPosition", METADATA_NAMESPACE_URI);
		this.textAnchor = textPosition ? this.#parseAnchor(textPosition, this) : null;
	}

	/**
	 * Parses an anchor taf (pin, anchor and textPosition). If `isDefault` is set, `this.defaultAnchor` will be set.
	 *
	 * @private
	 *
	 * @param {Element} anchorElement - the element to parse
	 * @returns {TikZAnchor} the parsed anchor
	 */
	#parseAnchor(anchorElement) {
		const numberRegEx = /^(\d*\.)?\d+$/; // "1", ".1", "1.1"; but not "1."
		/** @type {TikZAnchor} */
		let anchor = {
			name: anchorElement.getAttribute("anchorName") || anchorElement.getAttribute("anchorname") || undefined,
			x: anchorElement.getAttribute("x") ?? 0,
			y: anchorElement.getAttribute("y") ?? 0,
			isDefault: anchorElement.getAttribute("isDefault") || anchorElement.getAttribute("isdefault") || false,
		};
		if (typeof anchor.x === "string" && numberRegEx.test(anchor.x)) anchor.x = Number.parseFloat(anchor.x);
		if (typeof anchor.y === "string" && numberRegEx.test(anchor.y)) anchor.y = Number.parseFloat(anchor.y);
		if (typeof anchor.isDefault !== "boolean") anchor.isDefault = anchor.isDefault === "true";

		anchor.point = new SVG.Point(
			this.mid.x + SVG.Number.ensureInPx(anchor.x),
			this.mid.y - SVG.Number.ensureInPx(anchor.y) // tikz y direction != svg y direction
		);

		if (anchor.isDefault) this.defaultAnchor = anchor;

		return anchor;
	}

	/**
	 * Gets all anchors, which make sense for snapping to the grid.
	 * Does not return the `textAnchor`.
	 *
	 * @returns {TikZAnchor[]} all anchors for snapping to the grid
	 */
	get snappingAnchors() {
		return [...this.pins, ...this.additionalAnchors];
	}

	/**
	 * Gets all anchors points, which make sense for snapping to the grid.
	 * Points are relative to the symbol position.
	 * Does not return the `textAnchor`.
	 *
	 * @returns {SVG.Point} all anchor points for snapping to the grid
	 */
	get snappingPoints() {
		return this.snappingAnchors.map((anchor) => anchor.point);
	}

	/**
	 *
	 * @returns {SVG.Use}
	 */
	createInstance() {
		return new SVG.Use(this);
	}

	/**
	 * @typedef {object} DragHandler
	 * @property {SVG.Element} el
	 * @property {SVG.Box} box
	 * @property {SVG.Point} lastClick
	 * @property {(ev: MouseEvent) => void} startDrag
	 * @property {(ev: MouseEvent) => void} drag
	 * @property {(ev: MouseEvent) => void} endDrag
	 */

	/**
	 * @param {SVG.Container} container
	 * @param {MouseEvent} event
	 */
	addInstanceToContainer(container, event) {
		return new componentInstance(this, container, event);
	}
}
