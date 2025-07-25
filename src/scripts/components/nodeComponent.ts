import * as SVG from "@svgdotjs/svg.js"
import {
	ChoiceEntry,
	ChoiceProperty,
	clamp,
	ColorProperty,
	MathJaxProperty,
	SliderProperty,
	ComponentSaveObject,
	defaultStroke,
	CanvasController,
	renderMathJax,
	SectionHeaderProperty,
	Label,
	AdjustDragHandler,
	SnappingInfo,
	FillInfo,
	SnapDragHandler,
} from "../internal"
import { CircuitComponent, getClosestPointerFromDirection } from "./circuitComponent"
import { resizeSVG } from "../utils/selectionHelper"

export const basicDirections: DirectionInfo[] = [
	{ key: "default", name: "default", direction: new SVG.Point(NaN, NaN) },
	{ key: "center", name: "center", direction: new SVG.Point() },
	{ key: "north", name: "north", direction: new SVG.Point(0, -1), pointer: "ns-resize" },
	{ key: "south", name: "south", direction: new SVG.Point(0, 1), pointer: "ns-resize" },
	{ key: "east", name: "east", direction: new SVG.Point(1, 0), pointer: "ew-resize" },
	{ key: "west", name: "west", direction: new SVG.Point(-1, 0), pointer: "ew-resize" },
	{ key: "northeast", name: "north east", direction: new SVG.Point(1, -1), pointer: "nesw-resize" },
	{ key: "northwest", name: "north west", direction: new SVG.Point(-1, -1), pointer: "nwse-resize" },
	{ key: "southeast", name: "south east", direction: new SVG.Point(1, 1), pointer: "nwse-resize" },
	{ key: "southwest", name: "south west", direction: new SVG.Point(-1, 1), pointer: "nesw-resize" },
]
export const defaultBasicDirection = basicDirections[0]

/**
 * Finds the closest basic direction from a given direction.
 * Basic directions are defined in `basicDirections` and include cardinal and intercardinal directions.
 * @param direction the direction to find the closest basic direction for
 * @returns
 */
export function getClosestBasicDirectionFromDirection(direction: SVG.Point): DirectionInfo {
	let dir = new SVG.Point(direction)
	dir.x = clamp(Math.round(dir.x), -1, 1)
	dir.y = clamp(Math.round(dir.y), -1, 1)
	return (
		basicDirections.find((dirInfo) => dirInfo.direction.x === dir.x && dirInfo.direction.y === dir.y) ??
		basicDirections[0]
	)
}

export type DirectionInfo = ChoiceEntry & {
	direction: SVG.Point
	pointer?: string
}

export type PositionedLabel = Label & {
	anchor?: string
	position?: string
	relativeToComponent?: boolean
}

export type NodeSaveObject = ComponentSaveObject & {
	position: SVG.Point
	scale?: SVG.Point
	rotation?: number
	label?: PositionedLabel
	name?: string
}

/**
 * abstract super class for all node components.
 * This includes all components that are represented by a node, i.e. are drawn via a tikz node command at a single position.
 *
 * Examples are: transistors, ground, rectangles, text boxes, etc.
 *
 * Extend this class to create a new component which is represented by a node.
 *
 * NodeComponents are edited/adjusted in local coordinates. Transformations like translation (moving), rotation, scaling and flipping are done by changing the transformation Matrix
 */
export abstract class NodeComponent extends CircuitComponent {
	/**
	 * the current rotation angle in degrees
	 */
	public rotationDeg: number = 0

	protected scaleState: SVG.Point
	/**
	 * the component size in local coordinates
	 */
	protected size: SVG.Point

	protected resizeVisualizations: Map<DirectionInfo, SVG.Element>
	protected isResizing: boolean = false

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

	protected textPosNoTransform: SVG.Point

