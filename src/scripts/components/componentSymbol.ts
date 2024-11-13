import * as SVG from "@svgdotjs/svg.js"
import { ensureInPx } from "../utils/impSVGNumber"
import { getNamedTag, getNamedTags } from "../utils/xmlHelper"

const METADATA_NAMESPACE_URI = "urn:uuid:c93d8327-175d-40b7-bdf7-03205e4f8fc3"

/**
 * a point where one can snap to relative to the component position
 */
export type TikZAnchor = {
	name?: string
	x: SVG.Number
	y: SVG.Number
	point?: SVG.Point
	isDefault: boolean
}

type SymbolBaseInformation = {
	svgMetadataElement?: SVGMetadataElement
	componentInformation?: Element
	isNode: boolean
	isPath: boolean
	displayName?: string
	tikzName?: string
	shapeName?: string
	groupName?: string
	mid: SVG.Point
	viewBox?: SVG.Box
}

/**
 * Representation of a symbol and its metadata
 */
export class ComponentSymbol extends SVG.Symbol {
	svgMetadataElement: SVGMetadataElement | null

	/**
	 * what the component is called
	 */
	displayName: string
	/**
	 * the tikz id
	 */
	tikzName: string
	/**
	 * in which group the symbol is located
	 */
	groupName: string | null

	/**
	 * the delta of the component position relative to the upper left corner of the symbol
	 */
	relMid: SVG.Point
	viewBox: SVG.Box | null
	isNodeSymbol: boolean

	/**
	 * which tikz options where used for this symbol
	 */
	_tikzOptions: Map<string, string | null>
	_pins: TikZAnchor[] = []
	_additionalAnchors: TikZAnchor[] = []
	/**
	 * where the text should be placed
	 */
	_textPosition: TikZAnchor | null = null
	_defaultAnchor: TikZAnchor | null = null

	/**
	 * Creates a new symbol from a `SVGSymbolElement`.
	 *
	 * @param {SVGSymbolElement} symbolElement - the element containing the symbol & metadata
	 * @param {SymbolBaseInformation} [baseInformation] - base information if already extracted using {@link getBaseInformation}
	 * @throws {Error} if the XML structure lacks the required metadata
	 */
	constructor(symbolElement: SVGSymbolElement, baseInformation: SymbolBaseInformation) {
		super(symbolElement)

		// parse information in componentInformation attributes, if not done already
		if (!baseInformation) baseInformation = ComponentSymbol.getBaseInformation(symbolElement)
		if (!baseInformation.svgMetadataElement || !baseInformation.displayName || !baseInformation.tikzName)
			throw new Error("Missing metadata for creating the component")

		this.isNodeSymbol = baseInformation.isNode

		this.svgMetadataElement = baseInformation.svgMetadataElement
		this.displayName = baseInformation.displayName
		this.tikzName = baseInformation.tikzName
		this.groupName = baseInformation.groupName
		this.relMid = baseInformation.mid
		this.viewBox = baseInformation.viewBox

		// parse additional options (key, value or just key)
		let tikzOptions =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "tikzOptions", METADATA_NAMESPACE_URI)
		let tikzOptionArray = tikzOptions ? getNamedTags(tikzOptions, "option", METADATA_NAMESPACE_URI) : []
		this._tikzOptions = new Map(
			tikzOptionArray.map((rawOption) => {
				const key = rawOption?.getAttribute("key") ?? null
				const value = rawOption?.getAttribute("value") ?? null
				return [key, value]
			})
		)

