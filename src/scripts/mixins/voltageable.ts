import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	BooleanProperty,
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
} from "../internal"

export type VoltageLabel = VoltageArrowOptions & {
	label: string
}

export type VoltageArrowOptions = {
	distanceFromNode?: number
	bump?: number
	shift?: number
	invertSide?: boolean
	invertDirection?: boolean
}

function interpolate(a: SVG.Point, b: SVG.Point, t: number) {
	return b.mul(t).add(a.mul(1 - t))
}

const arrowStrokeWidth = 0.5
const distanceFromLine = 0.08
const currentArrowScale = 16
const defaultRlen = 1.4
const cmtopx = 4800 / 127 // 96px/2.54

export interface Voltageable {
	voltageLabel: MathJaxProperty
	voltageLabelRendering: SVG.Element
	voltageArrowRendering: SVG.Element
	voltageRendering: SVG.Element

	bumpB: SliderProperty
	distanceFromNode: SliderProperty
	voltageShift: SliderProperty
	switchSide: BooleanProperty
	switchDirection: BooleanProperty
}

export function Voltageable<TBase extends AbstractConstructor<PathComponent>>(Base: TBase) {
	abstract class Voltageable extends Base {
		protected voltageLabel: MathJaxProperty
		protected voltageLabelRendering: SVG.Element
		protected voltageArrowRendering: SVG.Element
		protected voltageRendering: SVG.Element

		protected bumpB: SliderProperty
		protected distanceFromNode: SliderProperty
		protected voltageShift: SliderProperty
		protected switchSide: BooleanProperty
		protected switchDirection: BooleanProperty

		constructor(...args: any[]) {
			super(...args)
			this.properties.add(PropertyCategories.voltage, new SectionHeaderProperty("Voltage label"))

			this.voltageLabel = new MathJaxProperty()
			this.voltageLabel.addChangeListener((ev) => this.generateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageLabel)

			this.bumpB = new SliderProperty(
				"Bump b",
				0,
				5,
				0.1,
				new SVG.Number(1.5, ""),
				false,
				"How much the voltage arrow should bump away from the component"
			)
			this.bumpB.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.bumpB)

			this.distanceFromNode = new SliderProperty(
				"Distance from node",
				0,
				1,
				0.1,
				new SVG.Number(0.5, ""),
				true,
				"How far away from the component the voltage arrow should start/end"
			)
			this.distanceFromNode.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.distanceFromNode)

			this.voltageShift = new SliderProperty(
				"Shift voltage",
				-1,
				2,
				0.1,
				new SVG.Number(0, ""),
				false,
				"Shift the voltage away from the component"
			)
			this.voltageShift.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageShift)

			this.switchSide = new BooleanProperty(
				"Switch side",
				false,
				"On which side the voltage arrow should be drawn"
			)
			this.switchSide.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.switchSide)

			this.switchDirection = new BooleanProperty(
				"Switch direction",
				false,
				"In which direction the arrow should point"
			)
			this.switchDirection.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.switchDirection)
		}

		protected generateVoltageRender(): void {
			this.voltageLabelRendering = generateLabelRender(this.voltageLabelRendering, this.voltageLabel)
			this.voltageLabelRendering.fill(defaultStroke)

			this.voltageRendering = new SVG.G()
			this.voltageRendering.add(this.voltageLabelRendering)
			this.visualization.add(this.voltageRendering)
			this.update()
			this.updateTheme()
		}

		protected abstract updateVoltageRender(): void

		protected generateVoltageArrow(
			start: SVG.Point,
			end: SVG.Point,
			northwestDelta: SVG.Point,
			southeastDelta: SVG.Point,
			scale: SVG.Point,
			options?: VoltageArrowOptions
		): { arrow: SVG.Element; labelPos: SVG.Point } {
			const group = new SVG.G()

			if (!options) {
				options = {}
			}

			let mirror = scale.y < 0
			const scaleFactor = Math.abs(scale.x)

			let distanceFromNode = options.distanceFromNode ?? 0.5
			let bump = options.bump ?? 1.5
			let shift = options.shift ?? 0
			let invertSide = options.invertSide != undefined ? options.invertSide : false
			let side = invertSide ? -1 : 1
			let invertDirection = options.invertDirection != undefined ? options.invertDirection : false

			let diff = end.sub(start)
			let angle = Math.atan2(diff.y, diff.x)
			let endTrans = end.rotate(angle, start, true)

			const distFromLine = distanceFromLine * defaultRlen * scaleFactor * cmtopx

			let absVShift = side * (1 + shift) * distFromLine

			const midTrans = start.add(endTrans).div(2)
			const mid = start.add(end).div(2)
			const compStart = midTrans.add(new SVG.Point(northwestDelta.x * scaleFactor, 0))
			const compEnd = midTrans.add(new SVG.Point(southeastDelta.x * scaleFactor, 0))

			const arrowScale = (cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth

			const arrowOffset = defaultRlen / currentArrowScale
			let tmp = interpolate(start, compStart, arrowOffset)
			let Vfrom = interpolate(tmp, compStart, distanceFromNode)
			tmp = interpolate(endTrans, compEnd, arrowOffset)
			let Vto = interpolate(tmp, compEnd, distanceFromNode)

			const sin20 = 0.34202 // sin of 20 degrees

			let d: string
			// let sizing = invertSide != mirror ? northwestDelta : southeastDelta
			let sizing = southeastDelta
			if (invertSide != mirror) {
				sizing = northwestDelta
			}
			sizing = mirror ? sizing.mul(-1) : sizing
			let C110 = interpolate(
				new SVG.Point(),
				new SVG.Point(-sin20 * Math.abs(sizing.y), sizing.y),
				bump * scaleFactor
			)
				.add(mid)
				.add(new SVG.Point(0, absVShift))
				.rotate(-angle, mid, true)
			let C70 = interpolate(
				new SVG.Point(),
				new SVG.Point(sin20 * Math.abs(sizing.y), sizing.y),
				bump * scaleFactor
			)
				.add(mid)
				.add(new SVG.Point(0, absVShift))
				.rotate(-angle, mid, true)
			let Vfrom1 = Vfrom.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
			let Vto1 = Vto.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
			d = `M${Vfrom1.toSVGPathString()}C${C110.toSVGPathString()} ${C70.toSVGPathString()} ${Vto1.toSVGPathString()}`

			let arrowAngleDiff: SVG.Point
			let arrowPos = Vto1
			if (invertDirection) {
				arrowAngleDiff = Vfrom1.sub(C110)
				arrowPos = Vfrom1
			} else {
				arrowAngleDiff = Vto1.sub(C70)
			}
			let arrowAngle = Math.atan2(arrowAngleDiff.y, arrowAngleDiff.x)

			const path = new SVG.Path({ d: d })
			path.fill("none").stroke({ color: defaultStroke, width: arrowStrokeWidth })
			const arrowTip = CanvasController.instance.canvas.use("currarrow").fill(defaultStroke)
			const arrowTipTransform = new SVG.Matrix({
				translate: [-1.7 + (2 * arrowStrokeWidth) / arrowScale, -0.8],
			}).lmultiply({
				scale: arrowScale,
				rotate: (180 * arrowAngle) / Math.PI,
				translate: arrowPos,
			})
			arrowTip.transform(arrowTipTransform)

			group.add(path)
			group.add(arrowTip)

			return { arrow: group, labelPos: C110.add(C70).div(2) }
		}

		public toJson(): PathSaveObject {
			const data = super.toJson() as PathSaveObject & { voltage?: VoltageLabel }

			if (this.voltageLabel.value != "") {
				const voltageLabel: VoltageLabel = { label: this.voltageLabel.value }
				voltageLabel.bump = this.bumpB.value.value != 1.5 ? this.bumpB.value.value : undefined
				voltageLabel.distanceFromNode =
					this.distanceFromNode.value.value != 0.5 ? this.distanceFromNode.value.value : undefined
				voltageLabel.shift = this.voltageShift.value.value != 0 ? this.voltageShift.value.value : undefined
				voltageLabel.invertDirection = this.switchDirection.value ? true : undefined
				voltageLabel.invertSide = this.switchSide.value ? true : undefined
				data.voltage = voltageLabel
			}

			return data
		}

		protected applyJson(saveObject: PathSaveObject & { voltage?: VoltageLabel }): void {
			super.applyJson(saveObject)

			if (saveObject.voltage) {
				this.voltageLabel.value = saveObject.voltage.label
				if (saveObject.voltage.shift) {
					this.voltageShift.value = new SVG.Number(saveObject.voltage.shift, "")
				}
				if (saveObject.voltage.bump) {
					this.bumpB.value = new SVG.Number(saveObject.voltage.bump, "")
				}
				if (saveObject.voltage.distanceFromNode) {
					this.distanceFromNode.value = new SVG.Number(saveObject.voltage.distanceFromNode, "")
				}
				if (saveObject.voltage.invertDirection) {
					this.switchDirection.value = saveObject.voltage.invertDirection
				}
				if (saveObject.voltage.invertSide) {
					this.switchSide.value = saveObject.voltage.invertSide
				}
				this.generateVoltageRender()
			}
		}

		protected buildTikzVoltage(to: CircuitikzTo): void {
			if (this.voltageLabel.value != "") {
				const options = to.options

				let voltageString = "v"
				if (this.switchSide.value) {
					voltageString += "^"
				}
				if (this.switchDirection.value) {
					voltageString += "<"
				}
				voltageString += "=$" + this.voltageLabel.value + "$"
				options.push(voltageString)

				if (this.distanceFromNode.value.value != 0.5) {
					options.push("voltage/distance from node=" + this.distanceFromNode.value.value.toString())
				}

				if (this.bumpB.value.value != 1.5) {
					options.push("voltage/bump b=" + this.bumpB.value.value.toString())
				}

				if (this.voltageShift.value.value != 0) {
					options.push("voltage/shift=" + this.voltageShift.value.value.toString())
				}
			}
		}
	}
	return Voltageable
}
