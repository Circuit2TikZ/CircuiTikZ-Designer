import * as SVG from "@svgdotjs/svg.js"
import {
	ChoiceEntry,
	ComponentSaveObject,
	defaultStroke,
	closestBasicDirection,
	PositionLabelable,
	Nameable,
	PositionedLabel,
	simpifyRotationAndScale,
	buildTikzStringFromNodeCommand,
	TikzNodeCommand,
	SaveController,
} from "../internal"
import { CircuitComponent } from "./circuitComponent"

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

export type DirectionInfo = ChoiceEntry & {
	direction: SVG.Point
	pointer?: string
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
export abstract class NodeComponent extends PositionLabelable(Nameable(CircuitComponent)) {
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

	// where the text should go by default in local coordinates
	protected defaultTextPosition: SVG.Point

	constructor() {
		super()
		this.position = new SVG.Point()
		this.size = new SVG.Point()

		this.rotationDeg = 0
		this.scaleState = new SVG.Point(1, 1)

		this.defaultTextPosition = new SVG.Point()
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
		this.finishedPlacing = true
		this.update()
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

		return data
	}

	protected applyJson(saveObject: NodeSaveObject): void {
		super.applyJson(saveObject)
		this.position = new SVG.Point(saveObject.position)
		// @ts-ignore
		if (saveObject.rotation || saveObject.rotationDeg) {
			// @ts-ignore
			this.rotationDeg = saveObject.rotation ?? saveObject.rotationDeg
		}

		if (saveObject.scale) {
			this.scaleState = new SVG.Point(saveObject.scale)
		}
	}

	public toTikzString(): string {
		let command: TikzNodeCommand = {
			additionalNodes: [],
			options: [],
		}
		this.buildTikzCommand(command)
		return buildTikzStringFromNodeCommand(command)
	}

	protected buildTikzCommand(command: TikzNodeCommand) {
		super.buildTikzCommand(command)
		command.position = this.position

		let [rotation, scale] = simpifyRotationAndScale(this.rotationDeg, this.scaleState)

		if (rotation !== 0) {
			command.options.push("rotate=" + rotation)
		}
		if (scale.x != 1) {
			command.options.push("xscale=" + scale.x)
		}
		if (scale.y != 1) {
			command.options.push("yscale=" + scale.y)
		}

		const shouldAddLabel = this.mathJaxLabel.value !== ""
		command.name = this.buildTikzName(shouldAddLabel)
		if (shouldAddLabel) {
			command.additionalNodes.push(this.buildTikzNodeLabel(command.name))
		}
	}

	public updatePositionedLabel(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		let textPos: SVG.Point // in local coords
		let textDir: SVG.Point // normalized direction to size (length not normalized) in local coords
		let halfSize = this.size.div(2)

		// calculate the text position in world space
		if (this.positionChoice.value.key == defaultBasicDirection.key) {
			textPos = this.defaultTextPosition.transform(transformMatrix)
			this.labelPos = undefined
			textDir = closestBasicDirection(this.defaultTextPosition.sub(halfSize).div(halfSize)).direction
		} else {
			if (this.labelReferenceProperty.value.key == "canvas") {
				// the component should be placed absolute to the canvas
				// bring desired direction into local coordinates
				textDir = this.positionChoice.value.direction.transform(
					new SVG.Matrix({
						rotate: -this.rotationDeg,
						scaleX: Math.sign(this.scaleState.x),
						scaleY: Math.sign(this.scaleState.y),
					}).inverse()
				)
				// check which label direction should be used to get the final correct direction
				this.labelPos = closestBasicDirection(textDir)
			} else {
				// just use whatever is selected
				this.labelPos = this.positionChoice.value
			}
			textDir = this.labelPos.direction
			textPos = halfSize.add(textDir.mul(halfSize)).transform(transformMatrix)
		}

		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
		if (this.anchorChoice.value.key == defaultBasicDirection.key) {
			//transform anchor direction back to global coordinates
			let labelRefDir = textDir.mul(-1).transform(
				new SVG.Matrix({
					rotate: -this.rotationDeg,
					scaleX: Math.sign(this.scaleState.x),
					scaleY: Math.sign(this.scaleState.y),
				})
			)

			// check which direction should be used to get the final correct direction
			this.anchorPos = closestBasicDirection(labelRefDir)
		} else {
			// an explicit anchor was selected
			this.anchorPos = this.anchorChoice.value
		}
		let labelRef = this.anchorPos.direction

		let ref = labelRef
			.add(1)
			.div(2)
			.mul(new SVG.Point(labelBBox.w, labelBBox.h))
			.add(new SVG.Point(labelBBox.x, labelBBox.y))
			.add(labelRef.mul(labelDist))

		labelSVG.transform({ translate: textPos.sub(ref) })
	}
}
