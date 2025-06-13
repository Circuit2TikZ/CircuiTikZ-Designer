import * as SVG from "@svgdotjs/svg.js"
import { ensureInPx } from "../utils/impSVGNumber"
import { getNamedTag, getNamedTags } from "../utils/xmlHelper"
import { CanvasController } from "../internal"

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

export type SymbolOption = {
	name: string
	displayName?: string
	value?: string
	selected?: boolean
}

export type EnumOption = {
	options: SymbolOption[]
	selectNone: boolean
}

export type Variant = {
	mid: SVG.Point
	viewBox: SVG.Box
	options: SymbolOption[]
	symbol: SVG.Symbol
	pins: TikZAnchor[]
	textPosition: TikZAnchor
	defaultAnchor: TikZAnchor
	maxStroke: number
}

/**
 * Representation of a symbol and its metadata
 */
export class ComponentSymbol extends SVG.Symbol {
	_mapping: Map<string, Variant>

	possibleOptions: SymbolOption[]
	possibleEnumOptions: EnumOption[]

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

	viewBox: SVG.Box | null
	isNodeSymbol: boolean
	symbolElement: SVG.Symbol

	/**
	 * which tikz options where used for this symbol
	 */
	_tikzOptions: SymbolOption[]

	maxStroke: number = 0

	constructor(componentMetadata: Element) {
		const variants = getNamedTags(componentMetadata, "variant", METADATA_NAMESPACE_URI)
		const firstSymbol = componentMetadata.ownerDocument.getElementById(variants[0].getAttribute("for"))
		super(firstSymbol)
		this.isNodeSymbol = componentMetadata.getAttribute("type") == "node"

		this.tikzName = componentMetadata?.getAttribute("tikzName") ?? null
		this.displayName = componentMetadata?.getAttribute("displayName") ?? this.tikzName
		this.groupName = componentMetadata?.getAttribute("groupName") ?? null

		const tikzOptions = getNamedTag(componentMetadata, "tikzOptions", METADATA_NAMESPACE_URI)
		if (tikzOptions) {
			this.possibleEnumOptions = getNamedTags(tikzOptions, "enumOption", METADATA_NAMESPACE_URI).map<EnumOption>(
				(enumOption) => {
					return {
						options: getNamedTags(enumOption, "option", METADATA_NAMESPACE_URI).map(
							this.optionMetadataToSymbolOption
						),
						selectNone:
							enumOption.hasAttribute("selectNone") ?
								enumOption.getAttribute("selectNone") == "true"
							:	true,
					}
				}
			)
			this.possibleOptions = getNamedTags(tikzOptions, "option", METADATA_NAMESPACE_URI)
				.filter((option) => {
					return option.parentElement.tagName == "ci:tikzOptions"
				})
				.map<SymbolOption>((option) => this.optionMetadataToSymbolOption(option))
		} else {
			this.possibleOptions = []
			this.possibleEnumOptions = []
		}

		this._mapping = new Map<string, Variant>()
		for (const variant of variants) {
			// get options
			var symbolOptions: SymbolOption[] = getNamedTags(
				variant,
				"option",
				METADATA_NAMESPACE_URI
			).map<SymbolOption>((option) => this.optionMetadataToSymbolOption(option))

			const symbolID = variant.getAttribute("for")
			const symbol = new SVG.Symbol(componentMetadata.ownerDocument.getElementById(symbolID))

			let maxStroke = 0
			if (symbol.node.id) {
				// udpate the bbox for a tighter fit
				symbol.node.querySelectorAll("[stroke-width]").forEach((item) => {
					let strokeWidth = Number.parseFloat(item.getAttribute("stroke-width"))
					maxStroke = strokeWidth > maxStroke ? strokeWidth : maxStroke
				})

				let use = CanvasController.instance.canvas.use(symbol.node.id)
				let usenode = use.node as SVGGraphicsElement
				const domrect = usenode.getBBox({ stroke: true })
				use.remove()

				let box = new SVG.Box(domrect.x, domrect.y, domrect.width, domrect.height)

				variant.setAttribute("viewBox", box.toString())
			}

			let pinArray = getNamedTags(variant, "pin", METADATA_NAMESPACE_URI) ?? []
			const pins = pinArray.map(this.parseAnchor, this)
			const defaultAnchor = pins.find((pin) => pin.isDefault) || {
				name: "center",
				x: new SVG.Number(),
				y: new SVG.Number(),
				isDefault: true,
				point: new SVG.Point(0, 0),
			}

			const textPositionElement = getNamedTag(variant, "textPosition", METADATA_NAMESPACE_URI)

			var variantObject: Variant = {
				mid: new SVG.Point(
					ensureInPx(variant.getAttribute("refX") || 0),
					ensureInPx(variant.getAttribute("refY") || 0)
				),
				viewBox: new SVG.Box(variant.getAttribute("viewBox")),
				symbol: new SVG.Symbol(componentMetadata.ownerDocument.getElementById(symbolID)),
				pins: pins,
				textPosition: textPositionElement ? this.parseAnchor(textPositionElement) : defaultAnchor,
				defaultAnchor: defaultAnchor,
				options: symbolOptions,
				maxStroke: maxStroke,
			}

			const clickElement = symbol.rect(variantObject.viewBox.width, variantObject.viewBox.height)
			clickElement.fill("transparent").stroke("none").addClass("clickBackground")

			symbol.add(clickElement)

			this._mapping.set(this.optionsToStringArray(symbolOptions).join(", "), variantObject)
		}

		const first = this._mapping.values().toArray()[0]
		this.symbolElement = first.symbol
		this.viewBox = first.viewBox
		this.maxStroke = first.maxStroke
	}

	private optionMetadataToSymbolOption(option: Element) {
		return {
			name: option.getAttribute("key"),
			displayName: option.getAttribute("displayName") ?? undefined,
			value: option.getAttribute("value") ?? undefined,
		}
	}

	public optionsToStringArray(options: SymbolOption[]) {
		return options
			.sort((a, b) => {
				if (a.name < b.name) {
					return -1
				} else if (a.name > b.name) {
					return 1
				}
				return 0
			})
			.map((option) => {
				return option.name + (option.value ? "=" + option.value : "")
			})
	}

	public getVariant(options: SymbolOption[]): Variant {
		return this._mapping.get(this.optionsToStringArray(options).join(", "))
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

		return anchor
	}

	public getOptionsFromSymbolID(id: string): SymbolOption[] {
		const idSplit = id.split(this.tikzName.replaceAll(" ", "-"))[1]
		if (idSplit == "") {
			return []
		}
		const options: string[] = idSplit.split("_").slice(1)
		const result: SymbolOption[] = []

		for (const option of options) {
			let foundOption = this.possibleOptions.find((value) => value.name.replaceAll(" ", "-") == option)
			if (foundOption) {
				result.push(foundOption)
			} else {
				for (const enumOption of this.possibleEnumOptions) {
					foundOption = enumOption.options.find((value) => value.name == option)
					if (foundOption) {
						result.push(foundOption)
						break
					}
				}
			}
		}

		return result
	}
}
