import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	PropertyCategories,
	SectionHeaderProperty,
	SliderProperty,
} from "../internal"

export type FillInfo = {
	color?: string | "default"
	opacity?: number
}

export interface Fillable {
	fillInfo: FillInfo

	fillColorProperty: ColorProperty
	fillOpacityProperty: SliderProperty
}

export function Fillable<TBase extends AbstractConstructor<CircuitComponent>>(Base: TBase) {
	abstract class Fillable extends Base {
		protected fillInfo: FillInfo

		protected fillColorProperty: ColorProperty
		protected fillOpacityProperty: SliderProperty

		constructor(...args: any[]) {
			super(...args)
			this.fillInfo = {
				color: "default",
				opacity: 1,
			}
			this.properties.add(PropertyCategories.fill, new SectionHeaderProperty("Fill"))

			this.fillOpacityProperty = new SliderProperty(
				"Opacity",
				0,
				100,
				1,
				new SVG.Number(this.fillInfo.opacity * 100, "%")
			)
			this.fillOpacityProperty.addChangeListener((ev) => {
				this.fillInfo.opacity = ev.value.value / 100
				this.updateTheme()
				this.update()
			})

			this.fillColorProperty = new ColorProperty("Color", null)
			this.fillColorProperty.addChangeListener((ev) => {
				if (ev.value == null) {
					this.fillInfo.color = "default"
					this.fillInfo.opacity = 1
				} else {
					this.fillInfo.color = ev.value.toRgb()
					this.fillInfo.opacity = this.fillOpacityProperty.value.value / 100
				}
				this.updateTheme()
				this.update()
			})

			this.properties.add(PropertyCategories.fill, this.fillColorProperty)
			this.properties.add(PropertyCategories.fill, this.fillOpacityProperty)
		}

		public toJson(): ComponentSaveObject {
			const data = super.toJson() as ComponentSaveObject & { fill?: FillInfo }

			let fill: FillInfo = {}
			let shouldFill = false
			if (this.fillInfo.color != "default") {
				fill.color = this.fillInfo.color
				shouldFill = true
			}
			if (this.fillInfo.opacity != 1) {
				fill.opacity = this.fillInfo.opacity
				shouldFill = true
			}
			if (shouldFill) {
				data.fill = fill
			}

			return data
		}

		protected applyJson(saveObject: ComponentSaveObject & { fill?: FillInfo }): void {
			super.applyJson(saveObject)

			if (saveObject.fill) {
				if (saveObject.fill.color) {
					this.fillInfo.color = saveObject.fill.color
					this.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
				}
				if (saveObject.fill.opacity != undefined) {
					this.fillInfo.opacity = saveObject.fill.opacity
					this.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
				}
			}
		}

		protected buildTikzCommand(command: { options: string[] }): void {
			super.buildTikzCommand(command)
			if (this.fillInfo.opacity > 0) {
				if (this.fillInfo.color !== "default") {
					let c = new SVG.Color(this.fillInfo.color)
					command.options.push("fill=" + c.toTikzString())
				}

				if (this.fillInfo.opacity != 1) {
					command.options.push("fill opacity=" + this.fillInfo.opacity.toString())
				}
			}
		}
	}
	return Fillable
}
