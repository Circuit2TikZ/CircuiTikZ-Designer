import * as SVG from "@svgdotjs/svg.js"
import {
	BooleanProperty,
	buildTikzStringFromNodeCommand,
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ComponentSymbol,
	defaultFill,
	defaultStroke,
	EnumOption,
	InfoProperty,
	MainController,
	NodeComponent,
	NodeSaveObject,
	PropertyCategories,
	SaveController,
	SectionHeaderProperty,
	SliderProperty,
	SnappingInfo,
	SnapPoint,
	SymbolOption,
	TikzNodeCommand,
	Variant,
} from "../internal"
import { selectedBoxWidth } from "../utils/selectionHelper"

export type NodeSymbolSaveObject = NodeSaveObject & {
	id: string
	options?: string[]
}

/**
 * The class representing all node components which are based on static symbols from the symbol database, i.e. node circuitikz symbols
 */
export class NodeSymbolComponent extends NodeComponent {
	private static jsonID = "node"
	static {
		CircuitComponent.jsonSaveMap.set(NodeSymbolComponent.jsonID, NodeSymbolComponent)
	}
	/**
	 * All the possible symbol variants for this node component.
	 */
	public referenceSymbol: ComponentSymbol
	/**
	 * which static symbol is used from the symbol database (i.e. src/data/symbols.svg)
	 */
	protected symbolUse: SVG.Use

	protected optionProperties: Map<BooleanProperty, SymbolOption>
	protected optionEnumProperties: Map<ChoiceProperty<ChoiceEntry>, EnumOption>
	protected componentVariant: Variant

	protected scaleProperty: SliderProperty

