import * as SVG from "@svgdotjs/svg.js"
import {
	AdjustDragHandler,
	basicDirections,
	CanvasController,
	CircuitComponent,
	dashArrayToPattern,
	defaultBasicDirection,
	defaultStrokeStyleChoice,
	DirectionInfo,
	ExportController,
	FillInfo,
	getClosestPointerFromDirection,
	MainController,
	PositionedLabel,
	ShapeComponent,
	ShapeSaveObject,
	SnapCursorController,
	SnapPoint,
	StrokeInfo,
	strokeStyleChoices,
} from "../internal"
import { lineRectIntersection, resizeSVG, roundTikz, selectedBoxWidth } from "../utils/selectionHelper"

export type PolygonSaveObject = ShapeSaveObject & {
	// points relative to the origin in non transformed space
	points: SVG.Point[]
	scale?: SVG.Point
}

export class PolygonComponent extends ShapeComponent {
	protected declare shapeVisualization: SVG.Polygon
	protected declare dragElement: SVG.Polygon

	private points: SVG.Point[] = []

	public constructor() {
		super()
		this.addName()
		this.displayName = "Polygon"
		this.position = new SVG.Point()

		this.shapeVisualization = CanvasController.instance.canvas.polygon()
		this.shapeVisualization.hide()

		this.dragElement = CanvasController.instance.canvas.polygon()
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.shapeVisualization)

		this.visualization.add(this.dragElement)
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		let relPositions: { anchorname: string; relPos: SVG.Point }[] = []
		let halfSize = this.size.div(2)
		for (const anchor of basicDirections) {
			if (anchor.key == defaultBasicDirection.key) {
				continue
			}
			let dirLength = anchor.direction.abs()
			dirLength = dirLength == 0 ? 1 : dirLength
			relPositions.push({ relPos: halfSize.mul(anchor.direction), anchorname: anchor.name })
		}

		for (let index = 0; index < this.points.length; index++) {
			const p1 = this.points[index]
			const p2 = this.points[(index + 1) % this.points.length]

			relPositions.push({ relPos: p1, anchorname: "" })
			relPositions.push({ relPos: p1.add(p2).div(2), anchorname: "" })
		}