	constructor() {
		super()
		this.position = new SVG.Point()
		this.size = new SVG.Point()

		this.rotationDeg = 0
		this.scaleState = new SVG.Point(1, 1)

		this.textPosNoTransform = new SVG.Point()

		//label section
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Label").buildHTML())

		this.mathJaxLabel = new MathJaxProperty()
		this.mathJaxLabel.addChangeListener((ev) => this.generateLabelRender())
		this.propertiesHTMLRows.push(this.mathJaxLabel.buildHTML())

		this.labelReferenceProperty = new ChoiceProperty(
			"Relative to",
			this.labelReferenceChoices,
			this.labelReferenceChoices[0]
		)
		this.labelReferenceProperty.addChangeListener((ev) => {
			this.updateLabelPosition()
		})
		this.propertiesHTMLRows.push(this.labelReferenceProperty.buildHTML())

		this.anchorChoice = new ChoiceProperty("Anchor", basicDirections, defaultBasicDirection)
		this.anchorChoice.addChangeListener((ev) => this.updateLabelPosition())
		this.propertiesHTMLRows.push(this.anchorChoice.buildHTML())

		this.positionChoice = new ChoiceProperty("Position", basicDirections, defaultBasicDirection)
		this.positionChoice.addChangeListener((ev) => this.updateLabelPosition())
		this.propertiesHTMLRows.push(this.positionChoice.buildHTML())

		this.labelDistance = new SliderProperty("Gap", -0.5, 1, 0.01, new SVG.Number(0.12, "cm"))
		this.labelDistance.addChangeListener((ev) => this.updateLabelPosition())
		this.propertiesHTMLRows.push(this.labelDistance.buildHTML())

		this.labelColor = new ColorProperty("Color", null)
		this.labelColor.addChangeListener((ev) => {
			this.updateTheme()
		})
		this.propertiesHTMLRows.push(this.labelColor.buildHTML())
	}

	public abstract resizable(resize: boolean): void

	public placeMove(pos: SVG.Point): void {
		this.moveTo(pos)
	}
	public placeRotate(angleDeg: number): void {
		this.rotate(angleDeg)
	}
	public placeFlip(horizontal: boolean): void {
		this.flip(horizontal)
	}
	public placeStep(pos: SVG.Point): boolean {
		this.moveTo(pos)
		return true
	}
	public placeFinish(): void {
		// make draggable
		this.draggable(true)
		this.update()
		this.finishedPlacing = true
	}

	public remove(): void {
		super.remove()
		this.labelRendering?.remove()
	}

