import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	dashArrayToPattern,
	defaultStroke,
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

/**
 * one wire segement has a destination and a wire direction
 */
export type WireSegment = {
	endPoint: SVG.Point
	direction: WireDirection
}

/**
 * a wire consists of a starting position and at least one wire segment
 */
export type WireSaveObject = ComponentSaveObject & {
	start: SVG.Point
	segments: WireSegment[]
	startArrow?: string
	endArrow?: string
	stroke?: StrokeInfo
	rotationDeg?: number
	flip?: boolean
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
	private previousPlacingDirection = new SVG.Point(1, 0)

	// essentially the main visualisation
	private wire: SVG.Polyline
	// a wider copy of wire, but invisible, Meant for dragging the wire
	private draggableWire: SVG.Polyline

	// the svg elements where adjusting the wire is possible
	private adjustmentPoints: SVG.Element[] = []

	public arrowEnd: ChoiceProperty<ArrowTip>
	public arrowStart: ChoiceProperty<ArrowTip>
	private startArrowElement: SVG.Element
	private endArrowElement: SVG.Element

	public static arrowSymbols: Map<string, SVGSymbolElement>

	constructor() {
		super()
		this.cornerPoints = []
		this.wireDirections = []
		SnapCursorController.instance.visible = true
		this.displayName = "Wire"
		this.scaleState = new SVG.Point(1, 1)

		this.strokeInfo = {
			color: "default",
			opacity: 1,
			width: new SVG.Number("0.4pt"),
			style: defaultStrokeStyleChoice.key,
		}

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
			this.updateArrowTypesAndColors()
			this.update()
		})
		this.propertiesHTMLRows.push(this.arrowStart.buildHTML())

		this.arrowEnd = new ChoiceProperty("End", arrowTips, defaultArrowTip)
		this.arrowEnd.addChangeListener((ev) => {
			this.updateArrowTypesAndColors()
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
			this.updateArrowTypesAndColors()
			this.update()
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
			this.updateArrowTypesAndColors()
			this.update()
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
		if (this.arrowStart.value.key != defaultArrowTip.key) {
			this.startArrowElement = CanvasController.instance.canvas.group()
			this.startArrowElement.addTo(this.visualization)
			this.startArrowElement.stroke({ color: arrowColor, opacity: this.strokeInfo.opacity })
			this.startArrowElement.fill({ color: arrowColor, opacity: this.strokeInfo.opacity })
			const arrowPath = document.getElementById(this.arrowStart.value.key)
			for (const element of arrowPath.children) {
				this.startArrowElement.node.append(element.cloneNode(true))
			}
		}

		this.endArrowElement?.remove()
		this.endArrowElement = null
		if (this.arrowEnd.value.key != defaultArrowTip.key) {
			this.endArrowElement = CanvasController.instance.canvas.group()
			this.endArrowElement.addTo(this.visualization)
			this.endArrowElement.stroke({ color: arrowColor, opacity: this.strokeInfo.opacity })
			this.endArrowElement.fill({ color: arrowColor, opacity: this.strokeInfo.opacity })
			const arrowPath = document.getElementById(this.arrowEnd.value.key)
			for (const element of arrowPath.children) {
				this.endArrowElement.node.append(element.cloneNode(true))
			}
		}
	}

	private updateArrowTransforms(startArrowReference: SVG.Point, endArrowReference: SVG.Point) {
		const scale = this.lineWidthToArrowScale()
		const strokeWidth = this.strokeInfo.width.convertToUnit("px").value / scale

		const transformMatrix = this.getTransformMatrix()

		if (this.arrowStart.value.key != defaultArrowTip.key) {
			let wireDirection = this.cornerPoints.at(0).sub(startArrowReference)
			let rotationAngleDeg = (Math.atan2(wireDirection.y, wireDirection.x) * 180) / Math.PI

			let refXY = this.arrowStart.value.refXY ?? new SVG.Point(-1, -0.5)

			this.startArrowElement.transform(
				new SVG.Matrix({
					translate: this.cornerPoints.at(0).toArray(),
					rotate: rotationAngleDeg,
					scale: [scale, scale],
				})
					.multiply({ translate: refXY.toArray() })
					.lmultiply(transformMatrix)
			)
			this.startArrowElement.attr("stroke-width", strokeWidth * (this.arrowStart.value.strokeFactor ?? 0))
		}

		if (this.arrowEnd.value.key != defaultArrowTip.key) {
			let wireDirection = this.cornerPoints.at(-1).sub(endArrowReference)
			let rotationAngleDeg = (Math.atan2(wireDirection.y, wireDirection.x) * 180) / Math.PI

			let refXY = this.arrowEnd.value.refXY ?? new SVG.Point(-1, -0.5)

			this.endArrowElement.transform(
				new SVG.Matrix({
					translate: this.cornerPoints.at(-1).toArray(),
					rotate: rotationAngleDeg,
					scale: [scale, scale],
				})
					.multiply({ translate: refXY.toArray() })
					.lmultiply(transformMatrix)
			)
			this.endArrowElement.attr("stroke-width", strokeWidth * (this.arrowEnd.value.strokeFactor ?? 0))
		}
	}

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color
		if (strokeColor == "default") {
			strokeColor = defaultStroke
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
						pos = pos.transform(this.getTransformMatrix().inverse())
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
						const bbox = WireComponent.bboxFromPoints(this.cornerPoints)
						const delta = new SVG.Point(bbox.cx, bbox.cy)
						this.cornerPoints = this.cornerPoints.map((point) => point.sub(delta))
						this.position = this.position.add(
							delta.transform(new SVG.Matrix({ rotate: -this.rotationDeg, scaleY: this.scaleState.y }))
						)
						this.update()
						return this.cornerPoints[index].eq(startPos.sub(delta))
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
			const point = this.cornerPoints[index].transform(transformMatrix)

			viz.center(point.x, point.y)
		}
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate: -this.rotationDeg,
			origin: [0, 0],
			scale: [this.scaleState.x, this.scaleState.y],
			translate: [this.position.x, this.position.y],
		})
	}

	public moveTo(position: SVG.Point): void {
		this.position = position
		this.update()
	}
	public rotate(angleDeg: number): void {
		this.rotationDeg += angleDeg
		this.simplifyRotationAngle()
		this.update()
	}
	private scaleState: SVG.Point
	public flip(horizontal: boolean): void {
		this.scaleState.y *= -1
		this.rotationDeg = (horizontal ? 0 : 180) - this.rotationDeg
		this.simplifyRotationAngle()
		this.update()
	}

	private static bboxFromPoints(points: SVG.Point[]): SVG.Box {
		let min = new SVG.Point(Infinity, Infinity)
		let max = new SVG.Point(-Infinity, -Infinity)
		points.forEach((point) => {
			if (min.x > point.x) min.x = point.x
			if (min.y > point.y) min.y = point.y
			if (max.x < point.x) max.x = point.x
			if (max.y < point.y) max.y = point.y
		})

		return new SVG.Box(min.x, min.y, max.x - min.x, max.y - min.y)
	}

	protected update(): void {
		// generate all the points in the wire from the corner points and the wire directions
		let pointArray = this.pointsFromCornerPoints()

		let startArrowRef = pointArray.at(1).clone()
		startArrowRef =
			startArrowRef.eq(this.cornerPoints.at(0)) ? (pointArray.at(2) ?? new SVG.Point()).clone() : startArrowRef
		let endArrowRef = pointArray.at(-2).clone()
		endArrowRef =
			endArrowRef.eq(this.cornerPoints.at(-1)) ? (pointArray.at(-3) ?? new SVG.Point()).clone() : endArrowRef

		// first update the relative positions of the snapping points w.r.t. the wire, i.e. the start and end positions
		let pointsNoArrow = pointArray.map((point) => point.clone())

		// adjust end points for arrow heads
		const arrowSize = this.lineWidthToArrowScale()
		if (this.arrowStart.value.key !== defaultArrowTip.key) {
			let firstRef = pointArray[1].sub(pointArray[0])
			let firstRefLength = firstRef.abs()
			if (firstRefLength > 0) {
				pointArray[0] = pointArray[0].add(
					firstRef.div(firstRefLength).mul(arrowSize * this.arrowStart.value.setBack)
				)
			}
		}

		if (this.arrowEnd.value.key !== defaultArrowTip.key) {
			let numPoints = pointArray.length - 1
			let secondRef = pointArray[numPoints - 1].sub(pointArray[numPoints])
			let secondRefLength = secondRef.abs()
			if (secondRefLength > 0) {
				pointArray[numPoints] = pointArray[numPoints].add(
					secondRef.div(secondRefLength).mul(arrowSize * this.arrowEnd.value.setBack)
				)
			}
		}

		//update arrows. has to be done before bbox calculation, otherwise, the arrow tips are not shown in the bounding box
		this.updateArrowTransforms(startArrowRef, endArrowRef)

		// actually plot the points
		let transformMatrix = this.getTransformMatrix()
		let plotPoints = new SVG.PointArray(pointArray.map((val) => val.toArray()))
		this.wire.clear()
		this.wire.plot(plotPoints)
		this.wire.transform(transformMatrix)
		this.draggableWire.clear()
		this.draggableWire.plot(plotPoints)
		this.draggableWire.transform(transformMatrix)

		//recalculate the bounding box and position
		this._bbox = WireComponent.bboxFromPoints(this.cornerPoints).transform(transformMatrix)
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

	private pointsFromCornerPoints() {
		let pointArray: SVG.Point[] = [this.cornerPoints[0].clone()]
		for (let index = 0; index < this.wireDirections.length; index++) {
			const direction = this.wireDirections[index]

			const previousPoint = this.cornerPoints[index]
			const point = this.cornerPoints[index + 1]
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

			let bbox = WireComponent.bboxFromPoints(this.cornerPoints)
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

			this.selectionElement.size(bbox.width, bbox.height)
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
		let others: WireSegment[] = []
		for (let index = 0; index < this.wireDirections.length; index++) {
			let segment: WireSegment = {
				endPoint: this.cornerPoints[index + 1].add(this.position).simplifyForJson(),
				direction: this.wireDirections[index],
			}
			others.push(segment)
		}

		let data: WireSaveObject = {
			type: "wire",
			start: this.cornerPoints[0].add(this.position).simplifyForJson(),
			segments: others,
		}

		if (this.rotationDeg) {
			data.rotationDeg = this.rotationDeg
		}

		if (this.scaleState.y != 1) {
			data.flip = true
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
		const transformMatrix = this.getTransformMatrix()

		let outString = "\\draw" + optionsArrayStr + " "
		if ((this.rotationDeg + 180) % 90 != 0) {
			// add points between corner points
			let pointArray = this.pointsFromCornerPoints().map((point) => point.transform(transformMatrix))

			outString += pointArray[0].toTikzString()
			for (let index = 1; index < pointArray.length; index++) {
				outString += " -- " + pointArray[index].toTikzString()
			}
		} else {
			let pointArray = this.cornerPoints.map((point) => point.transform(transformMatrix))
			outString += pointArray[0].toTikzString()
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
				outString += " " + dir + " " + point.toTikzString()
			}
		}
		return outString + ";"
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		if (this.arrowStart.value != defaultArrowTip) {
			const id = this.arrowStart.value.key
			if (!defs.has(id)) {
				const marker = document.getElementById(id).cloneNode(true)
				defs.set(id, new SVG.Element(marker))
			}
		}
		if (this.arrowEnd.value != defaultArrowTip) {
			const id = this.arrowEnd.value.key
			if (!defs.has(id)) {
				const marker = document.getElementById(id).cloneNode(true)
				defs.set(id, new SVG.Element(marker))
			}
		}

		const copiedSVG = this.visualization.clone(true)
		copiedSVG.removeElement(copiedSVG.find("polyline.draggable")[0])
		return copiedSVG
	}

	public copyForPlacement(): WireComponent {
		return new WireComponent()
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
		SnapCursorController.instance.moveTo(pos)
		if (this.placingPoints.length > 1) {
			let previousPoint = this.placingPoints.at(-2)
			let relToPreviousPoint = pos.sub(previousPoint)

			this.previousPlacingDirection = this.directionVecFromPos(relToPreviousPoint, this.previousPlacingDirection)
			this.wireDirections[this.wireDirections.length - 1] = this.wireDirectionFromDirectionVec(
				this.previousPlacingDirection,
				ev
			)

			this.placingPoints[this.placingPoints.length - 1] = pos

			let bbox = WireComponent.bboxFromPoints(this.placingPoints)
			this.position = new SVG.Point(bbox.cx, bbox.cy)

			// this.size = new SVG.Point(bbox.w, bbox.h)

			this.cornerPoints = this.placingPoints.map((point) => point.sub(this.position))
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

	private placingPoints: SVG.Point[] = []
	public placeStep(pos: SVG.Point): boolean {
		if (this.finishedPlacing) {
			return true
		}
		if (this.cornerPoints.length > 0) {
			//if there already exists a wire, check if the same point was placed twice --> if so, the wire placement should end
			let previousPoint = this.placingPoints.at(-2) // there is never only one corner point in the array
			if (pos.eq(previousPoint)) {
				return true
			}
		} else {
			this.placingPoints.push(pos.clone())
			this.updateTheme()
			SnapCursorController.instance.visible = false
		}

		this.placingPoints.push(pos)

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

		SnapCursorController.instance.visible = false

		// remove the point which was currently being placed (not actually part of the wire)
		if (this.placingPoints.length == 0) {
			this.placeStep(new SVG.Point())
		}

		this.placingPoints.pop()
		this.wireDirections.pop()
		if (this.placingPoints.length >= 2 && this.placingPoints.at(-1).eq(this.placingPoints.at(-2))) {
			this.placingPoints.pop()
			this.wireDirections.pop()
		}

		if (this.placingPoints.length < 2) {
			// if not event 2 corner points --> not a wire
			MainController.instance.removeComponent(this)
			return
		}

		let bbox = WireComponent.bboxFromPoints(this.placingPoints)

		if (this.position.eq(new SVG.Point())) {
			this.position = new SVG.Point(bbox.cx, bbox.cy)
		}
		// this.size = new SVG.Point(bbox.w, bbox.h)
		this.cornerPoints = this.placingPoints.map((point) => point.sub(this.position))

		// this.snappingPoints = [
		// 	new SnapPoint(this, "START", this.cornerPoints[0].sub(this.position)),
		// 	new SnapPoint(this, "END", this.cornerPoints.at(-1).sub(this.position)),
		// ]

		this.draggable(true)
		this.updateArrowTypesAndColors()
		this.update()
		this.updateTheme()

		this.finishedPlacing = true
	}

	public static fromJson(saveObject: WireSaveObject): WireComponent {
		let wireComponent: WireComponent = new WireComponent()
		wireComponent.placingPoints.push(new SVG.Point(saveObject.start))
		if (Object.hasOwn(saveObject, "segments")) {
			for (const segment of saveObject.segments) {
				wireComponent.placingPoints.push(new SVG.Point(segment.endPoint))
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
				wireComponent.placingPoints.push(new SVG.Point(point.x, point.y))
				wireComponent.wireDirections.push(dir)
			}
		}
		wireComponent.placingPoints.push(new SVG.Point())
		wireComponent.wireDirections.push(WireDirection.Straight)
		wireComponent.placeFinish()

		wireComponent.scaleState.y = saveObject.flip ? -1 : 1
		wireComponent.rotationDeg = saveObject.rotationDeg ?? 0

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
		wireComponent.updateArrowTypesAndColors()

		wireComponent.updateTheme()
		wireComponent.update()

		return wireComponent
	}
	public updateLabelPosition(): void {
		//not needed for wires
	}
}