	constructor(symbol: ComponentSymbol) {
		super()
		this.displayName = symbol.displayName
		this.referenceSymbol = symbol

		this.optionProperties = new Map()
		this.optionEnumProperties = new Map()

		this.scaleState = new SVG.Point(1, 1)
		this.scaleProperty = new SliderProperty("Scale", 0.1, 10, 0.01, new SVG.Number(1), true)
		this.scaleProperty.addChangeListener((ev) => {
			this.scaleState = new SVG.Point(
				Math.sign(this.scaleState.x) * ev.value.value,
				Math.sign(this.scaleState.y) * ev.value.value
			)
			this.update()
		})
		this.properties.add(PropertyCategories.manipulation, this.scaleProperty)

		// initialize UI for options handling
		if (symbol.possibleOptions.length > 0 || symbol.possibleEnumOptions.length > 0) {
			this.properties.add(PropertyCategories.options, new SectionHeaderProperty("Options"))
			for (const option of symbol.possibleOptions) {
				const property = new BooleanProperty(option.displayName ?? option.name, false)
				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionProperties.set(property, option)
				this.properties.add(PropertyCategories.options, property)
			}
			for (const enumOption of symbol.possibleEnumOptions) {
				let choices: ChoiceEntry[] = enumOption.selectNone ? [{ key: "-", name: "--default--" }] : []
				enumOption.options.forEach((option) => {
					choices.push({ key: option.name, name: option.displayName ?? option.name })
				})
				const property = new ChoiceProperty(enumOption.displayName, choices, choices[0])

				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionEnumProperties.set(property, enumOption)
				this.properties.add(PropertyCategories.options, property)
			}
		}

		this.componentVariant = symbol.getVariant(this.optionsFromProperties())
		this.size = new SVG.Point(this.componentVariant.viewBox.w, this.componentVariant.viewBox.h)
		this.defaultTextPosition = this.componentVariant.textPosition.point.add(this.componentVariant.mid)

		this.symbolUse = CanvasController.instance.canvas.use(this.componentVariant.symbol)
		this.symbolUse.fill(defaultFill)
		this.symbolUse.stroke(defaultStroke)
		this.symbolUse.node.style.color = defaultStroke
		this.referencePosition = this.componentVariant.mid
		this.visualization.add(this.symbolUse)
		this.dragElement = this.symbolUse

		this.addInfo()

		this.snappingPoints = this.componentVariant.pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))
		)
	}

	public resizable(resize: boolean): void {}

	protected optionsFromProperties(): SymbolOption[] {
		const selectedOptions: SymbolOption[] = []
		this.optionProperties.forEach((option, property) => {
			if (property.value) {
				selectedOptions.push(option)
			}
		})
		this.optionEnumProperties.forEach((option, property) => {
			if (property.value.key != "-") {
				selectedOptions.push(
					option.options.find((o) => {
						return o.name == property.value.key
					})
				)
			}
		})
		return selectedOptions
	}

	protected addInfo() {
		this.properties.add(PropertyCategories.info, new SectionHeaderProperty("Info"))
		// the tikz id of the component. e.g. "nmos" in "\node[nmos] at (0,0){};"
		this.properties.add(PropertyCategories.info, new InfoProperty("ID", this.referenceSymbol.tikzName))
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		let symbolID = this.componentVariant.symbol.id()
		if (!defs.has(symbolID)) {
			const symbol = this.componentVariant.symbol.clone(true, false)
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

	protected setPropertiesFromOptions(options: SymbolOption[]) {
		this.optionProperties.forEach((value, property) => {
			if (options.find((op) => op.name == value.name)) {
				property.value = true
			} else {
				property.value = false
			}
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
		})
		this.updateOptions()
	}

	protected updateOptions() {
		this.componentVariant = this.referenceSymbol.getVariant(this.optionsFromProperties())
		this.referencePosition = this.componentVariant.mid
		this.symbolUse.node.setAttribute("href", "#" + this.componentVariant.symbol.id())
		this.size = new SVG.Point(this.componentVariant.viewBox.w, this.componentVariant.viewBox.h)
		this.defaultTextPosition = this.componentVariant.textPosition.point.add(this.componentVariant.mid)

		this.snappingPoints = this.componentVariant.pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))
		)
		this.update()
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints: this.snappingPoints,
			additionalSnappingPoints: [new SnapPoint(this, "center", this.componentVariant.mid)],
		}
	}

	protected update() {
		let m = this.getTransformMatrix()
		this.symbolUse.transform(m)
		this._bbox = this.componentVariant.viewBox.transform(m)

		this.updatePositionedLabel()

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			// use the saved position instead of the bounding box (bbox position fails in safari)
			let bbox = this.componentVariant.viewBox
			let maxStroke = this.componentVariant.maxStroke

			this.selectionElement
				.size(bbox.w + maxStroke + selectedBoxWidth, bbox.h + maxStroke + selectedBoxWidth)
				.transform(
					this.getTransformMatrix().multiply(
						new SVG.Matrix({
							translate: [
								bbox.x - (selectedBoxWidth + maxStroke) / 2,
								bbox.y - (selectedBoxWidth + maxStroke) / 2,
							],
						})
					)
				)
		}
	}

	public toJson(): NodeSymbolSaveObject {
		let data = super.toJson() as NodeSymbolSaveObject
		data.type = NodeSymbolComponent.jsonID
		data.id = this.referenceSymbol.tikzName

		if (this.componentVariant.options.length > 0) {
			data.options = this.componentVariant.options.map((option) => option.displayName ?? option.name)
		}
		if (this.name.value) {
			data.name = this.name.value
		}

		return data
	}

	public toTikzString(): string {
		let command: TikzNodeCommand = {
			options: [this.referenceSymbol.tikzName],
			additionalNodes: [],
		}
		this.buildTikzCommand(command)
		return buildTikzStringFromNodeCommand(command)
	}

	protected buildTikzCommand(command: TikzNodeCommand): void {
		command.options.push(...this.referenceSymbol.optionsToStringArray(this.optionsFromProperties()))
		super.buildTikzCommand(command)
	}

	protected applyJson(saveObject: NodeSymbolSaveObject): void {
		super.applyJson(saveObject)
		let options = saveObject.options ?? []
		this.setPropertiesFromOptions(this.referenceSymbol.getOptionsFromOptionNames(options))
		this.scaleProperty.value = new SVG.Number(Math.abs(this.scaleState.x))
		this.update()
		this.updateTheme()
	}

	public static fromJson(saveObject: NodeSymbolSaveObject): NodeSymbolComponent {
		let symbol: ComponentSymbol

		if (SaveController.instance.currentlyLoadedSaveVersion != "") {
			symbol = MainController.instance.symbols.find((symbol) => symbol.tikzName == saveObject.id)
		} else {
			let idParts = saveObject.id.split("_")
			symbol = MainController.instance.symbols.find(
				(symbol) => symbol.tikzName == idParts[1].replaceAll("-", " ")
			)
			saveObject.options = idParts.slice(2)
		}
		if (symbol) {
			let nodeComponent: NodeSymbolComponent = new NodeSymbolComponent(symbol)
			return nodeComponent
		} else {
			console.error("no node symbol found for saveObject: " + JSON.stringify(saveObject))
			return null
		}
	}

	public copyForPlacement(): NodeSymbolComponent {
		let newComponent = new NodeSymbolComponent(this.referenceSymbol)
		newComponent.rotationDeg = this.rotationDeg
		newComponent.scaleState = new SVG.Point(this.scaleState)
		return newComponent
	}
}
