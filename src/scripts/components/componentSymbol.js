/**
 * @module componentSymbol
 */

import * as SVG from "@svgdotjs/svg.js";

import { getNamedTag, getNamedTags } from "../utils/xmlHelper";

/** @typedef {import("./componentInstance")} ComponentInstance */

const METADATA_NAMESPACE_URI = "urn:uuid:c93d8327-175d-40b7-bdf7-03205e4f8fc3";

/**
 * @typedef {object} TikZAnchor
 * @property {string} [name] - the anchor name; e.g. G for the gate of a transistor
 * @property {SVGLength} x - anchor x coordinate relative to the symbol mid/anchor; tikz-ish
 * @property {SVGLength} y - anchor y coordinate relative to the symbol mid; positive y is upward (!); tikz-ish
 * @property {SVG.Point} point - the point relative to the symbol = svg-ish
 * @property {boolean} isDefault - true, if the anchor is the default one for placing the node
 */

/**
 * @typedef {object} SymbolBaseInformation
 * @property {?SVGMetadataElement} svgMetadataElement -
 * @property {?Element} componentInformation -
 * @property {boolean} isNode - `true`, if type=="node"
 * @property {boolean} isPath - `true`, if type=="path"
 * @property {?string} displayName - the name to show in the UI
 * @property {?string} tikzName - the tikz name used to draw, if found
 * @property {?string} shapeName - the shape name for path-style components, if found
 * @property {?string} groupName - the group the component belongs to, if set
 * @property {SVG.Point} mid - the point of the SVG Symbol, which corresponds to TikZs (0|0); anchors and pins are relative to this point
 * @property {?SVG.Box} viewBox - the viewBox/boundingBox, if set
 */

/**
 * Representation of a symbol. This class has sub classes describing path- and node-style symbols.
 * @class
 */
export default class ComponentSymbol extends SVG.Symbol {
	/** @type {?SVGMetadataElement} */
	svgMetadataElement;

	/** @type {string} */
	displayName;
	/** @type {string} */
	tikzName;
	/** @type {?string} */
	groupName;

	/** @type {SVG.Point} */
	relMid;
	/** @type {?SVG.Box} */
	viewBox;

	/** @type {Map<string,?string>} */
	_tikzOptions;
	/** @type {TikZAnchor[]} */
	_pins = [];
	/** @type {TikZAnchor[]} */
	_additionalAnchors = [];
	/** @type {?TikZAnchor} */
	_textAnchor = null;
	/** @type {?TikZAnchor} */
	_defaultAnchor = null;

	/**
	 * Creates a new symbol from a `SVGSymbolElement`.
	 *
	 * @param {SVGSymbolElement} symbolElement - the element containing the symbol & metadata
	 * @param {SymbolBaseInformation} [baseInformation] - base information if already extracted using {@link getBaseInformation}
	 * @throws {Error} if the XML structure lacks the required metadata
	 */
	constructor(symbolElement, baseInformation) {
		super(symbolElement);
		// this.node.instance = this; // Overwrite node circular reference of SVG.Symbol

		// parse information in componentInformation attributes, if not done already
		if (!baseInformation) baseInformation = ComponentSymbol.getBaseInformation(symbolElement);
		if (!baseInformation.svgMetadataElement || !baseInformation.displayName || !baseInformation.tikzName)
			throw new Error("Missing metadata for creating the component");

		this.svgMetadataElement = baseInformation.svgMetadataElement;
		this.displayName = baseInformation.displayName;
		this.tikzName = baseInformation.tikzName;
		this.groupName = baseInformation.groupName;
		this.relMid = baseInformation.mid;
		this.viewBox = baseInformation.viewBox;

		// parse additional options (key, value or just key)
		let tikzOptions =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "tikzOptions", METADATA_NAMESPACE_URI);
		let tikzOptionArray = tikzOptions ? getNamedTags(tikzOptions, "option", METADATA_NAMESPACE_URI) : [];
		this._tikzOptions = new Map(
			tikzOptionArray.map((rawOption) => {
				const key = rawOption?.getAttribute("key") ?? null;
				const value = rawOption?.getAttribute("value") ?? null;
				return [key, value];
			})
		);

