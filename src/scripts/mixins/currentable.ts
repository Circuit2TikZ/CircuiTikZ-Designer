import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	CanvasController,
	defaultStroke,
	generateLabelRender,
	MathJaxProperty,
	PathComponent,
	PathSaveObject,
	PropertyCategories,
	SectionHeaderProperty,
	SliderProperty,
	CircuitikzTo,
	approxCompare,
	interpolate,
	BooleanProperty,
} from "../internal"

export type CurrentLabel = {
	label: string
	dist?: number
	start?: boolean
	below?: boolean
	backwards?: boolean
}

export type CurrentOptions = {
	isVoltageSource?: boolean
}

let currentDirectionBackward = false
let currentPositionStart = false
let currentLabelBelow = false

const arrowStrokeWidth = 0.5
const currentArrowScale = 16
const defaultRlen = 1.4
const cmtopx = 4800 / 127 // 96px/2.54

export interface Currentable {
	currentLabel: MathJaxProperty
	currentLabelRendering: SVG.Element
	currentArrowRendering: SVG.Element
	currentRendering: SVG.Element

	currentDistance: SliderProperty
	currentPosition: BooleanProperty
	currentDirection: BooleanProperty
	currentLabelPosition: BooleanProperty
}

export function Currentable<TBase extends AbstractConstructor<PathComponent>>(Base: TBase) {
	abstract class Currentable extends Base {
		protected currentLabel: MathJaxProperty
		protected currentLabelRendering: SVG.Element
		protected currentArrowRendering: SVG.Element
		protected currentRendering: SVG.Element

		protected currentDistance: SliderProperty
		protected currentPosition: BooleanProperty
		protected currentDirection: BooleanProperty
		protected currentLabelPosition: BooleanProperty

		constructor(...args: any[]) {
			super(...args)
			this.properties.add(
				PropertyCategories.current,
				new SectionHeaderProperty("Current label", undefined, "current:header")
			)

			this.currentLabel = new MathJaxProperty(undefined, undefined, "current:label")
			this.currentLabel.addChangeListener((ev) => this.generateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentLabel)

			this.currentDirection = new BooleanProperty("Backwards", null, true, undefined, "current:backwards")
			this.currentDirection.addChangeListener((ev) => {
				this.updateCurrentRender()
			})
			this.properties.add(PropertyCategories.current, this.currentDirection)

			this.currentLabelPosition = new BooleanProperty("Label below", null, true, undefined, "current:below")
			this.currentLabelPosition.addChangeListener((ev) => {
				this.updateCurrentRender()
			})
			this.properties.add(PropertyCategories.current, this.currentLabelPosition)

			this.currentPosition = new BooleanProperty("At start", null, true, undefined, "current:start")
			this.currentPosition.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentPosition)

			this.currentDistance = new SliderProperty(
				"Distance",
				0,
				1,
				0.1,
				new SVG.Number(0.5, ""),
				true,
				"How far along the line the current arrow is.",
				"current:distance"
			)
			this.currentDistance.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentDistance)
		}

		protected generateCurrentRender(): void {
			this.currentLabelRendering = generateLabelRender(this.currentLabelRendering, this.currentLabel)
			this.currentLabelRendering.fill(defaultStroke)

			this.currentRendering = new SVG.G()
			this.currentRendering.add(this.currentLabelRendering)
			this.visualization.add(this.currentRendering)
			this.update()
			this.updateTheme()
		}

		protected abstract updateCurrentRender(): void

		protected generateCurrentArrow(
			start: SVG.Point,
			end: SVG.Point,
			northwestDelta: SVG.Point,
			southeastDelta: SVG.Point,
			scale: SVG.Point,
			options?: CurrentOptions
		): { arrow: SVG.Element; labelPos: SVG.Point; labelAnchorDir: SVG.Point } {
			if (!options) {
				options = {}
			}

			const group = new SVG.G()

			const scaleFactor = Math.abs(scale.x)

			let distance = this.currentDistance.value.value

			let directionBackwards = this.currentDirection.value
			let positionStart = this.currentPosition.value
			let labelPositionBelow = this.currentLabelPosition.value

			let labelBelow = labelPositionBelow ? -1 : 1

			let diff = end.sub(start)
			let angle = Math.atan2(diff.y, diff.x)
			let endTrans = end.rotate(angle, start, true)

			// in which direction the the anchor of the current label should point
			const sin4 = 0.06976 // the sin of 4 degrees
			let labelAnchor = new SVG.Point(
				approxCompare(Math.sin(angle), 0, sin4),
				-approxCompare(Math.cos(angle), 0, sin4)
			).mul(-labelBelow)

			const midTrans = start.add(endTrans).div(2)
			const compStart = midTrans.add(new SVG.Point(northwestDelta.x * scaleFactor, 0))
			const compEnd = midTrans.add(new SVG.Point(southeastDelta.x * scaleFactor, 0))

			const arrowScale = (cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth

			const arrowPositionTrans =
				positionStart ? interpolate(start, compStart, distance) : interpolate(compEnd, endTrans, distance)
			const arrowPos = arrowPositionTrans.rotate(-angle, start, true)

			const labelOffset = new SVG.Point(0, -labelBelow * 0.12 * cmtopx)
			let labPos: SVG.Point = arrowPos.add(labelOffset.rotate(-angle, undefined, true))

			const arrowTip = CanvasController.instance.canvas.use("currarrow").fill(defaultStroke)
			const arrowAngle = angle + (directionBackwards ? Math.PI : 0)
			const arrowTipTransform = new SVG.Matrix({
				translate: [-0.85, -0.8],
			}).lmultiply({
				scale: arrowScale,
				rotate: (180 * arrowAngle) / Math.PI,
				translate: arrowPos,
			})
			arrowTip.transform(arrowTipTransform)
			group.add(arrowTip)

			return {
				arrow: group,
				labelPos: labPos,
				labelAnchorDir: labelAnchor,
			}
		}

		public toJson(): PathSaveObject {
			const data = super.toJson() as PathSaveObject & { current?: CurrentLabel }

			if (this.currentLabel.value != "") {
				const currentLabel: CurrentLabel = { label: this.currentLabel.value }
				currentLabel.dist =
					this.currentDistance.value.value != 0.5 ? this.currentDistance.value.value : undefined
				currentLabel.backwards = this.currentDirection.value ? true : undefined
				currentLabel.start = this.currentPosition.value ? true : undefined
				currentLabel.below = this.currentLabelPosition.value ? true : undefined
				data.current = currentLabel
			}

			return data
		}

		protected applyJson(saveObject: PathSaveObject & { current?: CurrentLabel }): void {
			super.applyJson(saveObject)

			if (saveObject.current) {
				this.currentLabel.value = saveObject.current.label
				if (saveObject.current.dist) {
					this.currentDistance.value = new SVG.Number(saveObject.current.dist, "")
				}
				if (saveObject.current.backwards) {
					this.currentDirection.value = true
				}
				if (saveObject.current.start) {
					this.currentPosition.value = true
				}
				if (saveObject.current.below) {
					this.currentLabelPosition.value = true
				}
				this.generateCurrentRender()
			}
		}

		protected buildTikzCurrent(to: CircuitikzTo): void {
			if (this.currentLabel.value != "") {
				const options = to.options

				let currentString = "i"
				let labelPosString = this.currentLabelPosition.value ? "_" : "^"
				let dirString = this.currentDirection.value ? "<" : ">"

				if (this.currentPosition.value) {
					// if position is start, the label position comes after the direction and both are required, exept:
					if (this.currentLabelPosition.value == false && this.currentDirection.value == true) {
						// if direction is backward and the label position is default above, the label position is not required
						labelPosString = ""
					}
					currentString += dirString + labelPosString
				} else {
					// if position is end, the label position comes before the direction
					if (this.currentDirection.value == false) {
						// if direction is forward the label position is not required
						dirString = ""
						if (this.currentLabelPosition.value == false) {
							// if the label position is default above and the direction is forward, the label position is also not required
							labelPosString = ""
						}
					}
					currentString += labelPosString + dirString
				}

				currentString += "=$" + this.currentLabel.value + "$"
				options.push(currentString)

				if (this.currentDistance.value.value != 0.5) {
					options.push("current/distance=" + this.currentDistance.value.value.toString())
				}
			}
		}
	}
	return Currentable
}
