import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	dashArrayToPattern,
	defaultStrokeStyleChoice,
	MainController,
	SectionHeaderProperty,
	SelectionController,
	SliderProperty,
	SnapCursorController,
	SnappingInfo,
	SnapPoint,
	StrokeInfo,
	StrokeStyle,
	strokeStyleChoices,
} from "../internal"
import { AdjustDragHandler, SnapDragHandler } from "../snapDrag/dragHandlers"
import {
	lineRectIntersection,
	pointInsideRect,
	referenceColor,
	resizeSVG,
	selectedBoxWidth,
	selectionColor,
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

/**
 * one wire segement has a destination and a wire direction
 */
export type WireSegment = {
	position: { x: number; y: number }
	direction: WireDirection
}

/**
 * a wire consists of a starting position and at least one wire segment
 */
export type WireSaveObject = ComponentSaveObject & {
	start: { x: number; y: number }
	segments: WireSegment[]
	startArrow?: string
	endArrow?: string
	stroke?: StrokeInfo
}

export type ArrowTip = ChoiceEntry & {
	tikz: string
	setBack: number
}

export const arrowTips: ArrowTip[] = [
	{ key: "none", name: "none", tikz: "", setBack: 0 },
	{ key: "stealth", name: "stealth", tikz: "stealth", setBack: 7 },
	{ key: "stealthR", name: "stealth reversed", tikz: "stealth reversed", setBack: 3 },
	{ key: "latex", name: "latex", tikz: "latex", setBack: 10 },
	{ key: "latexR", name: "latex reversed", tikz: "latex reversed", setBack: 0 },
	{ key: "to", name: "to", tikz: "to", setBack: 1 },
	{ key: "toR", name: "to reversed", tikz: "to reversed", setBack: 4 },
	{ key: "line", name: "line", tikz: "|", setBack: 0 },
]
export const defaultArrowTip = arrowTips[0]
/**
 * The component responsible for multi segmented wires (polylines)/wires
 */
export class WireComponent extends CircuitComponent {
	protected strokeInfo: StrokeInfo
	protected strokeColorProperty: ColorProperty
	protected strokeOpacityProperty: SliderProperty
	protected strokeWidthProperty: SliderProperty
	protected strokeStyleProperty: ChoiceProperty<StrokeStyle>

	/**
	 * the corner points when drawing
	 */
	private cornerPoints: SVG.Point[]
	/**
	 * the wire directions when drawing
	 */
	private wireDirections: WireDirection[]
	// useful for placing
	private lastPlacingDirection = new SVG.Point(1, 0)

	// essentially the main visualisation
	private wire: SVG.Polyline
	// a wider copy of wire, but invisible, Meant for dragging the wire
	private draggableWire: SVG.Polyline

	// the svg elements where adjusting the wire is possible
	private adjustmentPoints: SVG.Element[] = []

	private arrowEnd: ChoiceProperty<ArrowTip>
	private arrowStart: ChoiceProperty<ArrowTip>

	constructor() {
		super()
		this.cornerPoints = []
		this.wireDirections = []
		SnapCursorController.instance.visible = true
		this.displayName = "Wire"

		this.strokeInfo = {
			color: "default",
			opacity: 1,
			width: new SVG.Number("0.4pt"),
			style: defaultStrokeStyleChoice.key,
		}

		this.visualization = CanvasController.instance.canvas.group()
		this.wire = CanvasController.instance.canvas.polyline()
		this.wire.fill("none")
		this.draggableWire = CanvasController.instance.canvas.polyline()
		this.draggableWire.attr({
			fill: "none",
			stroke: "transparent",
			"stroke-width": selectionSize,
		})

		this.visualization.add(this.wire)
		this.visualization.add(this.draggableWire)
		this.snappingPoints = []

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Arrows").buildHTML())
		this.arrowStart = new ChoiceProperty("Start", arrowTips, defaultArrowTip)
		this.arrowStart.addChangeListener((ev) => {
			this.updateArrows()
			this.update()
		})
		this.propertiesHTMLRows.push(this.arrowStart.buildHTML())

		this.arrowEnd = new ChoiceProperty("End", arrowTips, defaultArrowTip)
		this.arrowEnd.addChangeListener((ev) => {
			this.updateArrows()
			this.update()
		})
		this.propertiesHTMLRows.push(this.arrowEnd.buildHTML())

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Stroke").buildHTML())
		this.strokeOpacityProperty = new SliderProperty(
			"Opacity",
			0,
			100,
			1,
			new SVG.Number(this.strokeInfo.opacity * 100, "%")
		)
		this.strokeOpacityProperty.addChangeListener((ev) => {
			this.strokeInfo.opacity = ev.value.value / 100
			this.updateTheme()
		})

		this.strokeColorProperty = new ColorProperty("Color", null)
		this.strokeColorProperty.addChangeListener((ev) => {
			if (ev.value == null) {
				this.strokeInfo.color = "default"
				this.strokeInfo.opacity = 1
			} else {
				this.strokeInfo.color = ev.value.toRgb()
				this.strokeInfo.opacity = this.strokeOpacityProperty.value.value / 100
			}
			this.updateTheme()
		})
		this.strokeWidthProperty = new SliderProperty("Width", 0, 10, 0.1, this.strokeInfo.width)
		this.strokeWidthProperty.addChangeListener((ev) => {
			this.strokeInfo.width = ev.value
			this.update()
			this.updateTheme()
		})
		this.strokeStyleProperty = new ChoiceProperty<StrokeStyle>(
			"Style",
			strokeStyleChoices,
			defaultStrokeStyleChoice
		)
		this.strokeStyleProperty.addChangeListener((ev) => {
			this.strokeInfo.style = ev.value.key
			this.updateTheme()
		})
		this.propertiesHTMLRows.push(this.strokeColorProperty.buildHTML())
		this.propertiesHTMLRows.push(this.strokeOpacityProperty.buildHTML())
		this.propertiesHTMLRows.push(this.strokeWidthProperty.buildHTML())
		this.propertiesHTMLRows.push(this.strokeStyleProperty.buildHTML())

		this.updateTheme()
	}

	private updateArrows() {
		//TODO don't use markers since they don't scale with the line width like in tikz
		if (this.arrowStart.value.key == defaultArrowTip.key) {
			this.wire.node.style.markerStart = ""
		} else {
			this.wire.node.style.markerStart = `url(#${this.arrowStart.value.key})`
		}

		if (this.arrowEnd.value.key == defaultArrowTip.key) {
			this.wire.node.style.markerEnd = ""
		} else {
			this.wire.node.style.markerEnd = `url(#${this.arrowEnd.value.key})`
		}
	}

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color
		if (strokeColor == "default") {
			strokeColor = "var(--bs-emphasis-color)"
		}

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
					this.cornerPoints.length > 0 ? [new SnapPoint(this, "center", new SVG.Point())] : [],
			}
		}
	}
	public draggable(drag: boolean): void {
		if (drag) {
			this.draggableWire.node.classList.add("draggable")
		} else {
			this.draggableWire.node.classList.remove("draggable")
		}
		// actually enable/disable dragging for the wire itself. This should be done with the draggable wire
		SnapDragHandler.snapDrag(this, drag, this.draggableWire)
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
				let rel = this.cornerPoints[index + 1].sub(this.cornerPoints[index])
				dirs[index] =
					this.wireDirections[index] == WireDirection.VH ?
						new SVG.Point(0, Math.sign(rel.y))
					:	new SVG.Point(Math.sign(rel.x), 0)
			}

			// add dragging to all corner points
			for (let index = 0; index < this.cornerPoints.length; index++) {
				const element = resizeSVG()
				element.node.style.cursor = "move"
				this.adjustmentPoints.push(element)

				let startPos: SVG.Point
				AdjustDragHandler.snapDrag(this, element, resize, {
					dragStart: (pos) => {
						startPos = this.cornerPoints[index]
					},
					dragMove: (pos, ev) => {
						if (ev && (ev.ctrlKey || (MainController.instance.isMac && ev.metaKey))) {
							// wires from and to this point should be straight
							if (index > 0) {
								this.wireDirections[index - 1] = WireDirection.Straight
							}
							if (index < this.wireDirections.length) {
								this.wireDirections[index] = WireDirection.Straight
							}
						} else {
							// change the wire direction if necessary
							if (index > 0) {
								// from the last point to this point
								dirs[index - 1] = this.directionVecFromPos(
									pos.sub(this.cornerPoints[index - 1]),
									dirs[index - 1]
								)
								this.wireDirections[index - 1] = this.wireDirectionFromDirectionVec(dirs[index - 1], ev)
							}
							if (index < this.adjustmentPoints.length - 1) {
								// from this point to the next point
								let rel = pos.sub(this.cornerPoints[index + 1])
								dirs[index] = this.directionVecFromPos(rel, dirs[index])
								let dir = dirs[index].x != 0 ? new SVG.Point(0, rel.y) : new SVG.Point(rel.x, 0)
								this.wireDirections[index] = this.wireDirectionFromDirectionVec(dir, ev)
							}
						}
						this.cornerPoints[index].x = pos.x
						this.cornerPoints[index].y = pos.y
						this.update()
					},
					dragEnd: () => {
						return this.cornerPoints[index].eq(startPos)
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
		let halfsize = new SVG.Point(this.bbox.w / 2, this.bbox.h / 2)
		for (let index = 0; index < this.adjustmentPoints.length; index++) {
			const viz = this.adjustmentPoints[index]
			const point = this.cornerPoints[index]

			viz.center(point.x, point.y)
		}
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix()
	}

	public moveTo(position: SVG.Point): void {
		for (let index = 0; index < this.cornerPoints.length; index++) {
			this.cornerPoints[index] = this.cornerPoints[index].sub(this.position).add(position)
		}
		this.update()
	}
	public rotate(angleDeg: number): void {
		// rotate all points around the component reference position
		this.cornerPoints = this.cornerPoints.map((point) => point.rotate(angleDeg, this.position))
		// adjust all wire directions (flip HV and VH)
		this.wireDirections = this.wireDirections.map((dir) => {
			if (dir == WireDirection.HV) {
				return WireDirection.VH
			} else if (dir == WireDirection.VH) {
				return WireDirection.HV
			} else {
				return WireDirection.Straight
			}
		})
		this.update()
	}
	public flip(horizontal: boolean): void {
		if (horizontal) {
			this.cornerPoints = this.cornerPoints.map((point) => {
				return new SVG.Point(point.x, 2 * this.position.y - point.y)
			})
		} else {
			this.cornerPoints = this.cornerPoints.map((point) => {
				return new SVG.Point(2 * this.position.x - point.x, point.y)
			})
		}
		this.update()
	}
	protected update(): void {
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value
		// generate all the points in the wire from the corner points and the wire directions
		let pointArray: SVG.Point[] = [this.cornerPoints[0]]
		for (let index = 0; index < this.wireDirections.length; index++) {
			const direction = this.wireDirections[index]

			const lastPoint = this.cornerPoints[index]
			const point = this.cornerPoints[index + 1]
			if (direction == WireDirection.HV && lastPoint.x != point.x && lastPoint.y != point.y) {
				pointArray.push(new SVG.Point(point.x, lastPoint.y))
			} else if (direction == WireDirection.VH && lastPoint.x != point.x && lastPoint.y != point.y) {
				pointArray.push(new SVG.Point(lastPoint.x, point.y))
			}
			pointArray.push(point)
		}

		// first update the relative positions of the snapping points w.r.t. the wire, i.e. the start and end positions
		let pointsNoArrow = pointArray.map((point) => point.clone())

		// adjust end points for arrow heads
		if (this.arrowStart.value.key !== defaultArrowTip.key) {
			let firstRef = pointArray[1].sub(pointArray[0])
			let firstRefLength = firstRef.abs()
			if (firstRefLength > 0) {
				pointArray[0] = pointArray[0].add(
					firstRef.div(firstRefLength).mul(strokeWidth * this.arrowStart.value.setBack)
				)
			}
		}

		if (this.arrowEnd.value.key !== defaultArrowTip.key) {
			let numPoints = pointArray.length - 1
			let secondRef = pointArray[numPoints - 1].sub(pointArray[numPoints])
			let secondRefLength = secondRef.abs()
			if (secondRefLength > 0) {
				pointArray[numPoints] = pointArray[numPoints].add(
					secondRef.div(secondRefLength).mul(strokeWidth * this.arrowEnd.value.setBack)
				)
			}
		}

		// actually plot the points
		this.wire.clear()
		let plotPoints = new SVG.PointArray(pointArray.map((val) => val.toArray()))
		this.wire.plot(plotPoints)
		this.draggableWire.clear()
		this.draggableWire.plot(plotPoints)

		//recalculate the bounding box and position
		let min = new SVG.Point(Infinity, Infinity)
		let max = new SVG.Point(-Infinity, -Infinity)
		this.cornerPoints.forEach((point) => {
			if (min.x > point.x) min.x = point.x
			if (min.y > point.y) min.y = point.y
			if (max.x < point.x) max.x = point.x
			if (max.y < point.y) max.y = point.y
		})
		this._bbox = new SVG.Box(
			min.x - strokeWidth / 2,
			min.y - strokeWidth / 2,
			max.x - min.x + strokeWidth,
			max.y - min.y + strokeWidth
		)
		this.position = new SVG.Point(this._bbox.cx, this._bbox.cy)
		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x, this._bbox.y))

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
	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			this.selectionElement.size(this.bbox.w, this.bbox.h)
			this.selectionElement.center(this.position.x, this.position.y)
		}
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		//essentially check each wire segment if via a wire rect intersection
		let pointsArray = this.wire.array()
		let allPointsInside = pointInsideRect(new SVG.Point(pointsArray[0]), selectionRectangle)
		for (let idx = 0; idx < pointsArray.length - 1; idx++) {
			let p2 = pointsArray[idx + 1]
			let wireSegment = [pointsArray[idx], p2]

			if (allPointsInside) {
				allPointsInside = pointInsideRect(new SVG.Point(p2), selectionRectangle)
			}

			if (lineRectIntersection(wireSegment, selectionRectangle)) {
				return true
			}
		}

		return allPointsInside
	}

	public viewSelected(show: boolean): void {
		if (show) {
			if (!this.selectionElement) {
				this.selectionElement = CanvasController.instance.canvas.rect()
				this.selectionElement.stroke({
					width: selectedBoxWidth.convertToUnit("px").value,
					dasharray: "3,3",
				})
				this.selectionElement.fill("none")
			}
			this.selectionElement.attr({
				stroke: this.isSelectionReference ? referenceColor : selectionColor,
			})
			this.recalculateSelectionVisuals()
		} else {
			this.selectionElement?.remove()
			this.selectionElement = null
		}
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
	}

	public toJson(): WireSaveObject {
		let others: WireSegment[] = []
		for (let index = 0; index < this.wireDirections.length; index++) {
			let segment: WireSegment = {
				position: this.cornerPoints[index + 1].simplifyForJson(),
				direction: this.wireDirections[index],
			}
			others.push(segment)
		}

		let data: WireSaveObject = {
			type: "wire",
			start: this.cornerPoints[0].simplifyForJson(),
			segments: others,
		}

		let stroke: StrokeInfo = {}
		let shouldStroke = false
		if (this.strokeInfo.color != "default") {
			stroke.color = this.strokeInfo.color
			shouldStroke = true
		}
		if (this.strokeInfo.opacity != 1) {
			stroke.opacity = this.strokeInfo.opacity
			shouldStroke = true
		}

		if (!this.strokeInfo.width.eq(new SVG.Number("0.4pt"))) {
			stroke.width = this.strokeInfo.width
			shouldStroke = true
		}
		if (this.strokeInfo.style != defaultStrokeStyleChoice.key) {
			stroke.style = this.strokeInfo.style
			shouldStroke = true
		}
		if (shouldStroke) {
			data.stroke = stroke
		}

		if (this.arrowStart.value.key !== defaultArrowTip.key) {
			data.startArrow = this.arrowStart.value.key
		}

		if (this.arrowEnd.value.key !== defaultArrowTip.key) {
			data.endArrow = this.arrowEnd.value.key
		}

		return data
	}

	public toTikzString(): string {
		let drawOptions: string[] = []
		if (this.arrowStart.value.key !== defaultArrowTip.key) {
			drawOptions.push(this.arrowStart.value.tikz)
			drawOptions.push("-")
		}
		if (this.arrowEnd.value.key !== defaultArrowTip.key) {
			if (drawOptions.length == 0) {
				drawOptions.push("-")
			}
			drawOptions.push(this.arrowEnd.value.tikz)
		}

		let optionsArray: string[] = drawOptions.length > 0 ? [drawOptions.join("")] : []

		if (this.strokeInfo.opacity > 0) {
			if (this.strokeInfo.color !== "default") {
				let c = new SVG.Color(this.strokeInfo.color)
				optionsArray.push("draw=" + c.toTikzString())
			} else {
				optionsArray.push("draw")
			}

			if (this.strokeInfo.opacity != 1) {
				optionsArray.push("draw opacity=" + this.strokeInfo.opacity.toString())
			}

			let width = this.strokeInfo.width.convertToUnit("pt").value
			if (width != 0.4) {
				optionsArray.push("line width=" + width + "pt")
			}
			if (this.strokeInfo.style && this.strokeInfo.style != defaultStrokeStyleChoice.key) {
				optionsArray.push(
					dashArrayToPattern(
						this.strokeInfo.width,
						strokeStyleChoices.find((item) => item.key == this.strokeInfo.style).dasharray
					)
				)
			}
		}
		let optionsArrayStr = optionsArray.length > 0 ? "[" + optionsArray.join(", ") + "]" : ""
		let outString = "\\draw" + optionsArrayStr + " " + this.cornerPoints[0].toTikzString()
		for (let index = 0; index < this.wireDirections.length; index++) {
			const lastPoint = this.cornerPoints[index]
			const point = this.cornerPoints[index + 1]
			let dir = this.wireDirections[index]
			if (dir == WireDirection.HV && lastPoint.y == point.y) {
				dir = WireDirection.Straight
			}
			if (dir == WireDirection.VH && lastPoint.x == point.x) {
				dir = WireDirection.Straight
			}
			outString += " " + dir + " " + point.toTikzString()
		}
		return outString + ";"
	}

	public copyForPlacement(): WireComponent {
		return new WireComponent()
	}

	public remove(): void {
		this.visualization.remove()
		this.viewSelected(false)
		if (this.finishedPlacing) {
			this.draggable(false)
		}
	}

	public placeMove(pos: SVG.Point, ev?: MouseEvent): void {
		//only move the last corner point in the array
		SnapCursorController.instance.moveTo(pos)
		if (this.cornerPoints.length > 1) {
			let lastPoint = this.cornerPoints.at(-2)
			let relToLastPoint = pos.sub(lastPoint)

			this.lastPlacingDirection = this.directionVecFromPos(relToLastPoint, this.lastPlacingDirection)
			this.wireDirections[this.wireDirections.length - 1] = this.wireDirectionFromDirectionVec(
				this.lastPlacingDirection,
				ev
			)

			this.cornerPoints[this.cornerPoints.length - 1] = pos
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
		if (ev && (ev.ctrlKey || (MainController.instance.isMac && ev.metaKey))) {
			return WireDirection.Straight
		} else if (directionVec.x != 0) {
			return WireDirection.HV
		} else if (directionVec.y != 0) {
			return WireDirection.VH
		}
	}

	public placeStep(pos: SVG.Point): boolean {
		SnapCursorController.instance.visible = false
		if (this.cornerPoints.length > 0) {
			//if there already exists a wire, check if the same point was placed twice --> if so, the wire placement should end
			let lastPoint = this.cornerPoints.at(-2) // there is never only one corner point in the array
			if (pos.x == lastPoint.x && pos.y == lastPoint.y) {
				return true
			}
		} else {
			this.cornerPoints.push(pos.clone())
		}

		this.cornerPoints.push(pos)

		this.wireDirections.push(WireDirection.HV)
		this.lastPlacingDirection.x = 1
		this.lastPlacingDirection.y = 0

		this.placeMove(pos)

		return false
	}

	public placeFinish(): void {
		if (this.finishedPlacing) {
			//was already called
			return
		}

		SnapCursorController.instance.visible = false

		// remove the point which was currently being placed (not actually part of the wire)
		this.cornerPoints.pop()
		this.wireDirections.pop()

		if (this.cornerPoints.length < 2) {
			// if not event 2 corner points --> not a wire
			MainController.instance.removeComponent(this)
			return
		}

		this.snappingPoints = [
			new SnapPoint(this, "START", this.cornerPoints[0].sub(this.position)),
			new SnapPoint(this, "END", this.cornerPoints.at(-1).sub(this.position)),
		]

		this.draggable(true)
		this.updateArrows()
		this.update()

		this.finishedPlacing = true
	}

	public static fromJson(saveObject: WireSaveObject): WireComponent {
		let wireComponent: WireComponent = new WireComponent()
		wireComponent.cornerPoints.push(new SVG.Point(saveObject.start))
		if (Object.hasOwn(saveObject, "segments")) {
			for (const segment of saveObject.segments) {
				wireComponent.cornerPoints.push(new SVG.Point(segment.position))
				wireComponent.wireDirections.push(segment.direction)
			}
		} else {
			// @ts-ignore: backwards compatibility
			for (const point of saveObject.others) {
				let dir =
					point.dir == 0 ? WireDirection.Straight
					: point.dir == 1 ? WireDirection.HV
					: WireDirection.VH
				// @ts-ignore: backwards compatibility
				wireComponent.cornerPoints.push(new SVG.Point(point.x, point.y))
				wireComponent.wireDirections.push(dir)
			}
		}
		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				wireComponent.strokeInfo.color = saveObject.stroke.color
				wireComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
				wireComponent.strokeColorProperty.updateHTML()
			}
			if (saveObject.stroke.opacity != undefined) {
				wireComponent.strokeInfo.opacity = saveObject.stroke.opacity
				wireComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
				wireComponent.strokeOpacityProperty.updateHTML()
			}
			if (saveObject.stroke.width) {
				wireComponent.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				wireComponent.strokeWidthProperty.value = wireComponent.strokeInfo.width
				wireComponent.strokeWidthProperty.updateHTML()
			}
			if (saveObject.stroke.style) {
				wireComponent.strokeInfo.style = saveObject.stroke.style
				wireComponent.strokeStyleProperty.value = strokeStyleChoices.find(
					(item) => item.key == saveObject.stroke.style
				)
				wireComponent.strokeStyleProperty.updateHTML()
			}
		}
		if (saveObject.startArrow) {
			wireComponent.arrowStart.value = arrowTips.find((item) => item.key == saveObject.startArrow)
			wireComponent.arrowStart.updateHTML()
		}

		if (saveObject.endArrow) {
			wireComponent.arrowEnd.value = arrowTips.find((item) => item.key == saveObject.endArrow)
			wireComponent.arrowEnd.updateHTML()
		}
		wireComponent.cornerPoints.push(new SVG.Point())
		wireComponent.wireDirections.push(WireDirection.Straight)
		wireComponent.placeFinish()

		return wireComponent
	}
	public updateLabelPosition(): void {
		//not needed for wires
	}
}
