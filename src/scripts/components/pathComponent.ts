import * as SVG from "@svgdotjs/svg.js"
import {
	AdjustDragHandler,
	buildTikzStringFromPathCommand,
	CircuitComponent,
	ComponentSaveObject,
	MainController,
	SnapCursorController,
	TikzPathCommand,
} from "../internal"
import { resizeSVG } from "../utils/selectionHelper"

export type PathOrientation = {
	mirror: boolean
	invert: boolean
}

export type PathSaveObject = ComponentSaveObject & {
	points: SVG.Point[]
}
/**
 * abstract super class for all path components
 * This includes all components that are represented by a path, i.e. are drawn via a tikz path command with 2 or more reference points, where said reference points should be adjustable.
 *
 * Examples are: resistors, capacitors, inductors, diodes, sources, polygons, wires, arrows, arcs, etc.
 *
 * Extend this class to create a new component which is represented by a path.
 *
 * PathComponents are edited/adjusted in world coordinates via their referencePoints. Transformations like translation (moving), rotation, scaling and flipping are done by adjusting changing the referencePoints
 */
export abstract class PathComponent extends CircuitComponent {
	/**
	 * how many reference points this path component should consist of. Standard is 2, i.e. a path with a start and end point. Set this to -1 to allow an arbitrary number of points.
	 */
	protected pointLimit: number = 2
	/**
	 * the points of the path component in world coordinates
	 */
	protected referencePoints: SVG.Point[]
	/**
	 * the SVG elements which represent the reference points of this path component
	 * These are used to drag the reference points around.
	 */
	protected resizableSVGs: SVG.Element[]

	/**
	 * if the component is currently being adjusted, i.e. the reference points are being shown
	 */
	protected isResizing: boolean = false

	constructor() {
		super()
		this.referencePoints = []
		this.resizableSVGs = []
		SnapCursorController.instance.visible = true
	}

	public moveRel(delta: SVG.Point): void {
		for (let index = 0; index < this.referencePoints.length; index++) {
			this.referencePoints[index] = this.referencePoints[index].add(delta)
		}
		this.update()
	}

	public moveTo(position: SVG.Point): void {
		let diff = position.sub(this.position)
		this.moveRel(diff)
	}

	protected movePointTo(index: number, position: SVG.Point): void {
		if (index < 0 || index >= this.referencePoints.length) {
			throw new Error(
				`Index ${index} out of bounds for reference points array of length ${this.referencePoints.length}`
			)
		}
		this.referencePoints[index] = new SVG.Point(position)
		this.update()
	}

	protected recalculateResizePoints() {
		if (this.resizableSVGs.length == this.referencePoints.length) {
			// const transformMatrix = this.getTransformMatrix()

			for (let index = 0; index < this.referencePoints.length; index++) {
				const point = this.referencePoints[index]
				const viz = this.resizableSVGs[index]

				viz.center(point.x, point.y)
			}
		}
	}

	public resizable(enable: boolean): void {
		if (this.isResizing == enable) {
			return
		}
		this.isResizing = enable
		if (enable) {
			let startPositions: SVG.Point[] = []
			for (let index = 0; index < this.referencePoints.length; index++) {
				let elementSVG = resizeSVG()
				elementSVG.node.style.cursor = "move"
				this.resizableSVGs.push(elementSVG)
				startPositions.push(new SVG.Point())

				AdjustDragHandler.snapDrag(this, elementSVG, true, {
					dragStart: (pos) => {
						startPositions[index] = new SVG.Point(this.referencePoints[index])
					},
					dragMove: (pos) => {
						this.movePointTo(index, pos)
					},
					dragEnd: () => {
						return startPositions[index].eq(this.referencePoints[index])
					},
				})
			}
		} else {
			for (const pointSVG of this.resizableSVGs) {
				AdjustDragHandler.snapDrag(this, pointSVG, false)
				pointSVG?.remove()
			}
			this.resizableSVGs = []
		}
		this.update()
	}

	public toJson(): PathSaveObject {
		let data = super.toJson() as PathSaveObject
		data.points = this.referencePoints.map((point) => point.simplifyForJson())
		return data
	}
	protected applyJson(saveObject: PathSaveObject): void {
		super.applyJson(saveObject)
		this.referencePoints = saveObject.points.map((point) => new SVG.Point(point)) ?? []
	}
	public rotate(angleDeg: number): void {
		this.referencePoints = this.referencePoints.map((point) => point.rotate(angleDeg, this.position))
		this.update()
	}
	public flip(horizontalAxis: boolean): void {}

	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (this.referencePoints.length > 0) {
			this.movePointTo(this.referencePoints.length - 1, pos)
		}
	}

	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		if (this.finishedPlacing) {
			return true
		}

		if (this.referencePoints.length == 0) {
			this.referencePoints.push(pos.clone())
			this.visualization.show()
			this.updateTheme()
		} else {
			if (this.referencePoints.at(-2).eq(pos)) {
				return true
			}
		}
		if (this.pointLimit > 0 && this.referencePoints.length >= this.pointLimit) {
			this.placeMove(pos, ev)
			this.referencePoints.push(new SVG.Point())
			return true
		}

		this.referencePoints.push(pos)
		this.placeMove(pos, ev)
		return false
	}

	public placeFinish(): void {
		if (this.finishedPlacing) {
			return
		}
		if (this.referencePoints.length == 0) {
			this.placeStep(new SVG.Point())
		}
		this.referencePoints.pop()
		if (this.referencePoints.length >= 2 && this.referencePoints.at(-1).eq(this.referencePoints.at(-2))) {
			this.referencePoints.pop()
		}
		if (this.referencePoints.length < 2) {
			// if not even 2 corner points -> no polygon, delete
			MainController.instance.removeComponent(this)
			return
		}
		this.finishedPlacing = true
		this.update()
	}

	public toTikzString(): string {
		let command: TikzPathCommand = {
			options: [],
			additionalNodes: [],
			connectors: [],
			coordinates: [],
		}
		this.buildTikzCommand(command)
		return buildTikzStringFromPathCommand(command)
	}

	protected buildTikzCommand(command: TikzPathCommand): void {
		super.buildTikzCommand(command)

		command.coordinates.push(...this.referencePoints)
	}
}
