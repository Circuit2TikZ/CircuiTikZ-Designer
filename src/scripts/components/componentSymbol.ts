import * as SVG from "@svgdotjs/svg.js"
import { ensureInPx } from "../utils/impSVGNumber"
import { CanvasController } from "../internal"

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
	selected?: boolean
}

export type EnumOption = {
	options: SymbolOption[]
	selectNone: boolean
	displayName: string
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
		const variants = componentMetadata.getElementsByTagName("variant")

		const firstSymbol = componentMetadata.ownerDocument.getElementById(variants[0].getAttribute("for"))
		super(firstSymbol)
		this.isNodeSymbol = componentMetadata.getAttribute("type") == "node"

		this.tikzName = componentMetadata?.getAttribute("tikz") ?? null
		this.displayName = componentMetadata?.getAttribute("display") ?? this.tikzName
		this.groupName = componentMetadata?.getAttribute("group") ?? null

		const tikzOptions = componentMetadata.getElementsByTagName("options")[0]
		if (tikzOptions) {
			this.possibleEnumOptions = Array.from(tikzOptions.getElementsByTagName("enumopt")).map<EnumOption>(
				(enumOption) => {
					return {
						options: Array.from(enumOption.getElementsByTagName("option")).map(
							this.optionMetadataToSymbolOption
						),
						selectNone:
							enumOption.hasAttribute("selectNone") ?
								enumOption.getAttribute("selectNone") == "true"
							:	true,
						displayName: enumOption.getAttribute("name") ?? "Choose an option",
					}
				}
			)
			this.possibleOptions = Array.from(tikzOptions.getElementsByTagName("option"))
				.filter((option) => {
					return option.parentElement.tagName == "options"
				})
				.map<SymbolOption>((option) => this.optionMetadataToSymbolOption(option))
		} else {
			this.possibleOptions = []
			this.possibleEnumOptions = []
		}

		this.viewBox = new SVG.Box(variants[0].getAttribute("viewBox"))
		this._mapping = new Map<string, Variant>()
		for (const variant of variants) {
			// get options
			var symbolOptions = this.getOptionsFromOptionNames(
				Array.from(variant.getElementsByTagName("option")).map((option) => option.getAttribute("name"))
			)

			const symbolID = variant.getAttribute("for")
			const symbol = new SVG.Symbol(componentMetadata.ownerDocument.getElementById(symbolID))

			let maxStroke = 0
			if (symbol.node.id) {
				symbol.node.querySelectorAll("[stroke-width]").forEach((item) => {
					let strokeWidth = Number.parseFloat(item.getAttribute("stroke-width"))
					maxStroke = strokeWidth > maxStroke ? strokeWidth : maxStroke
				})

				// udpate the bbox for a tighter fit
				let use = CanvasController.instance.canvas.use(symbol.node.id)
				let usenode = use.node as SVGGraphicsElement
				const domrect = usenode.getBBox({ stroke: true, markers: true })

				let box = new SVG.Box(domrect.x, domrect.y, domrect.width, domrect.height)

				variant.setAttribute("viewBox", box.toString())
				use.remove()
			}

			let pinArray = Array.from(variant.getElementsByTagName("pin")) ?? []
			const pins = pinArray.map(this.parseAnchor, this)
			const defaultAnchor = pins.find((pin) => pin.isDefault) || {
				name: "center",
				x: new SVG.Number(),
				y: new SVG.Number(),
				isDefault: true,
				point: new SVG.Point(0, 0),
			}

			const textPositionElement = variant.getElementsByTagName("textpos")[0]
			let textAnchor: TikZAnchor
			if (textPositionElement) {
				textAnchor = this.parseAnchor(textPositionElement)
				textAnchor.name = "text"
			} else {
				textAnchor = defaultAnchor
			}

			var variantObject: Variant = {
				mid: new SVG.Point(
					ensureInPx(variant.getAttribute("x") ?? 0),
					ensureInPx(variant.getAttribute("y") ?? 0)
				),
				viewBox: new SVG.Box(variant.getAttribute("viewBox")),
				symbol: new SVG.Symbol(componentMetadata.ownerDocument.getElementById(symbolID)),
				pins: pins,
				textPosition: textAnchor,
				defaultAnchor: defaultAnchor,
				options: symbolOptions,
				maxStroke: maxStroke,
			}

			const clickElement = symbol
				.rect(variantObject.viewBox.width, variantObject.viewBox.height)
				.center(variantObject.viewBox.cx, variantObject.viewBox.cy)
			clickElement.fill("transparent").stroke("none").addClass("clickBackground")

			symbol.add(clickElement)

			this._mapping.set(this.optionsToStringArray(symbolOptions).join(", "), variantObject)
		}

		const first = this._mapping.values().toArray()[0]
		this.symbolElement = first.symbol
		this.maxStroke = first.maxStroke
	}

	private optionMetadataToSymbolOption(option: Element): SymbolOption {
		return {
			name: option.getAttribute("name"),
			displayName: option.getAttribute("display") ?? undefined,
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
				return option.name
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
			name: anchorElement.getAttribute("name") || anchorElement.getAttribute("anchorname") || undefined,
			x: new SVG.Number(anchorElement.getAttribute("x") ?? "0"),
			y: new SVG.Number(anchorElement.getAttribute("y") ?? "0"),
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

	public getOptionsFromOptionNames(options: string[]): SymbolOption[] {
		const result: SymbolOption[] = []

		function optionsEqual(opt1: SymbolOption, opt2: string): boolean {
			const optionReplaced = opt2.replaceAll(" ", "-")
			return (
				(opt1.displayName ? opt1.displayName.replaceAll(" ", "-") == optionReplaced : false) ||
				opt1.name.replaceAll(" ", "-") == optionReplaced
			)
		}

		for (const option of options) {
			let foundOption = this.possibleOptions.find((value) => optionsEqual(value, option))
			if (foundOption) {
				result.push(foundOption)
			} else {
				for (const enumOption of this.possibleEnumOptions) {
					foundOption = enumOption.options.find((value) => optionsEqual(value, option))
					if (foundOption) {
						result.push(foundOption)
						break
					}
				}
			}
		}

		return result
	}
	public getOptionsFromSymbolID(id: string): SymbolOption[] {
		const idSplit = id.split(this.tikzName.replaceAll(" ", "-"))[1]
		if (idSplit == "") {
			return []
		}
		const options: string[] = idSplit.split("_").slice(1)
		return this.getOptionsFromOptionNames(options)
	}
}
