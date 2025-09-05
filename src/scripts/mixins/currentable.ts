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
	ChoiceProperty,
	ChoiceEntry,
	approxCompare,
	interpolate,
} from "../internal"

export type CurrentLabel = {
	label: string
	dist?: number
	pos?: string
	labPos?: string
	dir?: string
}

const currentDirectionChoices: ChoiceEntry[] = [
	{ key: "", name: "default" },
	{ key: ">", name: "forward" },
	{ key: "<", name: "backward" },
]
const defaultCurrentDirectionChoice = currentDirectionChoices[0]
let currentDirectionBackward = false

const currentPositionChoices: ChoiceEntry[] = [
	{ key: "", name: "default" },
	{ key: "start", name: "start" },
	{ key: "end", name: "end" },
]
const defaultCurrentPositionChoice = currentPositionChoices[0]

const currentLabelPositionChoices: ChoiceEntry[] = [
	{ key: "", name: "default" },
	{ key: "_", name: "below" },
	{ key: "^", name: "above" },
]
const defaultCurrentLabelPositionChoice = currentLabelPositionChoices[0]
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
	currentPosition: ChoiceProperty<ChoiceEntry>
	currentDirection: ChoiceProperty<ChoiceEntry>
	currentLabelPosition: ChoiceProperty<ChoiceEntry>
}

export function Currentable<TBase extends AbstractConstructor<PathComponent>>(Base: TBase) {
	abstract class Currentable extends Base {
		protected currentLabel: MathJaxProperty
		protected currentLabelRendering: SVG.Element
		protected currentArrowRendering: SVG.Element
		protected currentRendering: SVG.Element

		protected currentDistance: SliderProperty
		protected currentPosition: ChoiceProperty<ChoiceEntry>
		protected currentDirection: ChoiceProperty<ChoiceEntry>
		protected currentLabelPosition: ChoiceProperty<ChoiceEntry>

		constructor(...args: any[]) {
			super(...args)
			this.properties.add(PropertyCategories.current, new SectionHeaderProperty("Current label"))

			this.currentLabel = new MathJaxProperty()
			this.currentLabel.addChangeListener((ev) => this.generateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentLabel)

			this.currentDirection = new ChoiceProperty(
				"Direction",
				currentDirectionChoices,
				defaultCurrentDirectionChoice
			)
			this.currentDirection.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentDirection)

			this.currentLabelPosition = new ChoiceProperty(
				"Label",
				currentLabelPositionChoices,
				defaultCurrentLabelPositionChoice
			)
			this.currentLabelPosition.addChangeListener((ev) => {
				console.log("test")

				this.updateCurrentRender()
			})
			this.properties.add(PropertyCategories.current, this.currentLabelPosition)

			this.currentPosition = new ChoiceProperty("Position", currentPositionChoices, defaultCurrentPositionChoice)
			this.currentPosition.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentPosition)

			this.currentDistance = new SliderProperty(
				"Distance",
				0,
				1,
				0.1,
				new SVG.Number(0.5, ""),
				true,
				"How far along the line the current arrow is."
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
			scale: SVG.Point
		): { arrow: SVG.Element; labelPos: SVG.Point; labelAnchorDir: SVG.Point } {
			const group = new SVG.G()

			const scaleFactor = Math.abs(scale.x)

			let distance = this.currentDistance.value.value
			let directionBackwards = currentDirectionBackward
			let positionStart = false
			if (this.currentDirection.value.key != defaultCurrentDirectionChoice.key) {
				directionBackwards = this.currentDirection.value.key == "<"
				positionStart = directionBackwards
			}

			let labelPositionBelow = currentLabelBelow
			if (this.currentLabelPosition.value.key != defaultCurrentLabelPositionChoice.key) {
				labelPositionBelow = this.currentLabelPosition.value.key == "_"

				//TODO inform user that the position can only be set if the label position and direction are set explicitely. Probably by implementing something like a disable for editableProperties
				if (this.currentDirection.value.key != defaultCurrentDirectionChoice.key) {
					if (this.currentPosition.value.key != defaultCurrentPositionChoice.key) {
						positionStart = this.currentPosition.value.key == "start"
					}
				}
			}
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
				currentLabel.dir =
					this.currentDirection.value.key != defaultCurrentDirectionChoice.key ?
						this.currentDirection.value.key
					:	undefined
				currentLabel.pos =
					this.currentPosition.value.key != defaultCurrentPositionChoice.key ?
						this.currentPosition.value.key
					:	undefined
				currentLabel.labPos =
					this.currentLabelPosition.value.key != defaultCurrentLabelPositionChoice.key ?
						this.currentLabelPosition.value.key
					:	undefined
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
				if (saveObject.current.dir) {
					this.currentDirection.value = currentDirectionChoices.find(
						(value) => value.key == saveObject.current.dir
					)
				}
				if (saveObject.current.pos) {
					this.currentPosition.value = currentPositionChoices.find(
						(value) => value.key == saveObject.current.pos
					)
				}
				if (saveObject.current.labPos) {
					this.currentLabelPosition.value = currentLabelPositionChoices.find(
						(value) => value.key == saveObject.current.labPos
					)
				}
				this.generateCurrentRender()
			}
		}

		protected buildTikzCurrent(to: CircuitikzTo): void {
			if (this.currentLabel.value != "") {
				const options = to.options

				let currentString = "i"
				let labelPosString = this.currentLabelPosition.value.key
				let dirString = this.currentDirection.value.key
				if (labelPosString != "" && dirString != "") {
					if (this.currentPosition.value.key == "start") {
						currentString += dirString + labelPosString
					} else {
						currentString += labelPosString + dirString
					}
				} else {
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
