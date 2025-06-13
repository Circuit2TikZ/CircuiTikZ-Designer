import * as SVG from "@svgdotjs/svg.js"
import {
	BooleanProperty,
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ComponentSaveObject,
	ComponentSymbol,
	defaultFill,
	defaultStroke,
	EnumOption,
	InfoProperty,
	SectionHeaderProperty,
	SliderProperty,
	SymbolOption,
	Variant,
} from "../internal"

/**
 * extension of {@link ComponentSaveObject} to also include the circuitikz id and a given name for the component
 */
export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?: string
	scale?: SVG.Point
}

/**
 * super class for all standard circuitikz components, for which all component variants have the same number of ports. (i.e. no mux/ic/variable switches...)
 */
export abstract class CircuitikzComponent extends CircuitComponent {
	public referenceSymbol: ComponentSymbol
	/**
	 * which static symbol is used from the symbol database (i.e. src/data/symbols.svg)
	 */
	protected symbolUse: SVG.Use

	//the untransformed bounding box of the symbol use
	protected symbolBBox: SVG.Box

	protected scaleProperty: SliderProperty
	protected scaleState: SVG.Point

	protected optionProperties: Map<BooleanProperty, SymbolOption>
	protected optionEnumProperties: Map<ChoiceProperty<ChoiceEntry>, EnumOption>
	protected componentVariant: Variant

	/**
	 * The reference to the symbol library component. Has metadata of the symbol
	 * @param symbol which static symbol from the symbols.svg library to use
	 */
	constructor(symbol: ComponentSymbol) {
		super()
		this.displayName = symbol.displayName
		this.referenceSymbol = symbol

		this.optionProperties = new Map()
		this.optionEnumProperties = new Map()

		if (symbol.possibleOptions.length > 0 || symbol.possibleEnumOptions.length > 0) {
			this.propertiesHTMLRows.push(new SectionHeaderProperty("Options").buildHTML())
			for (const option of symbol.possibleOptions) {
				const property = new BooleanProperty(option.displayName ?? option.name, false)
				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionProperties.set(property, option)
				this.propertiesHTMLRows.push(property.buildHTML())
			}
			for (const enumOption of symbol.possibleEnumOptions) {
				let choices: ChoiceEntry[] = enumOption.selectNone ? [{ key: "-", name: "--default--" }] : []
				enumOption.options.forEach((option) =>
					choices.push({ key: option.name, name: option.displayName ?? option.name })
				)
				const property = new ChoiceProperty("Choose:", choices, choices[0])

				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionEnumProperties.set(property, enumOption)
				this.propertiesHTMLRows.push(property.buildHTML())
			}
		}

		this.componentVariant = symbol.getVariant(this.optionsFromProperties())

		this.symbolUse = CanvasController.instance.canvas.use(this.componentVariant.symbol)
		this.symbolUse.fill(defaultFill)
		this.symbolUse.stroke(defaultStroke)
		this.symbolUse.node.style.color = defaultStroke
		this.symbolBBox = this.componentVariant.viewBox

		this.scaleState = new SVG.Point(1, 1)
		this.scaleProperty = new SliderProperty("Scale", 0.1, 10, 0.01, new SVG.Number(1), true)
		this.scaleProperty.addChangeListener((ev) => {
			this.scaleState = new SVG.Point(
				Math.sign(this.scaleState.x) * ev.value.value,
				Math.sign(this.scaleState.y) * ev.value.value
			)
			this.update()
		})
		this.propertiesHTMLRows.push(this.scaleProperty.buildHTML())
	}

	protected optionsFromProperties(): SymbolOption[] {
		const selectedOptions: SymbolOption[] = []
		this.optionProperties.forEach((option, property) => {
			if (property.value) {
				selectedOptions.push(option)
			}
		})
		this.optionEnumProperties.forEach((option, property) => {
			if (property.value.key != "-") {
				selectedOptions.push(option.options.find((o) => o.name == property.value.key))
			}
		})
		return selectedOptions
	}

	protected setPropertiesFromOptions(options: SymbolOption[]) {
		this.optionProperties.forEach((value, property) => {
			if (options.find((op) => op.name == value.name)) {
				property.value = true
			} else {
				property.value = false
			}
			property.updateHTML()
		})
		this.optionEnumProperties.forEach((enumOption, property) => {
			let foundOption = false
			for (const option of enumOption.options) {
				if (options.find((op) => op.name == option.name)) {
					foundOption = true
					property.value = property.entries.find((entry) => entry.key == option.name)
					break
				}
			}
			if (!foundOption) {
				property.value = property.entries[0]
			}
			property.updateHTML()
		})
		this.updateOptions()
	}

	protected updateOptions() {
		this.componentVariant = this.referenceSymbol.getVariant(this.optionsFromProperties())
		this.symbolUse.node.setAttribute("href", "#" + this.componentVariant.symbol.id())
		this.symbolBBox = this.componentVariant.viewBox
	}

	protected addInfo() {
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Info").buildHTML())
		// the tikz id of the component. e.g. "nmos" in "\node[nmos] at (0,0){};"
		this.propertiesHTMLRows.push(new InfoProperty("ID", this.referenceSymbol.tikzName).buildHTML())

		// // if options are used for the component, they will also be shown
		// let tikzOptions = Array.from(this.referenceSymbol._tikzOptions.keys()).join(", ")
		// if (tikzOptions && tikzOptions.length > 0) {
		// 	this.propertiesHTMLRows.push(new InfoProperty("Options", tikzOptions).buildHTML())
		// }
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		let symbolID = this.componentVariant.symbol.id()
		if (!defs.has(symbolID)) {
			const symbol = this.componentVariant.symbol.clone(true, false)
			// symbol.removeElement(symbol.find("metadata")[0])
			// symbol.removeElement(symbol.find('ellipse[stroke="none"][fill="transparent"]')[0])
			defs.set(symbolID, symbol)
		}
		this.labelRendering?.addClass("labelRendering")
		const copiedSVG = this.visualization.clone(true)
		if (this.labelRendering) {
			this.labelRendering.removeClass("labelRendering")
			if (!this.mathJaxLabel.value) {
				copiedSVG.removeElement(copiedSVG.find(".labelRendering")[0])
			} else {
				for (const use of copiedSVG.find(".labelRendering")[0].find("use")) {
					const id = use.node.getAttribute("xlink:href")
					if (!defs.has(id)) {
						defs.set(id, CanvasController.instance.canvas.find(id)[0].clone(true, false))
					}
				}
			}

			copiedSVG.findOne(".labelRendering")?.removeClass("labelRendering")
		}
		return copiedSVG
	}

	protected static idNoOptions(id: string): string {
		return id.split("_").slice(0, 2).join("_")
	}
}
