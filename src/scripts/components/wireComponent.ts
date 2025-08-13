import * as SVG from "@svgdotjs/svg.js"
import {
	bboxFromPoints,
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	defaultStroke,
	MainController,
	PathComponent,
	PathSaveObject,
	PropertyCategories,
	SaveController,
	SectionHeaderProperty,
	SelectionController,
	SnappingInfo,
	SnapPoint,
	Strokable,
	StrokeInfo,
	TikzPathCommand,
} from "../internal"
import { AdjustDragHandler } from "../snapDrag/dragHandlers"
import {
	lineRectIntersection,
	pointInsideRect,
	resizeSVG,
	selectedBoxWidth,
	selectionSize,
} from "../utils/selectionHelper"

/**
 * how the wire should be drawn. horizontal then vertical, vertical then horizontal or straight
 */
export enum WireDirection {
	Straight = "--",
	HV = "-|",
	VH = "|-",
}

function oppositeDirection(direction: WireDirection): WireDirection {
	switch (direction) {
		case WireDirection.HV:
			return WireDirection.VH
		case WireDirection.VH:
			return WireDirection.HV
		default:
			return WireDirection.Straight
	}
}

/**
 * a wire has directions between points
 */
export type WireSaveObject = PathSaveObject & {
	directions: WireDirection[]
	startArrow?: string
	endArrow?: string
	stroke?: StrokeInfo
}

export type ArrowTip = ChoiceEntry & {
	tikz: string
	setBack: number
	strokeFactor?: number
	refXY?: SVG.Point
}

export const arrowTips: ArrowTip[] = [
	{ key: "none", name: "none", tikz: "", setBack: 0 },
	{ key: "stealth", name: "stealth", tikz: "stealth", setBack: 0.5 },
	{ key: "stealthR", name: "stealth reversed", tikz: "stealth reversed", setBack: 0.5 },
	{ key: "latex", name: "latex", tikz: "latex", setBack: 0.5 },
	{ key: "latexR", name: "latex reversed", tikz: "latex reversed", setBack: 0.5 },
	{ key: "to", name: "to", tikz: "to", setBack: 0.1, strokeFactor: 0.7, refXY: new SVG.Point(-1, -0.6) },
	{
		key: "toR",
		name: "to reversed",
		tikz: "to reversed",
		setBack: 0.4,
		strokeFactor: 0.7,
		refXY: new SVG.Point(-1, -0.6),
	},
	{ key: "line", name: "line", tikz: "|", setBack: 0, strokeFactor: 1, refXY: new SVG.Point(-0.5, -0.5) },
]
export const defaultArrowTip = arrowTips[0]
/**
 * The component responsible for multi segmented wires (polylines)/wires
 */
export class WireComponent extends Strokable(PathComponent) {
	private static jsonID = "wire"
	static {
		CircuitComponent.jsonSaveMap.set(WireComponent.jsonID, WireComponent)
	}

	/**
	 * the wire directions when drawing
	 */
	private wireDirections: WireDirection[]

	// useful for placing
	private previousPlacingDirection = new SVG.Point(1, 0)

	// essentially the main visualisation
	private wire: SVG.Polyline
	// a wider copy of wire, but invisible, Meant for dragging the wire
	private draggableWire: SVG.Polyline

	// the svg elements where adjusting the wire is possible
	private adjustmentPoints: SVG.Element[] = []

	public arrowEndChoice: ChoiceProperty<ArrowTip>
	public arrowStartChoice: ChoiceProperty<ArrowTip>
	private startArrowElement: SVG.Element
	private endArrowElement: SVG.Element

	public static arrowSymbols: Map<string, SVGSymbolElement>

	private onlyStraight: boolean
	private defaultArrowHead: boolean