		// parse pins & anchors
		let pins =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "pins", METADATA_NAMESPACE_URI)
		let pinArray = pins ? getNamedTags(pins, "pin", METADATA_NAMESPACE_URI) : []
		this._pins = pinArray.map(this.parseAnchor, this)

		let additionalAnchors =
			baseInformation.componentInformation &&
			getNamedTag(baseInformation.componentInformation, "additionalAnchors", METADATA_NAMESPACE_URI)
		let additionalAnchorArray =
			additionalAnchors ? getNamedTags(additionalAnchors, "anchor", METADATA_NAMESPACE_URI) : []
		this._additionalAnchors = additionalAnchorArray.map(this.parseAnchor, this)

		this._textPosition =
			this._additionalAnchors.find((tikzanchor) => {
				tikzanchor.name == "textPosition"
			}) ?? this._defaultAnchor
	}

	/**
	 * Extract base information/metadata of a `SVGSymbolElement`.
	 * @param {SVGSymbolElement} symbolElement - the element to extract the information from
	 * @returns {SymbolBaseInformation} the extracted information
	 */
	static getBaseInformation(symbolElement: SVGSymbolElement): SymbolBaseInformation {
		/** @type {?SVGMetadataElement} */
		const svgMetadataElement: SVGMetadataElement | null =
			Array.prototype.find.call(symbolElement.children, (e) => e instanceof SVGMetadataElement) ?? null

		// parse symbol
		const componentInformation =
			svgMetadataElement && getNamedTag(svgMetadataElement, "componentinformation", METADATA_NAMESPACE_URI)

		// parse information in componentInformation attributes
		const isNode = componentInformation?.getAttribute("type") === "node"
		const isPath = componentInformation?.getAttribute("type") === "path"

		const tikzName = componentInformation?.getAttribute("tikzName") ?? null
		const displayName = componentInformation?.getAttribute("displayName") ?? tikzName
		const shapeName = componentInformation?.getAttribute("shapeName") ?? null
		const groupName = componentInformation?.getAttribute("groupName") ?? null

		const mid: SVG.Point = new SVG.Point(
			ensureInPx(componentInformation?.getAttribute("refX") || 0),
			ensureInPx(componentInformation?.getAttribute("refY") || 0)
		)

		let viewBox: SVG.Box | null
		if (componentInformation?.hasAttribute("viewBox"))
			viewBox = new SVG.Box(componentInformation.getAttribute("viewBox"))
		else if (symbolElement.hasAttribute("viewBox")) viewBox = new SVG.Box(symbolElement.getAttribute("viewBox"))
		else viewBox = null

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
		}
	}

	/**
	 * Parses an anchor (pin, anchor and textPosition). If `isDefault` is set, `this.defaultAnchor` will be set.
	 *
	 * @param {Element} anchorElement - the element to parse
	 * @returns {TikZAnchor} the parsed anchor
	 */
	private parseAnchor(anchorElement: Element): TikZAnchor {
		const numberRegEx = /^(\d*\.)?\d+$/ // "1", ".1", "1.1"; but not "1."
		let anchor: TikZAnchor = {
			name: anchorElement.getAttribute("anchorName") || anchorElement.getAttribute("anchorname") || undefined,
			x: new SVG.Number(anchorElement.getAttribute("x")),
			y: new SVG.Number(anchorElement.getAttribute("y")),
			isDefault:
				Boolean(anchorElement.getAttribute("isDefault")) ||
				Boolean(anchorElement.getAttribute("isdefault")) ||
				false,
		}
		if (typeof anchor.x === "string" && numberRegEx.test(anchor.x)) anchor.x = new SVG.Number(anchor.x)
		if (typeof anchor.y === "string" && numberRegEx.test(anchor.y)) anchor.y = new SVG.Number(anchor.y)
		if (typeof anchor.isDefault !== "boolean") anchor.isDefault = anchor.isDefault === "true"

		anchor.point = new SVG.Point(ensureInPx(anchor.x), ensureInPx(anchor.y))

		if (anchor.isDefault) this._defaultAnchor = anchor

		return anchor
	}

	/**
	 * Serializes the CircuiTikZ-options in the syntax "keyWithoutValue, keyWith=Value, ...".
	 *
	 * @returns {string} - the serialized options
	 */
	public serializeTikzOptions(): string {
		return Array.from(this._tikzOptions.entries(), ([key, value]) => (value ? key + "=" + value : key)).join(", ")
	}
}