		if (!this.snappingPoints || this.snappingPoints.length != relPositions.length) {
			this.snappingPoints.forEach((snapPoint) => snapPoint.show(false))
			this.snappingPoints = []
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos.add(this.position)))
			}
		} else {
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos)
				snappingPoint.recalculate()
			}
		}
	}

	private static bboxFromPoints(points: SVG.Point[]): SVG.Box {
		let minX = Number.MAX_VALUE
		let maxX = -Number.MAX_VALUE
		let minY = Number.MAX_VALUE
		let maxY = -Number.MAX_VALUE
		for (const point of points) {
			if (point.x < minX) minX = point.x
			if (point.y < minY) minY = point.y
			if (point.x > maxX) maxX = point.x
			if (point.y > maxY) maxY = point.y
		}
		return new SVG.Box(minX, minY, maxX - minX, maxY - minY)
	}

	protected recalculateResizePoints() {
		if (this.resizeViz.length == this.points.length) {
			const transformMatrix = this.getTransformMatrix()

			for (let index = 0; index < this.points.length; index++) {
				const point = this.points[index].transform(transformMatrix)
				const viz = this.resizeViz[index]

				viz.center(point.x, point.y)
			}
		}
	}

	private resizeViz: SVG.Element[] = []
	public resizable(resize: boolean): void {
		if (resize == this.isResizing) {
			return
		}
		this.isResizing = resize
		if (resize) {
			// let originalPos: SVG.Point
			// let originalSize: SVG.Point
			let transformMatrixInv: SVG.Matrix
			const getInitialDim = () => {
				// originalPos = this.position.clone()
				// originalSize = this.size.clone()
				transformMatrixInv = this.getTransformMatrix().inverse()
			}

			for (let index = 0; index < this.points.length; index++) {
				const point = this.points[index]
				let viz = resizeSVG()
				viz.node.style.cursor = "move"
				this.resizeViz.push(viz)

				let startPoint: SVG.Point
				let posOffset: SVG.Point = new SVG.Point()
				AdjustDragHandler.snapDrag(this, viz, true, {
					dragStart: (pos) => {
						getInitialDim()
						startPoint = new SVG.Point(point)
					},
					dragMove: (pos, ev) => {
						pos = pos.transform(transformMatrixInv)
						const transformMatrix = this.getTransformMatrix().lmultiply({
							translate: [-this.position.x, -this.position.y],
						})

						pos = pos.add(posOffset)

						this.points[index] = pos
						const bbox = PolygonComponent.bboxFromPoints(this.points)
						const posDelta = new SVG.Point(bbox.cx, bbox.cy)
						posOffset = posOffset.sub(posDelta)

						for (let index = 0; index < this.points.length; index++) {
							const point = this.points[index]
							this.points[index] = point.sub(posDelta)
						}
						this.position = this.position.add(posDelta.transform(transformMatrix))
						startPoint = pos
						this.update()
					},
					dragEnd: () => {
						return true
					},
				})
			}
			this.update()
		} else {
			for (const viz of this.resizeViz) {
				AdjustDragHandler.snapDrag(this, viz, false)
				viz.remove()
			}
			this.resizeViz = []
		}
	}

	public toJson(): PolygonSaveObject {
		let data: PolygonSaveObject = {
			type: "polygon",
			points: this.points.map((point) => point.add(this.position)),
		}
		if (this.rotationDeg) {
			data.rotationDeg = this.rotationDeg
		}
		if (this.scaleState.x != 1 || this.scaleState.y != 1) {
			data.scale = this.scaleState
		}

		let fill: FillInfo = {}
		let shouldFill = false
		if (this.fillInfo.color != "default") {
			fill.color = this.fillInfo.color
			shouldFill = true
		}
		if (this.fillInfo.opacity != 0) {
			fill.opacity = this.fillInfo.opacity
			shouldFill = true
		}
		if (shouldFill) {
			data.fill = fill
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

		if (!this.strokeInfo.width.eq(new SVG.Number("1pt"))) {
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

		if (this.mathJaxLabel.value) {
			let labelWithoutRender: PositionedLabel = {
				value: this.mathJaxLabel.value,
				anchor: this.anchorChoice.value.key,
				position: this.positionChoice.value.key,
				distance: this.labelDistance.value ?? undefined,
				color: this.labelColor.value ? this.labelColor.value.toString() : undefined,
			}
			data.label = labelWithoutRender
		}

		return data
	}

	static fromJson(saveObject: PolygonSaveObject): PolygonComponent {
		let polygonComponent = new PolygonComponent()

		polygonComponent.placingPoints = saveObject.points
			.map((point) => new SVG.Point(point))
			.concat(new SVG.Point(saveObject.points.at(-1)))
		polygonComponent.placeFinish()

		polygonComponent.rotationDeg = saveObject.rotationDeg ?? 0
		polygonComponent.scaleState = saveObject.scale ?? new SVG.Point(1, 1)

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				polygonComponent.fillInfo.color = saveObject.fill.color
				polygonComponent.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
				polygonComponent.fillColorProperty.updateHTML()
			}
			if (saveObject.fill.opacity != undefined) {
				polygonComponent.fillInfo.opacity = saveObject.fill.opacity
				polygonComponent.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
				polygonComponent.fillOpacityProperty.updateHTML()
			}
		}

		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				polygonComponent.strokeInfo.color = saveObject.stroke.color
				polygonComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
				polygonComponent.strokeColorProperty.updateHTML()
			}
			if (saveObject.stroke.opacity != undefined) {
				polygonComponent.strokeInfo.opacity = saveObject.stroke.opacity
				polygonComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
				polygonComponent.strokeOpacityProperty.updateHTML()
			}
			if (saveObject.stroke.width) {
				polygonComponent.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				polygonComponent.strokeWidthProperty.value = polygonComponent.strokeInfo.width
				polygonComponent.strokeWidthProperty.updateHTML()
			}
			if (saveObject.stroke.style) {
				polygonComponent.strokeInfo.style = saveObject.stroke.style
				polygonComponent.strokeStyleProperty.value = strokeStyleChoices.find(
					(item) => item.key == saveObject.stroke.style
				)
				polygonComponent.strokeStyleProperty.updateHTML()
			}
		}

		if (saveObject.label) {
			polygonComponent.labelDistance.value =
				saveObject.label.distance ? new SVG.Number(saveObject.label.distance) : new SVG.Number(0)
			polygonComponent.labelDistance.updateHTML()
			polygonComponent.anchorChoice.value =
				saveObject.label.anchor ?
					basicDirections.find((item) => item.key == saveObject.label.anchor)
				:	defaultBasicDirection
			polygonComponent.anchorChoice.updateHTML()
			polygonComponent.positionChoice.value =
				saveObject.label.position ?
					basicDirections.find((item) => item.key == saveObject.label.position)
				:	defaultBasicDirection
			polygonComponent.positionChoice.updateHTML()
			polygonComponent.mathJaxLabel.value = saveObject.label.value
			polygonComponent.mathJaxLabel.updateHTML()
			polygonComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
			polygonComponent.labelColor.updateHTML()
			polygonComponent.generateLabelRender()
		}

		polygonComponent.updateTheme()
		polygonComponent.update()
		return polygonComponent
	}

	public toTikzString(): string {
		let optionsArray: string[] = []

		if (this.fillInfo.opacity > 0) {
			if (this.fillInfo.color !== "default") {
				let c = new SVG.Color(this.fillInfo.color)
				optionsArray.push("fill=" + c.toTikzString())
			}

			if (this.fillInfo.opacity != 1) {
				optionsArray.push("fill opacity=" + this.fillInfo.opacity.toString())
			}
		}

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

			if (this.strokeInfo.style != defaultStrokeStyleChoice.key) {
				optionsArray.push(
					dashArrayToPattern(
						this.strokeInfo.width,
						strokeStyleChoices.find((item) => item.key == this.strokeInfo.style).dasharray
					)
				)
			}
		}

		let id = this.name.value
		if (!id && this.mathJaxLabel.value) {
			id = ExportController.instance.createExportID("Ellipse")
		}

		let labelNodeStr = ""
		if (this.mathJaxLabel.value) {
			let labelStr = "anchor=" + this.labelPos.name

			let labelDist = this.labelDistance.value.convertToUnit("cm")

			let norm = this.labelPos.direction.abs()
			norm = norm == 0 ? 1 : norm
			let labelShift = this.labelPos.direction.mul(-labelDist.value / norm)

			let posStr = this.textPos.add(labelShift).toTikzString()

			let latexStr = this.mathJaxLabel.value ? "$" + this.mathJaxLabel.value + "$" : ""
			latexStr =
				latexStr && this.labelColor.value ?
					"\\textcolor" + this.labelColor.value.toTikzString() + "{" + latexStr + "}"
				:	latexStr

			labelNodeStr = " node[" + labelStr + "] at " + posStr + "{" + latexStr + "}"
		}

		const transformMatrix = this.getTransformMatrix()
		let pointsStr = this.points
			.map((point) => point.transform(transformMatrix).toTikzString())
			.concat(["cycle"])
			.join(" -- ")

		let optionsStr = optionsArray.length > 0 ? `[${optionsArray.join(", ")}]` : ""
		return `\\path${optionsStr} ${pointsStr} ${labelNodeStr};`
	}

	public requiredTikzLibraries(): string[] {
		return []
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		const transformMatrix = this.getTransformMatrix()
		let points = this.points.map((point) => point.transform(transformMatrix))
		for (let idx = 0; idx < points.length; idx++) {
			const p1 = points[idx]
			const p2 = points[(idx + 1) % points.length]
			if (lineRectIntersection(new SVG.Line().plot(p1.x, p1.y, p2.x, p2.y), selectionRectangle)) {
				return true
			}
		}

		// TODO selection rectangle inside polygon?

		return false
	}

	private scaleState = new SVG.Point(1, 1)
	public flip(horizontal: boolean): void {
		this.scaleState.y *= -1
		this.rotationDeg = (horizontal ? 0 : 180) - this.rotationDeg
		this.simplifyRotationAngle()
		this.update()
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate: -this.rotationDeg,
			origin: [0, 0],
			scale: [this.scaleState.x, this.scaleState.y],
			translate: [this.position.x, this.position.y],
		})
	}

	protected update(): void {
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		let transformMatrix = this.getTransformMatrix()

		let pointsArray: [number, number][] = this.points.map((point) => point.toArray())

		const bbox = PolygonComponent.bboxFromPoints(this.points)

		this.size = new SVG.Point(bbox.w, bbox.h)
		this._bbox = bbox.transform(transformMatrix)

		this.dragElement.plot(pointsArray)
		this.dragElement.size(this.size.x, this.size.y)
		this.dragElement.transform(transformMatrix)

		this.shapeVisualization.plot(pointsArray)
		this.shapeVisualization.size(
			this.size.x < strokeWidth ? 0 : this.size.x - strokeWidth,
			this.size.y < strokeWidth ? 0 : this.size.y - strokeWidth
		)
		this.shapeVisualization.transform(transformMatrix)

		this.relPosition = this.position.sub(new SVG.Point(this.bbox.x, this.bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updateLabelPosition()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let lineWidth = selectedBoxWidth

			this.selectionElement
				.size(this.size.x + lineWidth, this.size.y + lineWidth)
				.center(0, 0)
				.transform(this.getTransformMatrix())
		}
	}

	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (this.placingPoints.length < 1) {
			// not started placing
			SnapCursorController.instance.moveTo(pos)
		} else {
			let placePoint = this.placingPoints.at(-2)
			let secondPoint: SVG.Point
			if (ev && (ev as MouseEvent | TouchEvent).ctrlKey) {
				// get point on one of the two diagonals
				let diff = pos.sub(placePoint)
				if (diff.x * diff.y < 0) {
					secondPoint = new SVG.Point(pos.x - pos.y, pos.y - pos.x).add(placePoint.x + placePoint.y).div(2)
				} else {
					secondPoint = new SVG.Point(placePoint.x - placePoint.y, placePoint.y - placePoint.x)
						.add(pos.x + pos.y)
						.div(2)
				}
			} else {
				secondPoint = pos
			}
			this.placingPoints[this.placingPoints.length - 1] = secondPoint

			let bbox = PolygonComponent.bboxFromPoints(this.placingPoints)
			this.position = new SVG.Point(bbox.cx, bbox.cy)

			this.size = new SVG.Point(bbox.w, bbox.h)

			this.points = this.placingPoints.map((point) => point.sub(this.position))
			this.update()
		}
	}

	private placingPoints: SVG.Point[] = []
	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		if (this.finishedPlacing) {
			return true
		}

		if (this.points.length == 0) {
			this.placingPoints.push(pos.clone())
			this.shapeVisualization.show()
			this.updateTheme()
			SnapCursorController.instance.visible = false
		} else {
			if (this.placingPoints.at(-2).eq(pos)) {
				return true
			}
		}

		this.placingPoints.push(pos)

		this.placeMove(pos, ev)
		return false
	}

	public placeFinish(): void {
		if (this.finishedPlacing) {
			return
		}
		if (this.placingPoints.length == 0) {
			this.placeStep(new SVG.Point())
		}
		this.placingPoints.pop()
		if (this.placingPoints.length >= 2 && this.placingPoints.at(-1).eq(this.placingPoints.at(-2))) {
			this.placingPoints.pop()
		}
		if (this.placingPoints.length < 2) {
			// if not even 2 corner points -> no polygon, delete
			MainController.instance.removeComponent(this)
			return
		}

		let bbox = PolygonComponent.bboxFromPoints(this.placingPoints)

		this.position = new SVG.Point(bbox.cx, bbox.cy)
		this.size = new SVG.Point(bbox.w, bbox.h)
		this.points = this.placingPoints.map((point) => point.sub(this.position))

		this.finishedPlacing = true
		this.update()
		this.draggable(true)
		this.shapeVisualization.show()
		this.updateTheme()
		SnapCursorController.instance.visible = false
		this.update()
	}

	public copyForPlacement(): CircuitComponent {
		return new PolygonComponent()
	}

	private labelPos: DirectionInfo
	private textPos: SVG.Point
	public updateLabelPosition(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering

		// get relevant positions and bounding boxes
		let transformMatrix = this.getTransformMatrix()
		let bbox = PolygonComponent.bboxFromPoints(this.points)

		this.textPos = new SVG.Point(this.bbox.cx, this.bbox.cy)
		let textPosNoTrans = new SVG.Point()
		if (this.positionChoice.value.key != defaultBasicDirection.key) {
			let bboxHalfSize = new SVG.Point(bbox.w / 2, bbox.h / 2)

			textPosNoTrans = bboxHalfSize.mul(this.positionChoice.value.direction)
			this.textPos = textPosNoTrans.transform(transformMatrix)
		}
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelRef: SVG.Point
		let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
		if (this.anchorChoice.value.key == defaultBasicDirection.key) {
			let clamp = function (value: number, min: number = -1, max: number = 1) {
				if (value < min) {
					return min
				} else if (value > max) {
					return max
				} else {
					return value
				}
			}
			let horizontalTextPosition = clamp(Math.round((2 * (bbox.cx - textPosNoTrans.x)) / bbox.w))
			let verticalTextPosition = clamp(Math.round((2 * (bbox.cy - textPosNoTrans.y)) / bbox.h))
			labelRef = new SVG.Point(horizontalTextPosition, verticalTextPosition).rotate(this.rotationDeg)
			labelRef.x = Math.round(labelRef.x)
			labelRef.y = Math.round(labelRef.y)
			this.labelPos = basicDirections.find((item) => item.direction.eq(labelRef))
		} else {
			this.labelPos = this.anchorChoice.value
			labelRef = this.labelPos.direction
		}

		let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w, labelBBox.h)).add(labelRef.mul(labelDist))

		// acutally move the label
		let movePos = this.textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({ translate: [movePos.x, movePos.y] }))
	}
}