	constructor(onlyStraight: boolean = false, defaultArrowHead: boolean = false) {
		super()
		this.onlyStraight = onlyStraight
		this.defaultArrowHead = defaultArrowHead
		this.referencePoints = []
		this.pointLimit = -1
		this.wireDirections = []
		this.displayName = "Wire"

		this.wire = CanvasController.instance.canvas.polyline()
		this.wire.fill("none")

		this.draggableWire = CanvasController.instance.canvas.polyline()
		this.draggableWire.attr({
			"fill": "none",
			"stroke": "transparent",
			"stroke-width": selectionSize,
		})

		// override default value
		this.strokeWidthProperty.value = new SVG.Number("0.4pt")
		this.strokeInfo.width = this.strokeWidthProperty.value

		this.visualization.add(this.wire)
		this.visualization.add(this.draggableWire)
		this.snappingPoints = []

		this.properties.add(PropertyCategories.options, new SectionHeaderProperty("Arrows"))
		this.arrowStartChoice = new ChoiceProperty("Start", arrowTips, defaultArrowTip)
		this.arrowStartChoice.addChangeListener((ev) => {
			this.updateArrowTypesAndColors()
			this.update()
		})
		this.properties.add(PropertyCategories.options, this.arrowStartChoice)

		this.arrowEndChoice = new ChoiceProperty(
			"End",
			arrowTips,
			this.defaultArrowHead ? arrowTips[3] : defaultArrowTip
		)
		this.arrowEndChoice.addChangeListener((ev) => {
			this.updateArrowTypesAndColors()
			this.update()
		})
		this.properties.add(PropertyCategories.options, this.arrowEndChoice)

		this.updateTheme()

		if (!WireComponent.arrowSymbols) {
			WireComponent.arrowSymbols = new Map<string, SVGSymbolElement>()
			for (const tip of arrowTips) {
				WireComponent.arrowSymbols.set(tip.key, document.getElementById(tip.key) as any)
			}
		}
	}

	private lineWidthToArrowScale(): number {
		let scale = this.strokeInfo.width.convertToUnit("pt").value * 4.5 + 2.8 // magic numbers for converting the line width to the scale value
		return scale
	}

	private updateArrowTypesAndColors() {
		let arrowColor = this.strokeInfo.color
		if (arrowColor == "default") {
			arrowColor = defaultStroke
		}

		this.startArrowElement?.remove()
		this.startArrowElement = null
		if (this.arrowStartChoice.value.key != defaultArrowTip.key) {
			this.startArrowElement = CanvasController.instance.canvas.group()
			this.startArrowElement.addTo(this.visualization)
			this.startArrowElement.stroke({ color: arrowColor, opacity: this.strokeInfo.opacity })
			this.startArrowElement.fill({ color: arrowColor, opacity: this.strokeInfo.opacity })
			const arrowPath = document.getElementById(this.arrowStartChoice.value.key)
			for (const element of arrowPath.children) {
				this.startArrowElement.node.append(element.cloneNode(true))
			}
		}

		this.endArrowElement?.remove()
		this.endArrowElement = null
		if (this.arrowEndChoice.value.key != defaultArrowTip.key) {
			this.endArrowElement = CanvasController.instance.canvas.group()
			this.endArrowElement.addTo(this.visualization)
			this.endArrowElement.stroke({ color: arrowColor, opacity: this.strokeInfo.opacity })
			this.endArrowElement.fill({ color: arrowColor, opacity: this.strokeInfo.opacity })
			const arrowPath = document.getElementById(this.arrowEndChoice.value.key)
			for (const element of arrowPath.children) {
				this.endArrowElement.node.append(element.cloneNode(true))
			}
		}
	}

	private updateArrowTransforms(startArrowReference: SVG.Point, endArrowReference: SVG.Point) {
		const scale = this.lineWidthToArrowScale()
		const strokeWidth = this.strokeInfo.width.convertToUnit("px").value / scale

		if (this.arrowStartChoice.value.key != defaultArrowTip.key) {
			let wireDirection = this.referencePoints.at(0).sub(startArrowReference)
			let rotationAngleDeg = (Math.atan2(wireDirection.y, wireDirection.x) * 180) / Math.PI

			let refXY = this.arrowStartChoice.value.refXY ?? new SVG.Point(-1, -0.5)

			this.startArrowElement.transform(
				new SVG.Matrix({
					translate: this.referencePoints.at(0).toArray(),
					rotate: rotationAngleDeg,
					scale: [scale, scale],
				}).multiply({ translate: refXY.toArray() })
			)
			this.startArrowElement.attr("stroke-width", strokeWidth * (this.arrowStartChoice.value.strokeFactor ?? 0))
		}

		if (this.arrowEndChoice.value.key != defaultArrowTip.key) {
			let wireDirection = this.referencePoints.at(-1).sub(endArrowReference)
			let rotationAngleDeg = (Math.atan2(wireDirection.y, wireDirection.x) * 180) / Math.PI

			let refXY = this.arrowEndChoice.value.refXY ?? new SVG.Point(-1, -0.5)

			this.endArrowElement.transform(
				new SVG.Matrix({
					translate: this.referencePoints.at(-1).toArray(),
					rotate: rotationAngleDeg,
					scale: [scale, scale],
				}).multiply({ translate: refXY.toArray() })
			)
			this.endArrowElement.attr("stroke-width", strokeWidth * (this.arrowEndChoice.value.strokeFactor ?? 0))
		}
	}

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color
		if (strokeColor == "default") {
			strokeColor = defaultStroke
		}

