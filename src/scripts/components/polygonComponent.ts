import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	dashArrayToPattern,
	defaultBasicDirection,
	defaultStroke,
	defaultStrokeStyleChoice,
	DirectionInfo,
	ExportController,
	FillInfo,
	MainController,
	MathJaxProperty,
	PathComponent,
	PathSaveObject,
	PositionedLabel,
	renderMathJax,
	SectionHeaderProperty,
	SliderProperty,
	SnapCursorController,
	SnapDragHandler,
	SnappingInfo,
	SnapPoint,
	StrokeInfo,
	StrokeStyle,
	strokeStyleChoices,
} from "../internal"
import { lineRectIntersection, selectedBoxWidth } from "../utils/selectionHelper"

export type PolygonSaveObject = PathSaveObject & {
	fill?: FillInfo
	stroke?: StrokeInfo
	name?: string
	label?: PositionedLabel
}

export class PolygonComponent extends PathComponent {
	private static jsonID = "polygon"
	static {
		CircuitComponent.jsonSaveMap.set(PolygonComponent.jsonID, PolygonComponent)
	}

	public declare componentVisualization: SVG.Polygon
	protected declare dragElement: SVG.Polygon

	protected strokeInfo: StrokeInfo
	protected fillInfo: FillInfo

	protected anchorChoice: ChoiceProperty<DirectionInfo>
	protected positionChoice: ChoiceProperty<DirectionInfo>

	protected fillColorProperty: ColorProperty
	protected fillOpacityProperty: SliderProperty
	protected strokeColorProperty: ColorProperty
	protected strokeOpacityProperty: SliderProperty
	protected strokeWidthProperty: SliderProperty
	protected strokeStyleProperty: ChoiceProperty<StrokeStyle>

	public constructor() {
		super()

		this.fillInfo = {
			color: "default",
			opacity: 1,
		}
		this.strokeInfo = {
			color: "default",
			opacity: 1,
			width: new SVG.Number("1pt"),
			style: defaultStrokeStyleChoice.key,
		}

		//add color property
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Fill").buildHTML())

		this.fillOpacityProperty = new SliderProperty(
			"Opacity",
			0,
			100,
			1,
			new SVG.Number(this.fillInfo.opacity * 100, "%")
		)
		this.fillOpacityProperty.addChangeListener((ev) => {
			this.fillInfo.opacity = ev.value.value / 100
			this.updateTheme()
		})

		this.fillColorProperty = new ColorProperty("Color", null)
		this.fillColorProperty.addChangeListener((ev) => {
			if (ev.value == null) {
				this.fillInfo.color = "default"
				this.fillInfo.opacity = 1
			} else {
				this.fillInfo.color = ev.value.toRgb()
				this.fillInfo.opacity = this.fillOpacityProperty.value.value / 100
			}
			this.updateTheme()
		})

		this.propertiesHTMLRows.push(this.fillColorProperty.buildHTML())
		this.propertiesHTMLRows.push(this.fillOpacityProperty.buildHTML())

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

		{
			//label section
			this.propertiesHTMLRows.push(new SectionHeaderProperty("Label").buildHTML())

			this.mathJaxLabel = new MathJaxProperty()
			this.mathJaxLabel.addChangeListener((ev) => this.generateLabelRender())
			this.propertiesHTMLRows.push(this.mathJaxLabel.buildHTML())

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
		this.snappingPoints = []
		CanvasController.instance.canvas.add(this.visualization)
		this.addName()
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

	/**
	 * Generate a label visualization via mathjax
	 * @param label the data for which to generate the label visualization
	 * @returns a Promise<void>
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
	// 					const bbox = PolygonComponent.bboxFromPoints(this.referencePoints)
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

		let fill: FillInfo = {}
		let shouldFill = false
		if (this.fillInfo.color != "default") {
			fill.color = this.fillInfo.color
			shouldFill = true
		}
		if (this.fillInfo.opacity != 1) {
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

	public applyJson(saveObject: PolygonSaveObject): void {
		super.applyJson(saveObject)

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				this.fillInfo.color = saveObject.fill.color
				this.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
			}
			if (saveObject.fill.opacity != undefined) {
				this.fillInfo.opacity = saveObject.fill.opacity
				this.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
			}
		}

		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				this.strokeInfo.color = saveObject.stroke.color
				this.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
			}
			if (saveObject.stroke.opacity != undefined) {
				this.strokeInfo.opacity = saveObject.stroke.opacity
				this.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
			}
			if (saveObject.stroke.width) {
				this.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				this.strokeWidthProperty.value = this.strokeInfo.width
			}
			if (saveObject.stroke.style) {
				this.strokeInfo.style = saveObject.stroke.style
				this.strokeStyleProperty.value = strokeStyleChoices.find((item) => item.key == saveObject.stroke.style)
			}
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
			this.mathJaxLabel.value = saveObject.label.value
			this.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
			this.generateLabelRender()
		}

		this.updateTheme()
		this.draggable(true)
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
		let pointsStr = this.referencePoints
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
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		let pointsArray: [number, number][] = this.referencePoints.map((point) => point.toArray())

		const bbox = PolygonComponent.bboxFromPoints(this.referencePoints)
		this._bbox = bbox

		this.size = new SVG.Point(bbox.w, bbox.h)
		this.position = new SVG.Point(bbox.cx, bbox.cy)

		this.dragElement.plot(pointsArray)
		// this.dragElement.size(this.size.x, this.size.y)

		this.componentVisualization.plot(pointsArray)
		this.componentVisualization.size(
			this.size.x < strokeWidth ? 0 : this.size.x - strokeWidth,
			this.size.y < strokeWidth ? 0 : this.size.y - strokeWidth
		)

		this.referencePosition = this.position.sub(new SVG.Point(this.bbox.x, this.bbox.y))

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
				.center(this.position.x, this.position.y)
		}
	}

	public placeMove(pos: SVG.Point, ev?: Event): void {
		SnapCursorController.instance.visible = true
		if (this.referencePoints.length < 1) {
			// not started placing
			SnapCursorController.instance.moveTo(pos)
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
			SnapCursorController.instance.visible = false
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
		this.draggable(true)
		this.componentVisualization.show()
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
		let bbox = PolygonComponent.bboxFromPoints(this.referencePoints)

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
			labelRef = new SVG.Point(horizontalTextPosition, verticalTextPosition)
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
