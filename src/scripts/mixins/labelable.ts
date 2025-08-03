import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	basicDirections,
	BooleanProperty,
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	defaultBasicDirection,
	DirectionInfo,
	MathJaxProperty,
	PathComponent,
	PropertyCategories,
	renderMathJax,
	SectionHeaderProperty,
	SliderProperty,
} from "../internal"

/**
 * A type encompassing all information needed for the label
 */
export type Label = {
	value: string
	rendering?: SVG.Element
	distance?: SVG.Number
	color?: string | "default"
}

export type PositionedLabel = Label & {
	anchor?: string
	position?: string
	relativeToComponent?: boolean
}

export type PathLabel = Label & {
	otherSide?: boolean
}

export function PositionLabelable<TBase extends AbstractConstructor<CircuitComponent>>(Base: TBase) {
	abstract class PositionLabelable extends Base {
		public anchorChoice: ChoiceProperty<DirectionInfo>
		public positionChoice: ChoiceProperty<DirectionInfo>

		protected mathJaxLabel: MathJaxProperty
		protected labelReferenceChoices: ChoiceEntry[] = [
			{ key: "canvas", name: "Canvas" },
			{ key: "component", name: "Component" },
		]
		protected labelReferenceProperty: ChoiceProperty<ChoiceEntry>
		protected labelRendering: SVG.Element
		protected labelDistance: SliderProperty
		protected labelColor: ColorProperty

		constructor(...args: any[]) {
			super(...args)
			//label section
			this.properties.add(PropertyCategories.label, new SectionHeaderProperty("Label"))

			this.mathJaxLabel = new MathJaxProperty()
			this.mathJaxLabel.addChangeListener((ev) => this.generateLabelRender())
			this.properties.add(PropertyCategories.label, this.mathJaxLabel)

			this.labelReferenceProperty = new ChoiceProperty(
				"Relative to",
				this.labelReferenceChoices,
				this.labelReferenceChoices[0]
			)
			this.labelReferenceProperty.addChangeListener((ev) => {
				this.updatePositionedLabel()
			})
			this.properties.add(PropertyCategories.label, this.labelReferenceProperty)

			this.anchorChoice = new ChoiceProperty("Anchor", basicDirections, defaultBasicDirection)
			this.anchorChoice.addChangeListener((ev) => this.updatePositionedLabel())
			this.properties.add(PropertyCategories.label, this.anchorChoice)

			this.positionChoice = new ChoiceProperty("Position", basicDirections, defaultBasicDirection)
			this.positionChoice.addChangeListener((ev) => this.updatePositionedLabel())
			this.properties.add(PropertyCategories.label, this.positionChoice)

			this.labelDistance = new SliderProperty("Gap", -0.5, 1, 0.01, new SVG.Number(0.12, "cm"))
			this.labelDistance.addChangeListener((ev) => this.updatePositionedLabel())
			this.properties.add(PropertyCategories.label, this.labelDistance)

			this.labelColor = new ColorProperty("Color", null)
			this.labelColor.addChangeListener((ev) => {
				this.updateTheme()
			})
			this.properties.add(PropertyCategories.label, this.labelColor)
		}

		public toJson(): ComponentSaveObject {
			const data = super.toJson() as ComponentSaveObject & { label?: PositionedLabel }

			if (this.mathJaxLabel.value) {
				let labelWithoutRender: PositionedLabel = {
					value: this.mathJaxLabel.value,
					anchor: this.anchorChoice.value.key,
					position: this.positionChoice.value.key,
					relativeToComponent: this.labelReferenceProperty.value.key == "component",
					distance: this.labelDistance.value.value != 0 ? this.labelDistance.value : undefined,
					color: this.labelColor.value ? this.labelColor.value.toString() : undefined,
				}
				data.label = labelWithoutRender
			}

			return data
		}

		protected applyJson(saveObject: ComponentSaveObject & { label?: PositionedLabel }): void {
			super.applyJson(saveObject)

			if (saveObject.label) {
				this.labelDistance.value =
					saveObject.label.distance ?
						new SVG.Number(saveObject.label.distance.value, saveObject.label.distance.unit)
					:	new SVG.Number(0, "cm")
				if (this.labelDistance.value.unit == "") {
					this.labelDistance.value.unit = "cm"
				}
				this.anchorChoice.value =
					saveObject.label.anchor ?
						basicDirections.find((item) => item.key == saveObject.label.anchor)
					:	defaultBasicDirection
				this.positionChoice.value =
					saveObject.label.position ?
						basicDirections.find((item) => item.key == saveObject.label.position)
					:	defaultBasicDirection
				this.labelReferenceProperty.value =
					saveObject.label.relativeToComponent ? this.labelReferenceChoices[1] : this.labelReferenceChoices[0]
				this.mathJaxLabel.value = saveObject.label.value
				this.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
				this.generateLabelRender()
			}
		}

		/**
		 * Generate a label visualization via mathjax
		 */
		protected generateLabelRender() {
			// if a previous label was rendered, remove everything concerning that rendering
			this.labelRendering = generateLabelRender(this.labelRendering, this.mathJaxLabel)
			// add the label rendering to the visualization element
			this.visualization.add(this.labelRendering)
			this.update()
			this.updateTheme()
		}

		protected anchorPos: DirectionInfo
		protected labelPos: DirectionInfo
		protected abstract updatePositionedLabel(): void
	}
	return PositionLabelable
}

