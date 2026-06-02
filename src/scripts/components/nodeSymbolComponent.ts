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

// TODO don't use <use> element as the component visualisation, but directly the symbol's children

export type NodeSymbolSaveObject = NodeSaveObject & {
	id: string
	options?: string[]
	numberInputs?: string
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

	protected optionProperties: Map<BooleanProperty, SymbolOption>
	protected optionEnumProperties: Map<ChoiceProperty<ChoiceEntry>, EnumOption>
	protected componentVariant: Variant

	protected scaleProperty: SliderProperty
	protected numberInputsProperty: ChoiceProperty<ChoiceEntry> | null = null
	protected inputLineGroup: SVG.G | null = null
	protected inputLineLength: number = 0

	constructor(symbol: ComponentSymbol) {
		super()
		this.displayName = symbol.displayName
		this.referenceSymbol = symbol

		this.optionProperties = new Map()
		this.optionEnumProperties = new Map()

		this.scaleState = new SVG.Point(1, 1)
		this.scaleProperty = new SliderProperty(
			"Scale",
			0.1,
			10,
			0.01,
			new SVG.Number(1),
			true,
			undefined,
			"manipulation:scale"
		)
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
			this.properties.add(
				PropertyCategories.options,
				new SectionHeaderProperty("Options", undefined, "options:header")
			)
			for (const option of symbol.possibleOptions) {
				const property = new BooleanProperty(
					option.displayName ?? option.name,
					false,
					false,
					undefined,
					"options:option" + option.name
				)
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
				const property = new ChoiceProperty(
					enumOption.displayName,
					choices,
					choices[0],
					undefined,
					"options:enum_" + enumOption.displayName
				)

				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionEnumProperties.set(property, enumOption)
				this.properties.add(PropertyCategories.options, property)
			}
		}

		// Add number of inputs property for multi-input logic gates
		const baseVariant = symbol.getVariant([])
		const inputPins = baseVariant.pins.filter((pin) => /^in \d+$/.test(pin.name))
		if (inputPins.length >= 2) {
			const existingOptions = symbol.possibleOptions.length > 0 || symbol.possibleEnumOptions.length > 0
			if (!existingOptions) {
				this.properties.add(
					PropertyCategories.options,
					new SectionHeaderProperty("Options", undefined, "options:header")
				)
			}
			const choices: ChoiceEntry[] = [
				{ key: "2", name: "2" },
				{ key: "3", name: "3" },
				{ key: "4", name: "4" },
				{ key: "5", name: "5" },
				{ key: "7", name: "7" },
			]
			this.numberInputsProperty = new ChoiceProperty(
				"Number of inputs",
				choices,
				choices[0],
				undefined,
				"options:number_inputs"
			)
			this.numberInputsProperty.addChangeListener(() => {
				this.regenerateInputSnappingPoints()
				this.update()
			})
			this.properties.add(PropertyCategories.options, this.numberInputsProperty)
		}

		this.componentVariant = symbol.getVariant(this.optionsFromProperties())
		this.size = new SVG.Point(this.componentVariant.viewBox.w, this.componentVariant.viewBox.h)
		this.defaultTextPosition = this.componentVariant.textPosition.point.add(this.componentVariant.mid)

		this.componentVisualization = CanvasController.instance.canvas.use(this.componentVariant.symbol)
		this.componentVisualization.fill("none")
		this.componentVisualization.stroke(defaultStroke)
		this.componentVisualization.node.style.color = defaultStroke
		this.referencePosition = this.componentVariant.mid
		this.visualization.add(this.componentVisualization)
		this.dragElement = this.componentVisualization

		// Create an overlay group for dynamic input lines (multi-input logic gates)
		if (this.numberInputsProperty) {
			this.inputLineGroup = CanvasController.instance.canvas.group()
			this.inputLineGroup.addClass("input-lines-overlay")
			this.visualization.add(this.inputLineGroup)

			// Extract input line length from the SVG symbol's path data
			this.inputLineLength = this.extractInputLineLength()
		}

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
		this.componentVisualization.node.setAttribute("href", "#" + this.componentVariant.symbol.id())
		this.size = new SVG.Point(this.componentVariant.viewBox.w, this.componentVariant.viewBox.h)
		this.defaultTextPosition = this.componentVariant.textPosition.point.add(this.componentVariant.mid)

		this.regenerateInputSnappingPoints()
		this.update()
	}

	/**
	 * Regenerate input snapping points based on the selected number of inputs.
	 * Only applies to multi-input logic gates that have a numberInputsProperty.
	 */
	protected regenerateInputSnappingPoints() {
		const basePins = this.componentVariant.pins
		const baseInputPins = basePins.filter((pin) => /^in \d+$/.test(pin.name))
		if (baseInputPins.length < 2 || !this.numberInputsProperty) {
			// Use the default pins from the variant
			this.snappingPoints = basePins.map(
				(pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))
			)
			return
		}

		const numInputs = parseInt(this.numberInputsProperty.value.key)

		const outputPins = basePins.filter((pin) => !/^in \d+$/.test(pin.name))

		// Use the existing input pin x-offset and y-spread to interpolate
		const sortedInputs = baseInputPins.sort((a, b) => a.point.y - b.point.y)
		const xOffset = sortedInputs[0].point.x
		const minY = sortedInputs[0].point.y
		const maxY = sortedInputs[sortedInputs.length - 1].point.y

		// Generate N evenly-spaced input pins
		const newInputPins: SnapPoint[] = []
		for (let i = 1; i <= numInputs; i++) {
			const t = numInputs > 1 ? (i - 1) / (numInputs - 1) : 0.5
			const y = minY + t * (maxY - minY)
			const worldPos = new SVG.Point(xOffset, y).add(this.componentVariant.mid)
			newInputPins.push(new SnapPoint(this, `in ${i}`, worldPos))
		}

		this.snappingPoints = [
			...newInputPins,
			...outputPins.map((pin) => {
				return new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))
			}),
		]
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints: this.snappingPoints,
			additionalSnappingPoints: [new SnapPoint(this, "center", this.componentVariant.mid)],
		}
	}

	public update() {
		let m = this.getTransformMatrix()
		this.componentVisualization.transform(m)
		if (this.inputLineGroup) {
			this.inputLineGroup.transform(m)
			this.redrawInputLines()
		}
		this._bbox = this.componentVariant.viewBox.transform(m)

		this.updatePositionedLabel()

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	/**
	 * Redraw the dynamic input lines overlay for multi-input logic gates.
	 * Draws additional input lines between the existing top and bottom input lines
	 * in the base SVG symbol to reflect the selected number of inputs.
	 */
	private redrawInputLines() {
		this.inputLineGroup.clear()
		if (!this.numberInputsProperty) return

		const basePins = this.componentVariant.pins
		const baseInputPins = basePins.filter((pin) => /^in \d+$/.test(pin.name))
		if (baseInputPins.length < 2) return

		const numInputs = parseInt(this.numberInputsProperty.value.key)
		if (numInputs <= 2) return // 2-input uses the base symbol's lines directly

		const sortedInputs = baseInputPins.sort((a, b) => a.point.y - b.point.y)
		const xOffset = sortedInputs[0].point.x + this.componentVariant.mid.x
		const minY = sortedInputs[0].point.y + this.componentVariant.mid.y
		const maxY = sortedInputs[sortedInputs.length - 1].point.y + this.componentVariant.mid.y

		// Draw only the intermediate lines (between top and bottom existing lines)
		const lineLen = this.inputLineLength
		for (let i = 1; i < numInputs - 1; i++) {
			const t = i / (numInputs - 1)
			const y = minY + t * (maxY - minY)
			this.inputLineGroup
				.line(xOffset, y, xOffset + lineLen, y)
				.stroke({ color: defaultStroke, width: 0.53134 })
		}
	}

	/**
	 * Extract the input line length from the SVG symbol's path data.
	 * This accounts for different gate styles having different input line geometries.
	 */
	private extractInputLineLength(): number {
		const symbolElement = this.componentVariant.symbol.node
		const pathElements = symbolElement.querySelectorAll("path")
		for (const path of pathElements) {
			const d = path.getAttribute("d")
			if (!d) continue
			// Prefer paths with the input-line stroke width (0.53134) over body paths
			const sw = parseFloat(path.getAttribute("stroke-width") ?? "0")
			const match = d.match(/h(-?\d+\.?\d*)/i)
			if (match) {
				const len = Math.abs(parseFloat(match[1]))
				if (sw > 0.5 && sw < 0.6) {
					return len // Input line path found
				}
			}
		}
		// Fallback: find any horizontal line in the SVG
		for (const path of pathElements) {
			const d = path.getAttribute("d")
			if (!d) continue
			const match = d.match(/h(-?\d+\.?\d*)/i)
			if (match) {
				return Math.abs(parseFloat(match[1]))
			}
		}
		// Last resort: estimate from viewBox width
		return this.componentVariant.viewBox.w * 0.15
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
		if (this.numberInputsProperty && this.numberInputsProperty.value.key !== "2") {
			data.numberInputs = this.numberInputsProperty.value.key
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

		// Add number inputs for multi-input logic gates
		if (this.numberInputsProperty && this.numberInputsProperty.value.key !== "2") {
			command.options.push(`number inputs=${this.numberInputsProperty.value.key}`)
		}

		super.buildTikzCommand(command)
	}

	protected applyJson(saveObject: NodeSymbolSaveObject): void {
		super.applyJson(saveObject)
		let options = saveObject.options ?? []
		this.setPropertiesFromOptions(this.referenceSymbol.getOptionsFromOptionNames(options))
		this.scaleProperty.value = new SVG.Number(Math.abs(this.scaleState.x))

		// Restore number of inputs for multi-input logic gates
		if (this.numberInputsProperty && saveObject.numberInputs) {
			const choice = this.numberInputsProperty.entries.find((e) => e.key === saveObject.numberInputs)
			if (choice) {
				this.numberInputsProperty.updateValue(choice, false, true)
			}
		}

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
		if (this.numberInputsProperty && newComponent.numberInputsProperty) {
			// Use updateValue without triggering listeners to avoid mode-switch side effects during placement
			newComponent.numberInputsProperty.updateValue(this.numberInputsProperty.value, false, false)
			newComponent.regenerateInputSnappingPoints()
		}
		return newComponent
	}
}
