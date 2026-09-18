import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	defaultStroke,
	PropertyCategories,
	SectionHeaderProperty,
} from "../internal"

export type SymbolColorInfo = {
	color?: string | "default"
}

/**
 * Adds a draw (outline) color and an optional fill color to symbol-based components (path and node
 * symbols such as resistors, sources or ground symbols).
 *
 * Unlike {@link Fillable}/{@link Strokable}, this does not touch the rendered element directly, since the
 * component's visualization is a `<use>` referencing a symbol shared by every instance of that component
 * type. Instead, `updateSymbolColors` sets the `color` CSS property (which the shared symbol's paths use via
 * `currentColor` for their stroke, so it only affects this one `<use>` instance) and, if fill is enabled, the
 * `--component-fill-color` custom property (which fillable areas of the symbol reference the same way).
 */
export interface SymbolColorable {
	drawColorInfo: SymbolColorInfo
	fillColorInfo: SymbolColorInfo
	drawColorProperty: ColorProperty
	fillColorProperty: ColorProperty
}

export function SymbolColorable<TBase extends AbstractConstructor<CircuitComponent>>(Base: TBase) {
	abstract class SymbolColorable extends Base {
		protected drawColorInfo: SymbolColorInfo
		protected fillColorInfo: SymbolColorInfo

		protected drawColorProperty: ColorProperty
		protected fillColorProperty: ColorProperty
		private fillColorEnabled = false

		constructor(...args: any[]) {
			super(...args)
			this.drawColorInfo = { color: "default" }
			this.fillColorInfo = { color: "default" }

			this.properties.add(
				PropertyCategories.stroke,
				new SectionHeaderProperty("Stroke", undefined, "symbolcolor:stroke_header")
			)
			this.drawColorProperty = new ColorProperty("Color", null, undefined, undefined, "symbolcolor:draw")
			this.drawColorProperty.addChangeListener((ev) => {
				this.drawColorInfo.color = ev.value == null ? "default" : ev.value.toRgb()
				this.updateTheme()
			})
			this.properties.add(PropertyCategories.stroke, this.drawColorProperty)

			// created eagerly so applyJson can restore it even for older/other instances, but only added to the
			// properties panel via enableFillColor() for symbols whose shape actually supports being filled
			this.fillColorProperty = new ColorProperty("Color", null, undefined, undefined, "symbolcolor:fill")
			this.fillColorProperty.addChangeListener((ev) => {
				this.fillColorInfo.color = ev.value == null ? "default" : ev.value.toRgb()
				this.updateTheme()
			})
		}

		/**
		 * Call this from a concrete component's constructor once it knows its referenced symbol supports a
		 * fill (`ComponentSymbol.fillable`), to show the fill color property and include it in save/export.
		 */
		protected enableFillColor() {
			this.fillColorEnabled = true
			this.properties.add(
				PropertyCategories.fill,
				new SectionHeaderProperty("Fill", undefined, "symbolcolor:fill_header")
			)
			this.properties.add(PropertyCategories.fill, this.fillColorProperty)
		}

		/**
		 * Applies drawColorInfo/fillColorInfo to componentVisualization. Call this from updateTheme() and
		 * after construction, once componentVisualization exists.
		 */
		protected updateSymbolColors() {
			this.componentVisualization.node.style.color =
				this.drawColorInfo.color === "default" ? defaultStroke : this.drawColorInfo.color

			if (this.fillColorEnabled) {
				this.componentVisualization.node.style.setProperty(
					"--component-fill-color",
					this.fillColorInfo.color === "default" ? "none" : this.fillColorInfo.color
				)
			}
		}

		public toJson(): ComponentSaveObject {
			const data = super.toJson() as ComponentSaveObject & { drawColor?: string; fillColor?: string }
			if (this.drawColorInfo.color !== "default") {
				data.drawColor = this.drawColorInfo.color
			}
			if (this.fillColorEnabled && this.fillColorInfo.color !== "default") {
				data.fillColor = this.fillColorInfo.color
			}
			return data
		}

		protected applyJson(saveObject: ComponentSaveObject & { drawColor?: string; fillColor?: string }): void {
			super.applyJson(saveObject)
			if (saveObject.drawColor) {
				this.drawColorInfo.color = saveObject.drawColor
				this.drawColorProperty.value = new SVG.Color(saveObject.drawColor)
			}
			if (saveObject.fillColor) {
				this.fillColorInfo.color = saveObject.fillColor
				this.fillColorProperty.value = new SVG.Color(saveObject.fillColor)
			}
		}

		protected buildTikzCommand(command: { options: string[] }): void {
			super.buildTikzCommand(command)
			if (this.drawColorInfo.color !== "default") {
				command.options.push("draw=" + new SVG.Color(this.drawColorInfo.color).toTikzString())
			}
			if (this.fillColorEnabled && this.fillColorInfo.color !== "default") {
				command.options.push("fill=" + new SVG.Color(this.fillColorInfo.color).toTikzString())
			}
		}
	}
	return SymbolColorable
}
