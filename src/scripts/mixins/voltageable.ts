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
	EnvironmentVariableController,
} from "../internal"

export type VoltageLabel = {
	label: string
	dist?: number
	bump?: number
	shift?: number
	pos?: string
	dir?: string
	style?: string
}

export type VoltageArrowOptions = {
	isOpen?: boolean
	sourceType?: "isVoltage" | "isCurrent" | "isBattery" | false
}

const voltageDirectionChoices: ChoiceEntry[] = [
	{ key: "", name: "default" },
	{ key: ">", name: "forward" },
	{ key: "<", name: "backward" },
]
let defaultVoltageDirectionBackward = false

const voltagePositionChoices: ChoiceEntry[] = [
	{ key: "", name: "default" },
	{ key: "_", name: "below" },
	{ key: "^", name: "above" },
]
let defaultVoltagePositionAbove = false

const voltageStyleChoices: ChoiceEntry[] = [
	{ key: "", name: "default" },
	{ key: "american", name: "american" },
	{ key: "raised", name: "raised" },
	{ key: "straight", name: "straight" },
	{ key: "european", name: "european" },
]

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
	switchSide: ChoiceProperty<ChoiceEntry>
	switchDirection: ChoiceProperty<ChoiceEntry>
}

export function Voltageable<TBase extends AbstractConstructor<PathComponent>>(Base: TBase) {
	abstract class Voltageable extends Base {
		protected voltageLabel: MathJaxProperty
		protected voltageLabelRendering: SVG.Element
		protected voltageArrowRendering: SVG.Element
		protected voltageRendering: SVG.Element

		protected voltageBumpB: SliderProperty
		protected voltageDistanceFromNode: SliderProperty
		protected voltageShift: SliderProperty
		protected voltagePosition: ChoiceProperty<ChoiceEntry>
		protected voltageDirection: ChoiceProperty<ChoiceEntry>
		protected voltageStyle: ChoiceProperty<ChoiceEntry>

		constructor(...args: any[]) {
			super(...args)
			this.properties.add(
				PropertyCategories.voltage,
				new SectionHeaderProperty("Voltage label", undefined, "voltage:header")
			)

			this.voltageLabel = new MathJaxProperty(undefined, undefined, "voltage:label")
			this.voltageLabel.addChangeListener((ev) => this.generateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageLabel)

			this.voltageStyle = new ChoiceProperty(
				"Style",
				voltageStyleChoices,
				voltageStyleChoices[0],
				undefined,
				"voltage:style"
			)
			this.voltageStyle.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageStyle)

			this.voltagePosition = new ChoiceProperty(
				"Position",
				voltagePositionChoices,
				voltagePositionChoices[0],
				undefined,
				"voltage:position"
			)
			this.voltagePosition.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltagePosition)

			this.voltageDirection = new ChoiceProperty(
				"Direction",
				voltageDirectionChoices,
				voltageDirectionChoices[0],
				undefined,
				"voltage:direction"
			)
			this.voltageDirection.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageDirection)

			this.voltageBumpB = new SliderProperty(
				"Bump",
				0,
				5,
				0.1,
				new SVG.Number(1.5, ""),
				false,
				"How much the voltage arrow should bump away from the component",
				"voltage:bump"
			)
			this.voltageBumpB.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageBumpB)

			this.voltageDistanceFromNode = new SliderProperty(
				"Distance from node",
				0,
				1,
				0.1,
				new SVG.Number(0.5, ""),
				true,
				"How far away from the component the voltage arrow should start/end",
				"voltage:distance"
			)
			this.voltageDistanceFromNode.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageDistanceFromNode)

			this.voltageShift = new SliderProperty(
				"Voltage shift",
				-1,
				2,
				0.1,
				new SVG.Number(0, ""),
				false,
				undefined,
				"voltage:shift"
			)
			this.voltageShift.addChangeListener((ev) => this.updateVoltageRender())
			this.properties.add(PropertyCategories.voltage, this.voltageShift)
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
		): { arrow: SVG.Element; labelPos: SVG.Point; labelAnchorDir: SVG.Point } {
			const group = new SVG.G()

			if (!options) {
				options = {}
			}

			let mirror = scale.y < 0
			const scaleFactor = Math.abs(scale.x)

			const globalSettings = EnvironmentVariableController.instance.getGlobalSettings()
			const globalVoltageDirection = globalSettings.voltageConvention
			const globalVoltageStyle = globalSettings.voltages

			let distanceFromNode = this.voltageDistanceFromNode.value.value
			let bump = this.voltageBumpB.value.value
			let shift = this.voltageShift.value.value
			let directionBackwards = defaultVoltageDirectionBackward
			if (this.voltageDirection.value.key != voltageDirectionChoices[0].key) {
				directionBackwards = this.voltageDirection.value.key == voltageDirectionChoices.at(-1).key
			}
			let positionAbove = defaultVoltagePositionAbove
			if (this.voltagePosition.value.key != voltagePositionChoices[0].key) {
				positionAbove = this.voltagePosition.value.key == voltagePositionChoices.at(-1).key
			}
			let above = positionAbove ? -1 : 1

			let isEuropeanVoltage =
				this.voltageStyle.value.key == "european" ||
				this.voltageStyle.value.key == "straight" ||
				(this.voltageStyle.value.key == "" &&
					(globalVoltageStyle == "european" || globalVoltageStyle == "straight"))
			let isStraightVoltage =
				this.voltageStyle.value.key == "straight" ||
				(this.voltageStyle.value.key == "" && globalVoltageStyle == "straight")
			let isRaisedVoltage =
				this.voltageStyle.value.key == "raised" ||
				(this.voltageStyle.value.key == "" && globalVoltageStyle == "raised")

			let diff = end.sub(start)
			let angle = Math.atan2(diff.y, diff.x)
			let endTrans = end.rotate(angle, start, true)

			// in which direction the the anchor of the voltage label should point
			const sin4 = 0.06976 // the sin of 4 degrees
			let labelAnchor = new SVG.Point(
				approxCompare(Math.sin(angle), 0, sin4),
				-approxCompare(Math.cos(angle), 0, sin4)
			).mul(above)

			const distFromLine = distanceFromLine * defaultRlen * scaleFactor * cmtopx

			let absVShift = above * (1 + shift) * distFromLine

			const midTrans = start.add(endTrans).div(2)
			const mid = start.add(end).div(2)
			const compStart = midTrans.add(new SVG.Point(northwestDelta.x * scaleFactor, 0))
			const compEnd = midTrans.add(new SVG.Point(southeastDelta.x * scaleFactor, 0))

			const arrowScale = (cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth

			// calculate the points where the voltage arrow should start and end (flat, before rotation)
			const arrowOffset = arrowScale / Math.abs(compStart.x - start.x)

			let tmp = interpolate(start, compStart, arrowOffset)
			let Vfrom_flat = interpolate(tmp, compStart, distanceFromNode)
			tmp = interpolate(endTrans, compEnd, arrowOffset)
			let Vto_flat = interpolate(tmp, compEnd, distanceFromNode)

			const minYSize = 3
			let sizing = southeastDelta
			if (southeastDelta.y < minYSize) {
				// set minimum size if no height is given
				sizing = new SVG.Point(southeastDelta.x, minYSize)
			}

			if (positionAbove != mirror) {
				sizing = northwestDelta
				if (northwestDelta.y > -minYSize) {
					// set minimum size if no height is given
					sizing = new SVG.Point(northwestDelta.x, -minYSize)
				}
			}
			sizing = mirror ? sizing.mul(-1) : sizing

			let labPos: SVG.Point = new SVG.Point(this.position)
			let Vfrom: SVG.Point
			let Vto: SVG.Point

			const labelOffset = new SVG.Point(0, above * 0.08 * cmtopx)

			if (isEuropeanVoltage) {
				//european

				let d: string

				let arrowPos: SVG.Point
				let arrowAngle: number
				const sin20 = 0.34202 // sin of 20 degrees

				if (isStraightVoltage) {
					//straight voltages
					let bottom = new SVG.Point(0, sizing.y)
					let Vfrom1 = Vfrom_flat.add(bottom)
					let Vto1 = Vto_flat.add(bottom)
					Vfrom = Vfrom1.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
					Vto = Vto1.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)

					d = `M${Vfrom.toSVGPathString()}L${Vto.toSVGPathString()}`
					arrowPos = Vto
					arrowAngle = angle
					if (directionBackwards) {
						arrowAngle += Math.PI
						arrowPos = Vfrom
					}
					labPos = Vfrom.add(Vto).div(2)
				} else {
					//curved voltage arrows
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

					Vfrom = Vfrom_flat.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
					Vto = Vto_flat.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
					d = `M${Vfrom.toSVGPathString()}C${C110.toSVGPathString()} ${C70.toSVGPathString()} ${Vto.toSVGPathString()}`

					labPos = C110.add(C70).div(2)

					let arrowAngleDiff: SVG.Point
					arrowPos = Vto
					if (directionBackwards) {
						arrowAngleDiff = Vfrom.sub(C110)
						arrowPos = Vfrom
					} else {
						arrowAngleDiff = Vto.sub(C70)
					}
					arrowAngle = Math.atan2(arrowAngleDiff.y, arrowAngleDiff.x)
				}

				labPos = labPos.add(labelOffset.rotate(-angle, undefined, true))

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
			} else {
				//american
				if (isRaisedVoltage) {
					//raised voltages
					let refHeight = 10
					absVShift += above * refHeight
					labelAnchor.x = 0
					labelAnchor.y = 0
				}

				labPos = midTrans.add(new SVG.Point(0, sizing.y + absVShift))
				Vfrom = Vfrom_flat.add(new SVG.Point(0, absVShift))
				Vto = Vto_flat.add(new SVG.Point(0, absVShift))
				if (isRaisedVoltage) {
					//raised voltages
					Vfrom.y = labPos.y
					Vto.y = labPos.y
				}

				Vfrom = Vfrom.rotate(-angle, start, true)
				Vto = Vto.rotate(-angle, start, true)
				labPos = labPos.rotate(-angle, start, true)

				const plus = new SVG.Path({ d: "M0 4.5 H9 M4.5 0V9" }).stroke({
					linejoin: "round",
					width: 0.5,
					color: defaultStroke,
				})
				const minus = new SVG.Path({ d: "M0 4.5 H9" }).stroke({
					linejoin: "round",
					width: 0.5,
					color: defaultStroke,
				})

				const plusBBox = plus.bbox()
				const plusHalfSize = new SVG.Point(plusBBox.w / 2, plusBBox.h / 2)
				const anchorOffset = plusHalfSize.add(plusHalfSize.mul(labelAnchor))
				if (directionBackwards) {
					plus.transform({ translate: Vto.sub(anchorOffset) })
					minus.transform({ translate: Vfrom.sub(anchorOffset) })
				} else {
					plus.transform({ translate: Vfrom.sub(anchorOffset) })
					minus.transform({ translate: Vto.sub(anchorOffset) })
				}

				group.add(plus)
				group.add(minus)

				if (!isRaisedVoltage) {
					labPos = labPos.add(labelOffset.rotate(-angle, undefined, true))
				}
			}

			return {
				arrow: group,
				labelPos: labPos,
				labelAnchorDir: labelAnchor,
			}
		}

		public toJson(): PathSaveObject {
			const data = super.toJson() as PathSaveObject & { voltage?: VoltageLabel }

			if (this.voltageLabel.value != "") {
				const voltageLabel: VoltageLabel = { label: this.voltageLabel.value }
				voltageLabel.bump = this.voltageBumpB.value.value != 1.5 ? this.voltageBumpB.value.value : undefined
				voltageLabel.dist =
					this.voltageDistanceFromNode.value.value != 0.5 ?
						this.voltageDistanceFromNode.value.value
					:	undefined
				voltageLabel.shift = this.voltageShift.value.value != 0 ? this.voltageShift.value.value : undefined
				voltageLabel.dir =
					this.voltageDirection.value.key != voltageDirectionChoices[0].key ?
						this.voltageDirection.value.key
					:	undefined
				voltageLabel.pos =
					this.voltagePosition.value.key != voltagePositionChoices[0].key ?
						this.voltagePosition.value.key
					:	undefined
				voltageLabel.style =
					this.voltageStyle.value.key != voltageStyleChoices[0].key ? this.voltageStyle.value.key : undefined
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
					this.voltageBumpB.value = new SVG.Number(saveObject.voltage.bump, "")
				}
				if (saveObject.voltage.dist) {
					this.voltageDistanceFromNode.value = new SVG.Number(saveObject.voltage.dist, "")
				}
				if (saveObject.voltage.dir) {
					this.voltageDirection.value = voltageDirectionChoices.find(
						(value) => value.key == saveObject.voltage.dir
					)
				}
				if (saveObject.voltage.pos) {
					this.voltagePosition.value = voltagePositionChoices.find(
						(value) => value.key == saveObject.voltage.pos
					)
				}
				if (saveObject.voltage.style) {
					this.voltageStyle.value = voltageStyleChoices.find((value) => value.key == saveObject.voltage.style)
				}
				this.generateVoltageRender()
			}
		}

		protected buildTikzVoltage(to: CircuitikzTo): void {
			if (this.voltageLabel.value != "") {
				const options = to.options

				let voltageString = "v"
				if (this.voltagePosition.value.key != voltagePositionChoices[0].key) {
					voltageString += this.voltagePosition.value.key
				}
				if (this.voltageDirection.value.key != voltageDirectionChoices[0].key) {
					voltageString += this.voltageDirection.value.key
				}
				voltageString += "=$" + this.voltageLabel.value + "$"
				options.push(voltageString)

				if (this.voltageDistanceFromNode.value.value != 0.5) {
					options.push("voltage/distance from node=" + this.voltageDistanceFromNode.value.value.toString())
				}

				if (this.voltageBumpB.value.value != 1.5) {
					options.push("voltage/bump b=" + this.voltageBumpB.value.value.toString())
				}

				if (this.voltageShift.value.value != 0) {
					options.push("voltage/shift=" + this.voltageShift.value.value.toString())
				}

				if (this.voltageStyle.value.key != voltageStyleChoices[0].key) {
					options.push("voltage=" + this.voltageStyle.value.key)
				}
			}
		}
	}
	return Voltageable
}