	public moveRel(delta: SVG.Point): void {
		this.moveTo(this.position.add(delta))
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			scaleX: this.scaleState.x,
			scaleY: this.scaleState.y,
			translate: [-this.referencePosition.x, -this.referencePosition.y],
			origin: [this.referencePosition.x, this.referencePosition.y],
		}).lmultiply(
			new SVG.Matrix({
				rotate: -this.rotationDeg,
				translate: [this.position.x, this.position.y],
			})
		)
	}

	public updateTheme() {
		let labelColor = defaultStroke
		if (this.labelColor && this.labelColor.value) {
			labelColor = this.labelColor.value.toString()
		}
		this.labelRendering?.fill(labelColor)
	}

	/**
	 * Generate a label visualization via mathjax
	 */
	protected generateLabelRender() {
		// if a previous label was rendered, remove everything concerning that rendering
		if (this.labelRendering) {
			let removeIDs = new Set<string>()
			for (const element of this.labelRendering.find("use")) {
				removeIDs.add(element.node.getAttribute("xlink:href"))
			}

			for (const id of removeIDs) {
				CanvasController.instance.canvas.find(id)[0]?.remove()
			}
		}
		const transformGroup = renderMathJax(this.mathJaxLabel.value)
		// remove the current label and substitute with a new group element
		this.labelRendering?.remove()
		this.labelRendering = new SVG.G()
		this.labelRendering.addClass("pointerNone")
		this.labelRendering.add(transformGroup.element)
		// add the label rendering to the visualization element
		this.visualization.add(this.labelRendering)
		this.update()
		this.updateTheme()
	}

	protected recalculateResizePoints(): void {}

	public moveTo(position: SVG.Point) {
		this.position = position.clone()
		this.update()
	}

	public rotate(angleDeg: number): void {
		this.rotationDeg += angleDeg
		this.simplifyRotationAngle()

		this.update()
	}

	/**
	 * helper method to always be between -180 and 180 degrees.
	 */
	public simplifyRotationAngle() {
		// modulo with extra steps since js modulo is weird for negative numbers
		this.rotationDeg = ((((this.rotationDeg + 180) % 360) + 360) % 360) - 180
	}

	public flip(horizontal: boolean): void {
		if (horizontal) {
			this.scaleState.y *= -1
			this.rotationDeg *= -1
		} else {
			this.scaleState.y *= -1
			this.rotationDeg = 180 - this.rotationDeg
		}
		this.simplifyRotationAngle()
		this.update()
	}

	public toJson(): NodeSaveObject {
		const data = super.toJson() as NodeSaveObject
		data.position = this.position.simplifyForJson()

		if (this.rotationDeg !== 0) {
			data.rotation = this.rotationDeg
		}
		if (this.scaleState && (this.scaleState.x != 1 || this.scaleState.y != 1)) {
			data.scale = this.scaleState
		}

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

		if (this.name.value && this.name.value != "") {
			data.name = this.name.value
		}
		return data
	}

	protected applyJson(saveObject: NodeSaveObject): void {
		super.applyJson(saveObject)
		this.position = new SVG.Point(saveObject.position)
		if (saveObject.rotation) {
			this.rotationDeg = saveObject.rotation
		}

		if (saveObject.scale) {
			this.scaleState = new SVG.Point(saveObject.scale)
		}

		if (saveObject.name) {
			this.name.updateValue(saveObject.name, true)
		}

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

	protected anchorPos: DirectionInfo
	protected labelPos: DirectionInfo
	public updateLabelPosition(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		let textPos: SVG.Point
		let ref: SVG.Point

		// get relevant positions and bounding boxes
		let bboxHalfSize = new SVG.Point(this.size.x / 2, this.size.y / 2)
		let textDir: SVG.Point // normalized direction to bbox size
		let textPosNoTransform: SVG.Point // relative to the upper left corner in local coordinates
		// get the position of the label
		if (this.positionChoice.value.key == defaultBasicDirection.key) {
			textPosNoTransform = this.textPosNoTransform
			textDir = textPosNoTransform.sub(bboxHalfSize).div(bboxHalfSize)
		} else {
			if (this.labelReferenceProperty.value.key == "canvas") {
				// the component should be placed absolute to the canvas
				//reverse local transform effect
				textDir = this.positionChoice.value.direction.transform(
					new SVG.Matrix({
						rotate: -this.rotationDeg,
						scaleX: this.scaleState.x,
						scaleY: this.scaleState.y,
					}).inverse()
				)
				// check which label direction should be used to get the final correct direction
				textDir = textDir.div(textDir.abs())
				textDir.x = Math.round(textDir.x)
				textDir.y = Math.round(textDir.y)
			} else {
				// just use whatever is selected
				textDir = this.positionChoice.value.direction
			}

			textPosNoTransform = bboxHalfSize.add(bboxHalfSize.mul(textDir))
		}
		this.labelPos = basicDirections.find((item) => item.direction.eq(textDir))
		textPos = textPosNoTransform.transform(transformMatrix)
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelRef: SVG.Point
		let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
		if (this.anchorChoice.value.key == defaultBasicDirection.key) {
			labelRef = textDir.mul(-1)
			//transform anchor direction back to global coordinates
			labelRef = labelRef.transform(
				new SVG.Matrix({
					rotate: -this.rotationDeg,
					scaleX: this.scaleState.x,
					scaleY: this.scaleState.y,
				})
			)

			// check which direction should be used to get the final correct direction
			labelRef = labelRef.div(labelRef.abs())
			labelRef.x = Math.round(labelRef.x)
			labelRef.y = Math.round(labelRef.y)

			this.anchorPos = basicDirections.find((item) => item.direction.eq(labelRef))
		} else {
			// an explicit anchor was selected
			this.anchorPos = this.anchorChoice.value
			labelRef = this.anchorPos.direction
		}

		ref = labelRef
			.add(1)
			.div(2)
			.mul(new SVG.Point(labelBBox.w, labelBBox.h))
			.add(new SVG.Point(labelBBox.x, labelBBox.y))
			.add(labelRef.mul(labelDist))

		// acutally move the label
		let movePos = textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({ translate: [movePos.x, movePos.y] }))
	}
}