export function PathLabelable<TBase extends AbstractConstructor<CircuitComponent>>(Base: TBase) {
	abstract class PathLabelable extends Base {
		protected mathJaxLabel: MathJaxProperty
		protected labelRendering: SVG.Element
		protected labelDistance: SliderProperty
		protected labelColor: ColorProperty
		protected labelSide: BooleanProperty

		constructor(...args: any[]) {
			super(...args)

			//label section
			this.properties.add(PropertyCategories.label, new SectionHeaderProperty("Label"))

			this.mathJaxLabel = new MathJaxProperty()
			this.mathJaxLabel.addChangeListener((ev) => this.generateLabelRender())
			this.properties.add(PropertyCategories.label, this.mathJaxLabel)

			this.labelDistance = new SliderProperty("Gap", -0.5, 1, 0.01, new SVG.Number(0.12, "cm"))
			this.labelDistance.addChangeListener((ev) => this.updatePathLabel())
			this.properties.add(PropertyCategories.label, this.labelDistance)

			this.labelColor = new ColorProperty("Color", null)
			this.labelColor.addChangeListener((ev) => {
				this.updateTheme()
			})
			this.properties.add(PropertyCategories.label, this.labelColor)

			this.labelSide = new BooleanProperty("Switch side")
			this.labelSide.addChangeListener((ev) => this.updatePathLabel())
			this.properties.add(PropertyCategories.label, this.labelSide)
		}

		public toJson(): ComponentSaveObject {
			const data = super.toJson() as ComponentSaveObject & { label?: PathLabel }

			if (this.mathJaxLabel.value) {
				let label: PathLabel = {
					value: this.mathJaxLabel.value,
					otherSide: this.labelSide.value ? true : undefined,
					distance: this.labelDistance.value.value != 0 ? this.labelDistance.value : undefined,
					color: this.labelColor.value ? this.labelColor.value.toString() : undefined,
				}
				data.label = label
			}

			return data
		}

		protected applyJson(saveObject: ComponentSaveObject & { label?: PathLabel }): void {
			super.applyJson(saveObject)

			if (saveObject.label) {
				this.labelSide.value = saveObject.label.otherSide ?? false
				this.labelDistance.value =
					saveObject.label.distance ?
						new SVG.Number(saveObject.label.distance.value, saveObject.label.distance.unit)
					:	new SVG.Number(0, "cm")
				if (this.labelDistance.value.unit == "") {
					this.labelDistance.value.unit = "cm"
				}
				this.mathJaxLabel.value = saveObject.label.value
				this.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
				this.generateLabelRender()
			}
		}

		/**
		 * Generate a label visualization via mathjax
		 */
		protected generateLabelRender(): void {
			this.labelRendering = generateLabelRender(this.labelRendering, this.mathJaxLabel)
			// add the label rendering to the visualization element
			this.visualization.add(this.labelRendering)
			this.update()
			this.updateTheme()
		}

		protected abstract updatePathLabel(): void
	}
	return PathLabelable
}

function generateLabelRender(labelRendering: SVG.Element, mathJaxLabel: MathJaxProperty): SVG.Element {
	// if a previous label was rendered, remove everything concerning that rendering
	if (labelRendering) {
		let removeIDs = new Set<string>()
		for (const element of labelRendering.find("use")) {
			removeIDs.add(element.node.getAttribute("xlink:href"))
		}

		for (const id of removeIDs) {
			CanvasController.instance.canvas.find(id)[0]?.remove()
		}
		labelRendering.remove()
	}
	const transformGroup = renderMathJax(mathJaxLabel.value)
	// remove the current label and substitute with a new group element
	labelRendering = new SVG.G()
	labelRendering.addClass("pointerNone")
	labelRendering.add(transformGroup.element)
	return labelRendering
}
