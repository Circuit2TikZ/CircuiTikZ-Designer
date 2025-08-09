import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	dashArrayToPattern,
	PropertyCategories,
	SectionHeaderProperty,
	SliderProperty,
} from "../internal"

export type StrokeInfo = {
	width?: SVG.Number
	color?: string | "default"
	opacity?: number
	style?: string
}
export type StrokeStyle = ChoiceEntry & {
	dasharray: number[]
}

export const strokeStyleChoices: StrokeStyle[] = [
	{ key: "solid", name: "solid", dasharray: [1, 0] },
	{ key: "dotted", name: "dotted", dasharray: [1, 4] },
	{ key: "denselydotted", name: "densely dotted", dasharray: [1, 2] },
	{ key: "looselydotted", name: "loosely dotted", dasharray: [1, 8] },
	{ key: "dashed", name: "dashed", dasharray: [4, 4] },
	{ key: "denselydashed", name: "densely dashed", dasharray: [4, 2] },
	{ key: "looselydashed", name: "loosely dashed", dasharray: [4, 8] },
	{ key: "dashdot", name: "dash dot", dasharray: [4, 2, 1, 2] },
	{ key: "denselydashdot", name: "densely dash dot", dasharray: [4, 1, 1, 1] },
	{ key: "looselydashdot", name: "loosely dash dot", dasharray: [4, 4, 1, 4] },
	{ key: "dashdotdot", name: "dash dot dot", dasharray: [4, 2, 1, 2, 1, 2] },
	{ key: "denselydashdotdot", name: "densely dash dot dot", dasharray: [4, 1, 1, 1, 1, 1] },
	{ key: "looselydashdotdot", name: "loosely dash dot dot", dasharray: [4, 4, 1, 4, 1, 4] },
]
export const defaultStrokeStyleChoice = strokeStyleChoices[0]

export interface Strokable {
	strokeInfo: StrokeInfo
	strokeColorProperty: ColorProperty
	strokeOpacityProperty: SliderProperty
	strokeWidthProperty: SliderProperty
	strokeStyleProperty: ChoiceProperty<StrokeStyle>
}

export function Strokable<TBase extends AbstractConstructor<CircuitComponent>>(Base: TBase) {
	abstract class Strokable extends Base {
		protected strokeInfo: StrokeInfo

		protected strokeColorProperty: ColorProperty
		protected strokeOpacityProperty: SliderProperty
		protected strokeWidthProperty: SliderProperty
		protected strokeStyleProperty: ChoiceProperty<StrokeStyle>

		constructor(...args: any[]) {
			super(...args)
			this.strokeInfo = {
				color: "default",
				opacity: 1,
				width: new SVG.Number("1pt"),
				style: defaultStrokeStyleChoice.key,
			}

			//add color property

			this.properties.add(PropertyCategories.stroke, new SectionHeaderProperty("Stroke"))
			this.strokeOpacityProperty = new SliderProperty(
				"Opacity",
				0,
				100,
				1,
				new SVG.Number(this.strokeInfo.opacity * 100, "%")
			)
			this.strokeOpacityProperty.addChangeListener((ev) => {
				this.strokeInfo.opacity = ev.value.value / 100
				this.updateTheme()
				this.update()
			})

			this.strokeColorProperty = new ColorProperty("Color", null)
			this.strokeColorProperty.addChangeListener((ev) => {
				if (ev.value == null) {
					this.strokeInfo.color = "default"
					this.strokeInfo.opacity = 1
				} else {
					this.strokeInfo.color = ev.value.toRgb()
					this.strokeInfo.opacity = this.strokeOpacityProperty.value.value / 100
				}
				this.updateTheme()
				this.update()
			})
			this.strokeWidthProperty = new SliderProperty("Width", 0, 10, 0.1, this.strokeInfo.width)
			this.strokeWidthProperty.addChangeListener((ev) => {
				this.strokeInfo.width = ev.value
				this.updateTheme()
				this.update()
			})
			this.strokeStyleProperty = new ChoiceProperty<StrokeStyle>(
				"Style",
				strokeStyleChoices,
				defaultStrokeStyleChoice
			)
			this.strokeStyleProperty.addChangeListener((ev) => {
				this.strokeInfo.style = ev.value.key
				this.updateTheme()
				this.update()
			})
			this.properties.add(PropertyCategories.stroke, this.strokeColorProperty)
			this.properties.add(PropertyCategories.stroke, this.strokeOpacityProperty)
			this.properties.add(PropertyCategories.stroke, this.strokeWidthProperty)
			this.properties.add(PropertyCategories.stroke, this.strokeStyleProperty)
		}

		public toJson(): ComponentSaveObject {
			const data = super.toJson() as ComponentSaveObject & { stroke?: StrokeInfo }

			let stroke: StrokeInfo = {}
			let shouldStroke = false
			if (this.strokeInfo.color != "default") {
				stroke.color = this.strokeInfo.color
				shouldStroke = true
			}
			if (this.strokeInfo.opacity != 1) {
				stroke.opacity = this.strokeInfo.opacity
				shouldStroke = true
			}

			if (!this.strokeInfo.width.eq(new SVG.Number("1pt"))) {
				stroke.width = this.strokeInfo.width
				shouldStroke = true
			}
			if (this.strokeInfo.style != defaultStrokeStyleChoice.key) {
				stroke.style = this.strokeInfo.style
				shouldStroke = true
			}
			if (shouldStroke) {
				data.stroke = stroke
			}

			return data
		}

		protected applyJson(saveObject: ComponentSaveObject & { stroke?: StrokeInfo }): void {
			super.applyJson(saveObject)

			if (saveObject.stroke) {
				if (saveObject.stroke.color) {
					this.strokeInfo.color = saveObject.stroke.color
					this.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
				}
				if (saveObject.stroke.opacity != undefined) {
					this.strokeInfo.opacity = saveObject.stroke.opacity
					this.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
				}
				if (saveObject.stroke.width) {
					if (typeof saveObject.stroke.width != "string") {
						// SVG.Number as object
						this.strokeInfo.width = new SVG.Number(
							saveObject.stroke.width.value,
							saveObject.stroke.width.unit
						)
					} else {
						// SVG.Number as string
						this.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
					}
					this.strokeWidthProperty.value = this.strokeInfo.width
				}
				if (saveObject.stroke.style) {
					this.strokeInfo.style = saveObject.stroke.style
					this.strokeStyleProperty.value = strokeStyleChoices.find(
						(item) => item.key == saveObject.stroke.style
					)
				}
			}
		}

		protected buildTikzCommand(command: { options: string[] }): void {
			super.buildTikzCommand(command)
			let width = this.strokeInfo.width.convertToUnit("pt").value
			if (this.strokeInfo.opacity > 0 && width > 0) {
				if (this.strokeInfo.color !== "default") {
					let c = new SVG.Color(this.strokeInfo.color)
					command.options.push("draw=" + c.toTikzString())
				} else {
					command.options.push("draw")
				}

				if (this.strokeInfo.opacity != 1) {
					command.options.push("draw opacity=" + this.strokeInfo.opacity.toString())
				}

				if (width != 0.4) {
					command.options.push("line width=" + width + "pt")
				}
				if (this.strokeInfo.style && this.strokeInfo.style != defaultStrokeStyleChoice.key) {
					command.options.push(
						dashArrayToPattern(
							this.strokeInfo.width,
							strokeStyleChoices.find((item) => item.key == this.strokeInfo.style).dasharray
						)
					)
				}
			}
		}
	}
	return Strokable
}