		// parse pins & anchors
		let pins =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "pins", METADATA_NAMESPACE_URI);
		let pinArray = pins ? getNamedTags(pins, "pin", METADATA_NAMESPACE_URI) : [];
		this._pins = pinArray.map(this.#parseAnchor, this);

		let additionalAnchors =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "additionalAnchors", METADATA_NAMESPACE_URI);
		let additionalAnchorArray = additionalAnchors
			? getNamedTags(additionalAnchors, "anchor", METADATA_NAMESPACE_URI)
			: [];
		this._additionalAnchors = additionalAnchorArray.map(this.#parseAnchor, this);

		let textPosition =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "textPosition", METADATA_NAMESPACE_URI);
		this._textAnchor = textPosition ? this.#parseAnchor(textPosition, this) : null;
	}

	/**
	 * Extract base information/metadata of a `SVGSymbolElement`.
	 * @param {SVGSymbolElement} symbolElement - the element to extract the information from
	 * @returns {SymbolBaseInformation} the extracted information
	 */
	static getBaseInformation(symbolElement) {
		/** @type {?SVGMetadataElement} */
		const svgMetadataElement =
			Array.prototype.find.call(symbolElement.children, (e) => e instanceof SVGMetadataElement) ?? null;

		// parse symbol
		const componentInformation =
			svgMetadataElement && getNamedTag(svgMetadataElement, "componentinformation", METADATA_NAMESPACE_URI);

		// parse information in componentInformation attributes
		const isNode = componentInformation?.getAttribute("type") === "node";
		const isPath = componentInformation?.getAttribute("type") === "path";

		const tikzName = componentInformation?.getAttribute("tikzName") ?? null;
		const displayName = componentInformation?.getAttribute("displayName") ?? tikzName;
		const shapeName = componentInformation?.getAttribute("shapeName") ?? null;
		const groupName = componentInformation?.getAttribute("groupName") ?? null;

		/** @type {SVG.Point} */
		const mid = new SVG.Point(
			SVG.Number.ensureInPx(componentInformation?.getAttribute("refX") || 0),
			SVG.Number.ensureInPx(componentInformation?.getAttribute("refY") || 0)
		);

		/** @type {?SVG.Box} */
		let viewBox;
		if (componentInformation?.hasAttribute("viewBox"))
			viewBox = new SVG.Box(componentInformation.getAttribute("viewBox"));
		else if (symbolElement.hasAttribute("viewBox")) viewBox = new SVG.Box(symbolElement.getAttribute("viewBox"));
		else viewBox = null;

		return {
			svgMetadataElement: svgMetadataElement,
			componentInformation: componentInformation,
			isNode: isNode,
			isPath: isPath,
			displayName: displayName,
			tikzName: tikzName,
			shapeName: shapeName,
			groupName: groupName,
			mid: mid,
			viewBox: viewBox,
		};
	}

	/**
	 * Parses an anchor (pin, anchor and textPosition). If `isDefault` is set, `this.defaultAnchor` will be set.
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
			SVG.Number.ensureInPx(anchor.x),
			SVG.Number.ensureInPx(anchor.y)
		);

		if (anchor.isDefault) this._defaultAnchor = anchor;

		return anchor;
	}

	/**
	 * Generate a instance of a symbol. Call this function on subclasses only.
	 *
	 * @param {SVG.Container} container - the container to add the instance to
	 * @param {MouseEvent} event - the event which triggered the adding
	 * @param {function():void} finishedPlacingCallback callback getting called when the element has been placed
	 * @returns {ComponentInstance} the new instance
	 */
	addInstanceToContainer(container, event, finishedPlacingCallback) {
		throw new Error("Not implemented; use subclasses");
	}

	/**
	 * Serializes the CircuiTikZ-options in the syntax "keyWithoutValue, keyWith=Value, ...".
	 *
	 * @returns {string} - the serialized options
	 */
	serializeTikzOptions() {
		return Array.from(this._tikzOptions.entries(), ([key, value]) => (value ? key + "=" + value : key)).join(", ");
	}
}
