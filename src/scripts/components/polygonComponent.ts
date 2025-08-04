import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	CircuitComponent,
	dashArrayToPattern,
	defaultBasicDirection,
	defaultStroke,
	defaultStrokeStyleChoice,
	ExportController,
	Fillable,
	FillInfo,
	MainController,
	PathComponent,
	PathSaveObject,
	PositionedLabel,
	SnappingInfo,
	SnapPoint,
	Strokable,
	StrokeInfo,
	strokeStyleChoices,
	Nameable,
	PositionLabelable,
	bboxFromPoints,
	closestBasicDirection,
} from "../internal"
import { lineRectIntersection, selectedBoxWidth } from "../utils/selectionHelper"

export type PolygonSaveObject = PathSaveObject & {
	fill?: FillInfo
	stroke?: StrokeInfo
	name?: string
	label?: PositionedLabel
}

export class PolygonComponent extends PositionLabelable(Nameable(Strokable(Fillable(PathComponent)))) {
	private static jsonID = "polygon"
	static {
		CircuitComponent.jsonSaveMap.set(PolygonComponent.jsonID, PolygonComponent)
	}

	declare public componentVisualization: SVG.Polygon
	declare protected dragElement: SVG.Polygon

	public constructor() {
		super()

		this.snappingPoints = []
		CanvasController.instance.canvas.add(this.visualization)
		this.displayName = "Polygon"
		this.position = new SVG.Point()

		this.componentVisualization = CanvasController.instance.canvas.polygon()

		this.dragElement = CanvasController.instance.canvas.polygon()
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.componentVisualization)
		this.visualization.add(this.dragElement)
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints: this.snappingPoints,
			additionalSnappingPoints: [],
		}
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		// for polygons, these are always relative to (0,0)
		let relPositions: { anchorname: string; relPos: SVG.Point }[] = []

		let halfSize = this.size.div(2)
		for (const anchor of basicDirections) {
			// basic dirs
			if (anchor.key == defaultBasicDirection.key) {
				continue
			}
			let dirLength = anchor.direction.abs()
			dirLength = dirLength == 0 ? 1 : dirLength
			relPositions.push({ relPos: this.position.add(halfSize.mul(anchor.direction)), anchorname: anchor.name })
		}

		for (let index = 0; index < this.referencePoints.length; index++) {
			//the corner points as well as the center between to connected points
			const p1 = this.referencePoints[index]
			const p2 = this.referencePoints[(index + 1) % this.referencePoints.length]

			relPositions.push({ relPos: p1, anchorname: "" })
			relPositions.push({ relPos: p1.add(p2).div(2), anchorname: "" })
		}

		if (!this.snappingPoints || this.snappingPoints.length != relPositions.length) {
			this.snappingPoints.forEach((snapPoint) => snapPoint.show(false))
			this.snappingPoints = []
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos))
			}
		} else {
			const recalcMatrix = new SVG.Matrix()
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos)
				snappingPoint.recalculate(recalcMatrix)
			}
		}
	}

	// protected recalculateResizePoints() {
	// 	if (this.resizeViz.length == this.referencePoints.length) {
	// 		const transformMatrix = this.getTransformMatrix()

	// 		for (let index = 0; index < this.referencePoints.length; index++) {
	// 			const point = this.referencePoints[index].transform(transformMatrix)
	// 			const viz = this.resizeViz[index]

	// 			viz.center(point.x, point.y)
	// 		}
	// 	}
	// }

	// private resizeViz: SVG.Element[] = []
	// public resizable(resize: boolean): void {
	// 	if (resize == this.isResizing) {
	// 		return
	// 	}
	// 	this.isResizing = resize
	// 	if (resize) {
	// 		// let originalPos: SVG.Point
	// 		// let originalSize: SVG.Point
	// 		let transformMatrixInv: SVG.Matrix
	// 		const getInitialDim = () => {
	// 			// originalPos = this.position.clone()
	// 			// originalSize = this.size.clone()
	// 			transformMatrixInv = this.getTransformMatrix().inverse()
	// 		}

	// 		for (let index = 0; index < this.referencePoints.length; index++) {
	// 			const point = this.referencePoints[index]
	// 			let viz = resizeSVG()
	// 			viz.node.style.cursor = "move"
	// 			this.resizeViz.push(viz)

	// 			let startPoint: SVG.Point
	// 			let posOffset: SVG.Point = new SVG.Point()
	// 			AdjustDragHandler.snapDrag(this, viz, true, {
	// 				dragStart: (pos) => {
	// 					getInitialDim()
	// 					startPoint = new SVG.Point(point)
	// 				},
	// 				dragMove: (pos, ev) => {
	// 					pos = pos.transform(transformMatrixInv)
	// 					const transformMatrix = this.getTransformMatrix().lmultiply({
	// 						translate: [-this.position.x, -this.position.y],
	// 					})

	// 					pos = pos.add(posOffset)

	// 					this.referencePoints[index] = pos
	// 					const bbox = bboxFromPoints(this.referencePoints)
	// 					const posDelta = new SVG.Point(bbox.cx, bbox.cy)
	// 					posOffset = posOffset.sub(posDelta)

	// 					for (let index = 0; index < this.referencePoints.length; index++) {
	// 						const point = this.referencePoints[index]
	// 						this.referencePoints[index] = point.sub(posDelta)
	// 					}
	// 					this.position = this.position.add(posDelta.transform(transformMatrix))
	// 					startPoint = pos
	// 					this.update()
	// 				},
	// 				dragEnd: () => {
	// 					return true
	// 				},
	// 			})
	// 		}
	// 		this.update()
	// 	} else {
	// 		for (const viz of this.resizeViz) {
	// 			AdjustDragHandler.snapDrag(this, viz, false)
	// 			viz.remove()
	// 		}
	// 		this.resizeViz = []
	// 	}
	// }

	public toJson(): PolygonSaveObject {
		let data = super.toJson() as PolygonSaveObject
		data.type = PolygonComponent.jsonID

		return data
	}

	public applyJson(saveObject: PolygonSaveObject): void {
		super.applyJson(saveObject)

		this.updateTheme()
		this.update()
	}

	static fromJson(saveObject: PolygonSaveObject): PolygonComponent {
		return new PolygonComponent()
	}

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color
		if (strokeColor == "default") {
			strokeColor = defaultStroke
		}

		this.componentVisualization?.stroke({
			color: strokeColor,
			opacity: this.strokeInfo.opacity,
			width: this.strokeInfo.opacity == 0 ? 0 : this.strokeInfo.width.convertToUnit("px").value,
			dasharray: this.strokeStyleProperty.value.dasharray
				.map((factor) => this.strokeInfo.width.times(factor).toString())
				.join(" "),
		})

		let fillColor = this.fillInfo.color
		if (fillColor == "default") {
			fillColor = "none"
		}
		this.componentVisualization?.fill({
			color: fillColor,
			opacity: this.fillInfo.opacity,
		})

		let labelColor = defaultStroke
		if (this.labelColor.value) {
			labelColor = this.labelColor.value.toString()
		}

		this.labelRendering?.fill(labelColor)
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
			let labelStr = "anchor=" + this.anchorPos.name

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

		let pointsStr = this.referencePoints
			.map((point) => point.toTikzString())
			.concat(["cycle"])
			.join(" -- ")

		let optionsStr = optionsArray.length > 0 ? `[${optionsArray.join(", ")}]` : ""
		return `\\path${optionsStr} ${pointsStr} ${labelNodeStr};`
	}

	public requiredTikzLibraries(): string[] {
		return []
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		let points = this.referencePoints
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

	private size: SVG.Point
	protected update(): void {
		let pointsArray: [number, number][] = this.referencePoints.map((point) => point.toArray())

		const bbox = bboxFromPoints(this.referencePoints)
		this._bbox = bbox

		this.size = new SVG.Point(bbox.w, bbox.h)
		this.position = new SVG.Point(bbox.cx, bbox.cy)

		this.dragElement.plot(pointsArray)
		this.componentVisualization.plot(pointsArray)
		this.referencePosition = this.position.sub(new SVG.Point(this.bbox.x, this.bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updatePositionedLabel()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let strokeWidth = this.strokeInfo.width.convertToUnit("px").value
			let additionalWidth = selectedBoxWidth + strokeWidth + 2

			this.selectionElement
				.size(this.size.x + additionalWidth, this.size.y + additionalWidth)
				.center(this.position.x, this.position.y)
		}
	}

	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (this.referencePoints.length < 1) {
			// not started placing
		} else {
			let placePoint = this.referencePoints.at(-2)
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
			this.referencePoints[this.referencePoints.length - 1] = secondPoint

			this.update()
		}
	}

	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		if (this.finishedPlacing) {
			return true
		}

		if (this.referencePoints.length == 0) {
			this.referencePoints.push(pos.clone())
			this.componentVisualization.show()
			this.updateTheme()
		} else {
			if (this.referencePoints.at(-2).eq(pos)) {
				return true
			}
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
		this.componentVisualization.show()
		this.updateTheme()
		this.update()
	}

	public copyForPlacement(): CircuitComponent {
		return new PolygonComponent()
	}

	// private labelPos: DirectionInfo
	private textPos: SVG.Point
	public updatePositionedLabel(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}

		let labelSVG = this.labelRendering
		let bbox = this.bbox
		let halfSize = this.size.div(2)

		let textDir: SVG.Point // normalized direction to size (length not normalized) in local coords
		let textPosNoTrans = new SVG.Point()
		if (this.positionChoice.value.key != defaultBasicDirection.key) {
			textDir = this.positionChoice.value.direction
			textPosNoTrans = halfSize.mul(this.positionChoice.value.direction)
			this.textPos = this.position.add(textPosNoTrans)
		} else {
			textDir = new SVG.Point()
			textPosNoTrans = new SVG.Point()
			this.textPos = this.position
		}
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
		if (this.anchorChoice.value.key == defaultBasicDirection.key) {
			//transform anchor direction back to global coordinates
			let labelRefDir = textDir.mul(-1)

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

		// acutally move the label
		labelSVG.transform({ translate: this.textPos.sub(ref) })
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		if (this.labelRendering) {
			const backgroundDefs = CanvasController.instance.canvas.findOne("#backgroundDefs") as SVG.Defs

			for (const element of this.labelRendering.find("use")) {
				const id = element.node.getAttribute("xlink:href")
				if (!defs.has(id)) {
					const symbol = backgroundDefs.findOne(id) as SVG.Element
					defs.set(id, symbol.clone(true, false))
				}
			}
		}
		this.labelRendering?.addClass("labelRendering")
		const copiedSVG = this.visualization.clone(true)
		if (this.labelRendering) {
			if (!this.mathJaxLabel.value) {
				copiedSVG.removeElement(copiedSVG.find(".labelRendering")[0])
			}
			this.labelRendering.removeClass("labelRendering")
			copiedSVG.findOne(".labelRendering")?.removeClass("labelRendering")
		}
		copiedSVG.removeElement(copiedSVG.find(".draggable")[0])

		const viz = copiedSVG.findOne('[fill-opacity="0"][stroke-opacity="0"]')
		viz?.remove()
		return copiedSVG
	}
}