		this.updateArrowTypesAndColors()

		this.wire.stroke({
			color: strokeColor,
			opacity: this.strokeInfo.opacity,
			width: this.strokeInfo.opacity == 0 ? 0 : this.strokeInfo.width.convertToUnit("px").value,
			dasharray: this.strokeStyleProperty.value.dasharray
				.map((factor) => this.strokeInfo.width.times(factor).toString())
				.join(" "),
		})
	}

	public recalculateSnappingPoints(): void {
		super.recalculateSnappingPoints(this.getTransformMatrix())
	}

	public getSnappingInfo(): SnappingInfo {
		if (this.finishedPlacing) {
			// only snap to the snapping points
			return {
				trackedSnappingPoints: this.snappingPoints,
				additionalSnappingPoints: [],
			}
		} else {
			// only snap the cursor
			return {
				trackedSnappingPoints: [],
				additionalSnappingPoints:
					this.referencePoints.length > 0 ? [new SnapPoint(this, "center", new SVG.Point())] : [],
			}
		}
	}

	public resizable(resize: boolean): void {
		if (resize == this.isResizing) {
			return
		}
		this.isResizing = resize
		if (resize) {
			// pre calculate the direction of the wire as a vector from the wiredirection objects
			let dirs: SVG.Point[] = []
			for (let index = 0; index < this.wireDirections.length; index++) {
				let rel = this.referencePoints[index + 1].sub(this.referencePoints[index])
				dirs[index] =
					this.wireDirections[index] == WireDirection.VH ?
						new SVG.Point(0, Math.sign(rel.y))
					:	new SVG.Point(Math.sign(rel.x), 0)
			}

			// add dragging to all corner points
			for (let index = 0; index < this.referencePoints.length; index++) {
				const element = resizeSVG()
				element.node.style.cursor = "move"
				this.adjustmentPoints.push(element)

				let startPos: SVG.Point
				AdjustDragHandler.snapDrag(this, element, resize, {
					dragStart: (pos) => {
						startPos = this.referencePoints[index]
					},
					dragMove: (pos, ev) => {
						if (ev && (ev.ctrlKey || (MainController.instance.isMac && ev.metaKey))) {
							// wires from and to this point should be straight
							if (index > 0) {
								// is not first point
								this.wireDirections[index - 1] = WireDirection.Straight
							}
							if (index < this.wireDirections.length) {
								// is not last point
								this.wireDirections[index] = WireDirection.Straight
							}
						} else {
							// change the wire direction if necessary
							if (index > 0) {
								// from the last point to this point
								dirs[index - 1] = this.directionVecFromPos(
									pos.sub(this.referencePoints[index - 1]),
									dirs[index - 1]
								)
								this.wireDirections[index - 1] = this.wireDirectionFromDirectionVec(dirs[index - 1], ev)
							}
							if (index < this.adjustmentPoints.length - 1) {
								// from this point to the next point
								let rel = pos.sub(this.referencePoints[index + 1])
								dirs[index] = this.directionVecFromPos(rel, dirs[index])
								let dir = dirs[index].x != 0 ? new SVG.Point(0, rel.y) : new SVG.Point(rel.x, 0)
								this.wireDirections[index] = this.wireDirectionFromDirectionVec(dir, ev)
							}
						}
						this.referencePoints[index] = pos
						this.update()
					},
					dragEnd: () => {
						this.update()
						return !this.referencePoints[index].eq(startPos)
					},
				})
			}
			this.update()
		} else {
			for (const point of this.adjustmentPoints) {
				AdjustDragHandler.snapDrag(this, point, false)
				point.remove()
			}
			this.adjustmentPoints = []
		}
	}

	protected recalculateResizePoints() {
		const transformMatrix = this.getTransformMatrix()
		for (let index = 0; index < this.adjustmentPoints.length; index++) {
			const viz = this.adjustmentPoints[index]
			const point = this.referencePoints[index].transform(transformMatrix)

			viz.center(point.x, point.y)
		}
	}

	public rotate(angleDeg: number): void {
		if (Math.abs(angleDeg) == 45) {
			// no 45 degree rotations
			return
		}
		this.referencePoints = this.referencePoints.map((point) => point.rotate(angleDeg, this.position))
		if (Math.abs(angleDeg) == 90) {
			this.wireDirections = this.wireDirections.map(oppositeDirection)
		}
		this.update()
	}

	protected update(): void {
		//recalculate the bounding box and position
		this._bbox = bboxFromPoints(this.referencePoints)
		this.position = new SVG.Point(this._bbox.cx, this._bbox.cy)

		// generate all the points in the wire from the corner points and the wire directions
		let pointArray = this.pointsFromCornerPoints()

		let startArrowRef = pointArray.at(1).clone()
		startArrowRef =
			startArrowRef.eq(this.referencePoints.at(0)) ? (pointArray.at(2) ?? new SVG.Point()).clone() : startArrowRef
		let endArrowRef = pointArray.at(-2).clone()
		endArrowRef =
			endArrowRef.eq(this.referencePoints.at(-1)) ? (pointArray.at(-3) ?? new SVG.Point()).clone() : endArrowRef

		// first update the relative positions of the snapping points w.r.t. the wire, i.e. the start and end positions
		let pointsNoArrow = pointArray.map((point) => point.clone())

		// adjust end points for arrow heads
		const arrowSize = this.lineWidthToArrowScale()
		if (this.arrowStartChoice.value.key !== defaultArrowTip.key) {
			let firstRef = pointArray[1].sub(pointArray[0])
			let firstRefLength = firstRef.abs()
			if (firstRefLength > 0) {
				pointArray[0] = pointArray[0].add(
					firstRef.div(firstRefLength).mul(arrowSize * this.arrowStartChoice.value.setBack)
				)
			}
		}

		if (this.arrowEndChoice.value.key !== defaultArrowTip.key) {
			let numPoints = pointArray.length - 1
			let secondRef = pointArray[numPoints - 1].sub(pointArray[numPoints])
			let secondRefLength = secondRef.abs()
			if (secondRefLength > 0) {
				pointArray[numPoints] = pointArray[numPoints].add(
					secondRef.div(secondRefLength).mul(arrowSize * this.arrowEndChoice.value.setBack)
				)
			}
		}

		//update arrows. has to be done before bbox calculation, otherwise, the arrow tips are not shown in the bounding box
		this.updateArrowTransforms(startArrowRef, endArrowRef)

		// actually plot the points
		let plotPoints = new SVG.PointArray(pointArray.map((val) => val.toArray()))
		this.wire.clear()
		this.wire.plot(plotPoints)
		this.draggableWire.clear()
		this.draggableWire.plot(plotPoints)

		//recalculate the snapping point offsets
		if (this.snappingPoints.length == pointsNoArrow.length) {
			//update the existing snap points
			for (let index = 0; index < this.snappingPoints.length; index++) {
				const snapPoint = this.snappingPoints[index]
				const point = pointsNoArrow[index]
				snapPoint.updateRelPosition(point)
			}
		} else {
			// a point was added -> redo snap points
			this.snappingPoints = pointsNoArrow.map(
				(point, idx) =>
					new SnapPoint(
						this,
						idx == 0 ? "START"
						: idx == pointsNoArrow.length - 1 ? "END"
						: "",
						point
					)
			)
		}

		// update visuals
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
	}

	private pointsFromCornerPoints() {
		let pointArray: SVG.Point[] = [this.referencePoints[0].clone()]
		for (let index = 0; index < this.wireDirections.length; index++) {
			const direction = this.wireDirections[index]

			const previousPoint = this.referencePoints[index]
			const point = this.referencePoints[index + 1]
			if (direction == WireDirection.HV && previousPoint.x != point.x && previousPoint.y != point.y) {
				pointArray.push(new SVG.Point(point.x, previousPoint.y))
			} else if (direction == WireDirection.VH && previousPoint.x != point.x && previousPoint.y != point.y) {
				pointArray.push(new SVG.Point(previousPoint.x, point.y))
			}
			pointArray.push(point.clone())
		}
		return pointArray
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			const transformMatrix = this.getTransformMatrix()
			const transformMatrixInv = transformMatrix.inverse()

			let bbox = this.bbox
			const strokeWidth = this.strokeInfo.width.convertToUnit("px").value
			bbox = new SVG.Box(
				bbox.x - strokeWidth / 2,
				bbox.y - strokeWidth / 2,
				bbox.w + strokeWidth,
				bbox.h + strokeWidth
			)

			if (this.startArrowElement) {
				const currentTransform = new SVG.Matrix(this.startArrowElement.transform())
				const arrowTransform = currentTransform.lmultiply(transformMatrixInv)
				const startBBox = this.startArrowElement.bbox().transform(arrowTransform)
				bbox = bbox.merge(startBBox)
			}

			if (this.endArrowElement) {
				const currentTransform = new SVG.Matrix(this.endArrowElement.transform())
				const arrowTransform = currentTransform.lmultiply(transformMatrixInv)
				const endBBox = this.endArrowElement.bbox().transform(arrowTransform)
				bbox = bbox.merge(endBBox)
			}

			this.selectionElement.size(bbox.width + selectedBoxWidth, bbox.height + selectedBoxWidth)
			this.selectionElement.center(bbox.cx, bbox.cy)
			this.selectionElement.transform(transformMatrix)
		}
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		//essentially check each wire segment via a wire rect intersection
		const transformMatrix = this.getTransformMatrix()
		let pointsArray = this.pointsFromCornerPoints().map((point) => point.transform(transformMatrix))

		for (let idx = 0; idx < pointsArray.length - 1; idx++) {
			const p1 = pointsArray[idx]
			const p2 = pointsArray[idx + 1]

			if (pointInsideRect(p1, selectionRectangle)) {
				return true
			}

			if (
				lineRectIntersection(
					[
						[p1.x, p1.y],
						[p2.x, p2.y],
					],
					selectionRectangle
				)
			) {
				return true
			}
		}

		return false
	}

	public viewSelected(show: boolean): void {
		super.viewSelected(show)
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
	}

	public toJson(): WireSaveObject {
		let data = super.toJson() as WireSaveObject
		data.type = WireComponent.jsonID
		data.directions = this.wireDirections

		if (this.arrowStartChoice.value.key !== defaultArrowTip.key) {
			data.startArrow = this.arrowStartChoice.value.key
		}

		if (this.arrowEndChoice.value.key !== defaultArrowTip.key) {
			data.endArrow = this.arrowEndChoice.value.key
		}

		return data
	}

	public static fromJson(saveObject: WireSaveObject): WireComponent {
		if (SaveController.instance.currentlyLoadedSaveVersion == "") {
			//@ts-ignore
			let points: SVG.Point[] = [saveObject.start]
			let directions: WireDirection[] = []
			//@ts-ignore
			for (const segment of saveObject.segments) {
				points.push(segment.endPoint)
				directions.push(segment.direction)
			}

			saveObject.points = points
			saveObject.directions = directions
		}
		return new WireComponent()
	}

	protected buildTikzCommand(command: TikzPathCommand): void {
		super.buildTikzCommand(command)

		let arrowOptions: string[] = []
		if (this.arrowStartChoice.value.key !== defaultArrowTip.key) {
			arrowOptions.push(this.arrowStartChoice.value.tikz)
			arrowOptions.push("-")
		}
		if (this.arrowEndChoice.value.key !== defaultArrowTip.key) {
			if (arrowOptions.length == 0) {
				arrowOptions.push("-")
			}
			arrowOptions.push(this.arrowEndChoice.value.tikz)
		}
		if (arrowOptions.length > 0) {
			command.options.push(arrowOptions.join(""))
		}

		let pointArray = this.referencePoints.map((point) => point)
		for (let index = 0; index < this.wireDirections.length; index++) {
			const previousPoint = pointArray[index]
			const point = pointArray[index + 1]
			let dir = this.wireDirections[index]
			if (dir == WireDirection.HV && previousPoint.y == point.y) {
				dir = WireDirection.Straight
			}
			if (dir == WireDirection.VH && previousPoint.x == point.x) {
				dir = WireDirection.Straight
			}
			if (!dir) {
				dir = WireDirection.Straight
			}
			command.connectors.push(dir)
		}
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		if (this.arrowStartChoice.value != defaultArrowTip) {
			const id = this.arrowStartChoice.value.key
			if (!defs.has(id)) {
				const marker = document.getElementById(id).cloneNode(true)
				defs.set(id, new SVG.Element(marker))
			}
		}
		if (this.arrowEndChoice.value != defaultArrowTip) {
			const id = this.arrowEndChoice.value.key
			if (!defs.has(id)) {
				const marker = document.getElementById(id).cloneNode(true)
				defs.set(id, new SVG.Element(marker))
			}
		}

		const copiedSVG = this.visualization.clone(true)
		let draggableWire = copiedSVG.find('polyline[fill="none"][stroke="transparent"]')[0]
		if (draggableWire) {
			copiedSVG.removeElement(draggableWire)
		}
		return copiedSVG
	}

	public copyForPlacement(): WireComponent {
		return new WireComponent(this.onlyStraight, this.defaultArrowHead)
	}

	public remove(): void {
		this.visualization.remove()
		this.viewSelected(false)
		this.selectionElement?.remove()
		if (this.finishedPlacing) {
			this.draggable(false)
		}
	}

	public placeMove(pos: SVG.Point, ev?: MouseEvent): void {
		//only move the last corner point in the array
		if (this.referencePoints.length > 1) {
			let previousPoint = this.referencePoints.at(-2)
			let relToPreviousPoint = pos.sub(previousPoint)

			this.previousPlacingDirection = this.directionVecFromPos(relToPreviousPoint, this.previousPlacingDirection)
			this.wireDirections[this.wireDirections.length - 1] = this.wireDirectionFromDirectionVec(
				this.previousPlacingDirection,
				ev
			)

			this.referencePoints[this.referencePoints.length - 1] = pos
			this.update()
		}
	}

	/**
	 * This essentially adjusts the wire direction if necessary. If the cursor crosses the axis perpendicular to the previous initial direction of the wire segment, this axis should now be the initial direction of the wire segment
	 * @param relPos the current position relative to the position of the previous point
	 * @param lastDirection in which direction the wire was previously starting
	 * @returns the adjusted direction
	 */
	private directionVecFromPos(relPos: SVG.Point, lastDirection: SVG.Point): SVG.Point {
		var dir = lastDirection.clone()
		if (relPos.y != 0 && relPos.x * lastDirection.x < 0) {
			dir.x = 0
			dir.y = Math.sign(relPos.y)
		} else if (relPos.x != 0 && relPos.y * lastDirection.y < 0) {
			dir.x = Math.sign(relPos.x)
			dir.y = 0
		}
		return dir
	}

	private wireDirectionFromDirectionVec(directionVec: SVG.Point, ev?: MouseEvent | TouchEvent): WireDirection {
		if (this.onlyStraight || (ev && (ev.ctrlKey || (MainController.instance.isMac && ev.metaKey)))) {
			return WireDirection.Straight
		} else if (directionVec.x != 0) {
			return WireDirection.HV
		} else if (directionVec.y != 0) {
			return WireDirection.VH
		}
	}

	public placeStep(pos: SVG.Point): boolean {
		if (this.finishedPlacing) {
			return true
		}
		if (this.referencePoints.length > 0) {
			//if there already exists a wire, check if the same point was placed twice --> if so, the wire placement should end
			let previousPoint = this.referencePoints.at(-2) // there is never only one corner point in the array
			if (pos.eq(previousPoint)) {
				return true
			}
		} else {
			this.referencePoints.push(pos.clone())
			this.updateTheme()
		}

		this.referencePoints.push(pos)

		this.wireDirections.push(WireDirection.HV)
		this.previousPlacingDirection.x = 1
		this.previousPlacingDirection.y = 0

		this.placeMove(pos)

		return false
	}

	public placeFinish(): void {
		if (this.finishedPlacing) {
			//was already called
			return
		}

		if (this.referencePoints.length == 0) {
			this.placeStep(new SVG.Point())
		}

		// remove the point which was currently being placed (not actually part of the wire)
		this.referencePoints.pop()
		this.wireDirections.pop()
		if (this.referencePoints.length >= 2 && this.referencePoints.at(-1).eq(this.referencePoints.at(-2))) {
			// the last two points where equal -> remove one more
			this.referencePoints.pop()
			this.wireDirections.pop()
		}

		if (this.referencePoints.length < 2) {
			// if not event 2 corner points --> not a wire
			MainController.instance.removeComponent(this)
			return
		}

		this.updateTheme()
		this.update()

		this.finishedPlacing = true
	}

	public applyJson(saveObject: WireSaveObject): void {
		super.applyJson(saveObject)
		this.wireDirections = saveObject.directions ?? []
		while (this.wireDirections.length < this.referencePoints.length - 1) {
			this.wireDirections.push(WireDirection.Straight)
		}

		if (saveObject.startArrow) {
			this.arrowStartChoice.value = arrowTips.find((item) => item.key == saveObject.startArrow)
		}

		if (saveObject.endArrow) {
			this.arrowEndChoice.value = arrowTips.find((item) => item.key == saveObject.endArrow)
		}

		this.updateTheme()
		this.update()

		this.finishedPlacing = true
	}
}
