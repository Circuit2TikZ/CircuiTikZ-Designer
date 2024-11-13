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
	PositionedLabel,
	SelectionController,
	ShapeComponent,
	ShapeSaveObject,
	SnapCursorController,
	SnapDragHandler,
	SnapPoint,
	StrokeInfo,
	strokeStyleChoices,
} from "../internal"
import { referenceColor, resizeSVG, selectedBoxWidth, selectionColor, roundTikz } from "../utils/selectionHelper"

export type EllipseSaveObject = ShapeSaveObject & {
	position: SVG.Point
	size: SVG.Point
}

export class EllipseComponent extends ShapeComponent {
	private placePoint: SVG.Point

	protected declare shapeVisualization: SVG.Ellipse
	protected declare dragElement: SVG.Ellipse

	private _isCircle = false
	public get isCircle() {
		return this._isCircle
	}

	public constructor() {
		super()
		this.displayName = "Ellipse"

		this.shapeVisualization = CanvasController.instance.canvas.ellipse(0, 0)
		this.shapeVisualization.hide()

		this.dragElement = CanvasController.instance.canvas.ellipse(0, 0)
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.shapeVisualization)
		CanvasController.instance.canvas.add(this.visualization)

		this.visualization.add(this.dragElement)

		SnapCursorController.instance.visible = true
		this.snappingPoints = []
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix()
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
			relPositions.push({ relPos: halfSize.mul(anchor.direction.div(dirLength)), anchorname: anchor.name })
			if (dirLength > 1) {
				relPositions.push({ relPos: halfSize.mul(anchor.direction), anchorname: "" })
			}
		}

		if (!this.snappingPoints || this.snappingPoints.length == 0) {
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos))
			}
		} else {
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos)
				snappingPoint.recalculate(new SVG.Matrix())
			}
		}
	}

	protected recalculateResizePoints() {
		let halfsize = new SVG.Point(this.bbox.w / 2, this.bbox.h / 2)
		for (const [dir, viz] of this.resizeVisualizations) {
			let pos = this.position.add(halfsize.mul(dir.direction))
			viz.center(pos.x, pos.y)
		}
	}
	public resizable(resize: boolean): void {
		if (resize == this.isResizing) {
			return
		}
		this.isResizing = resize
		if (resize) {
			let originalPos: SVG.Point
			let originalSize: SVG.Point
			const getInitialDim = () => {
				originalPos = this.position.clone()
				originalSize = this.size.clone()
			}

			for (const direction of basicDirections) {
				if (direction.key == defaultBasicDirection.key || direction.key == "center") {
					continue
				}

				let viz = resizeSVG()
				if (direction.pointer) {
					viz.node.style.cursor = direction.pointer
				}
				this.resizeVisualizations.set(direction, viz)

				let startPoint: SVG.Point
				let oppositePoint: SVG.Point
				AdjustDragHandler.snapDrag(this, viz, true, {
					dragStart: (pos) => {
						getInitialDim()
						let box = viz.bbox()
						startPoint = new SVG.Point(box.cx, box.cy)
						oppositePoint = originalPos.add(direction.direction.mul(originalSize).div(-2))
					},
					dragMove: (pos, ev) => {
						if (
							ev &&
							(ev as MouseEvent | TouchEvent).ctrlKey &&
							direction.direction.x * direction.direction.y != 0
						) {
							// get closest point on one of the two diagonals
							let diff = pos.sub(oppositePoint)
							if (diff.x * diff.y < 0) {
								pos = new SVG.Point(pos.x - pos.y, pos.y - pos.x)
									.add(oppositePoint.x + oppositePoint.y)
									.div(2)
							} else {
								pos = new SVG.Point(
									oppositePoint.x - oppositePoint.y,
									oppositePoint.y - oppositePoint.x
								)
									.add(pos.x + pos.y)
									.div(2)
							}
						}
						let dirAbs = new SVG.Point(Math.abs(direction.direction.x), Math.abs(direction.direction.y))
						let delta = pos.sub(startPoint)

						this.size.x = direction.direction.x ? Math.abs(pos.x - oppositePoint.x) : originalSize.x
						this.size.y = direction.direction.y ? Math.abs(pos.y - oppositePoint.y) : originalSize.y

						this.position = originalPos.add(delta.mul(dirAbs.div(2)))
						this.update()
					},
				})
			}
			this.update()
		} else {
			for (const [dir, viz] of this.resizeVisualizations) {
				AdjustDragHandler.snapDrag(this, viz, false)
				viz.remove()
			}
			this.resizeVisualizations.clear()
		}
	}

	public moveTo(position: SVG.Point): void {
		this.position = position
		this.update()
	}
	public rotate(angleDeg: number): void {
		this.size = new SVG.Point(this.size.y, this.size.x)
		// this.rotationDeg+=angleDeg
		// this.simplifyRotationAngle()
		this.update()
	}
	public flip(horizontal: boolean): void {
		//doesn't do anything for ellipses
	}
	protected update(): void {
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		let transformMatrix = this.getTransformMatrix()

		this.dragElement.size(this.size.x, this.size.y).center(this.position.x, this.position.y)
		this.dragElement.transform(transformMatrix)

		this.shapeVisualization.size(
			this.size.x < strokeWidth ? 0 : this.size.x - strokeWidth,
			this.size.y < strokeWidth ? 0 : this.size.y - strokeWidth
		)
		this.shapeVisualization.center(this.position.x, this.position.y)
		this.shapeVisualization.transform(transformMatrix)

		this._isCircle = Math.abs(this.size.x - this.size.y) < 1e-5

		this._bbox = this.dragElement.bbox()

		this.relPosition = this.position.sub(new SVG.Point(this.bbox.x, this.bbox.y))
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updateLabelPosition()
	}
	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let lineWidth = selectedBoxWidth.convertToUnit("px").value
			this.selectionElement.center(this.position.x, this.position.y)
			this.selectionElement.size(this.bbox.w + 2 * lineWidth, this.bbox.h + 2 * lineWidth)
		}
	}

	public getPureBBox(): SVG.Box {
		return this.bbox
	}

	public viewSelected(show: boolean): void {
		if (show) {
			if (!this.selectionElement) {
				this.selectionElement = CanvasController.instance.canvas.ellipse()
				this.selectionElement.stroke({
					width: selectedBoxWidth.convertToUnit("px").value,
					dasharray: "3,3",
				})
				this.selectionElement.fill("none")
			}
			this.selectionElement.attr({
				stroke: this.isSelectionReference ? referenceColor : selectionColor,
			})
			this.visualization.stroke("#f00")
			this.recalculateSelectionVisuals()
		} else {
			this.selectionElement?.remove()
			this.visualization.stroke("#000")
			this.selectionElement = null
		}
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
	}
	public toJson(): EllipseSaveObject {
		let data: EllipseSaveObject = {
			type: "ellipse",
			position: this.position.simplifyForJson(),
			size: this.size.simplifyForJson(),
		}
		if (this.rotationDeg) {
			data.rotationDeg = this.rotationDeg
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

	static fromJson(saveObject: EllipseSaveObject): EllipseComponent {
		let ellipseComponent = new EllipseComponent()
		ellipseComponent.position = new SVG.Point(saveObject.position)
		ellipseComponent.placePoint = saveObject.position
		ellipseComponent.size = new SVG.Point(saveObject.size)

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				ellipseComponent.fillInfo.color = saveObject.fill.color
				ellipseComponent.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
				ellipseComponent.fillColorProperty.updateHTML()
			}
			if (saveObject.fill.opacity != undefined) {
				ellipseComponent.fillInfo.opacity = saveObject.fill.opacity
				ellipseComponent.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
				ellipseComponent.fillOpacityProperty.updateHTML()
			}
		}

		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				ellipseComponent.strokeInfo.color = saveObject.stroke.color
				ellipseComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
				ellipseComponent.strokeColorProperty.updateHTML()
			}
			if (saveObject.stroke.opacity != undefined) {
				ellipseComponent.strokeInfo.opacity = saveObject.stroke.opacity
				ellipseComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
				ellipseComponent.strokeOpacityProperty.updateHTML()
			}
			if (saveObject.stroke.width) {
				ellipseComponent.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				ellipseComponent.strokeWidthProperty.value = ellipseComponent.strokeInfo.width
				ellipseComponent.strokeWidthProperty.updateHTML()
			}
			if (saveObject.stroke.style) {
				ellipseComponent.strokeInfo.style = saveObject.stroke.style
				ellipseComponent.strokeStyleProperty.value = strokeStyleChoices.find(
					(item) => item.key == saveObject.stroke.style
				)
				ellipseComponent.strokeStyleProperty.updateHTML()
			}
		}

		if (saveObject.label) {
			ellipseComponent.labelDistance.value =
				saveObject.label.distance ? new SVG.Number(saveObject.label.distance) : new SVG.Number(0)
			ellipseComponent.labelDistance.updateHTML()
			ellipseComponent.anchorChoice.value =
				saveObject.label.anchor ?
					basicDirections.find((item) => item.key == saveObject.label.anchor)
				:	defaultBasicDirection
			ellipseComponent.anchorChoice.updateHTML()
			ellipseComponent.positionChoice.value =
				saveObject.label.position ?
					basicDirections.find((item) => item.key == saveObject.label.position)
				:	defaultBasicDirection
			ellipseComponent.positionChoice.updateHTML()
			ellipseComponent.mathJaxLabel.value = saveObject.label.value
			ellipseComponent.mathJaxLabel.updateHTML()
			ellipseComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
			ellipseComponent.labelColor.updateHTML()
			ellipseComponent.generateLabelRender()
		}

		ellipseComponent.placeFinish()
		ellipseComponent.updateTheme()
		return ellipseComponent
	}

	public toTikzString(): string {
		let optionsArray: string[] = []

		if (this.isCircle) {
			optionsArray.push("shape=circle")
		} else {
			optionsArray.push("shape=ellipse")
		}
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

		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		optionsArray.push("inner sep=0")
		optionsArray.push(
			"minimum width=" +
				roundTikz(new SVG.Number(this.bbox.w - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)
		if (!this.isCircle) {
			optionsArray.push(
				"minimum height=" +
					roundTikz(new SVG.Number(this.bbox.h - strokeWidth, "px").convertToUnit("cm").value) +
					"cm"
			)
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
			let posShift = ""
			if (labelShift.x !== 0) {
				posShift += "xshift=" + roundTikz(labelShift.x) + "cm"
			}
			if (labelShift.y !== 0) {
				posShift += posShift == "" ? "" : ", "
				posShift += "yshift=" + roundTikz(-labelShift.y) + "cm"
			}
			posShift = posShift == "" ? "" : "[" + posShift + "]"

			let posStr =
				this.positionChoice.value.key == defaultBasicDirection.key ?
					id + ".center"
				:	id + "." + this.positionChoice.value.name

			let latexStr = this.mathJaxLabel.value ? "$" + this.mathJaxLabel.value + "$" : ""
			latexStr =
				latexStr && this.labelColor.value ?
					"\\textcolor" + this.labelColor.value.toTikzString() + "{" + latexStr + "}"
				:	latexStr

			labelNodeStr = " node[" + labelStr + "] at (" + posShift + posStr + "){" + latexStr + "}"
		}

		let optionsStr = optionsArray.length > 0 ? `[${optionsArray.join(", ")}]` : ""
		return `\\node${optionsStr}${id ? "(" + id + ")" : ""} at ${this.position.toTikzString()}{}${labelNodeStr};`
	}

	public requiredTikzLibraries(): string[] {
		return this.isCircle ? [] : ["shapes.geometric"]
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		//rescale ellipse and rectangle to a unit circle and rectangle (and move rectangle to equivalent position)
		let ellipseExtendsInv = new SVG.Point(2 / this.bbox.w, 2 / this.bbox.h)
		let rectPos = new SVG.Point(selectionRectangle.cx, selectionRectangle.cy)
		let rectExtendsHalf = new SVG.Point(selectionRectangle.w / 2, selectionRectangle.h / 2)
		rectPos = this.position.add(rectPos.sub(this.position).mul(ellipseExtendsInv))
		rectExtendsHalf = rectExtendsHalf.mul(ellipseExtendsInv)

		// check absolute difference of rectangle and circle centers
		let diff = new SVG.Point(Math.abs(this.position.x - rectPos.x), Math.abs(this.position.y - rectPos.y))

		//outside
		let r = 1 // radius/squared radius of ellipse(now circle)
		if (diff.x > rectExtendsHalf.x + r || diff.y > rectExtendsHalf.y + r) return false

		//inside
		if (diff.x <= rectExtendsHalf.x || diff.y <= rectExtendsHalf.y) return true

		//rounded corner check
		return (diff.x - rectExtendsHalf.x) ** 2 + (diff.y - rectExtendsHalf.y) ** 2 <= r
	}

	public copyForPlacement(): CircuitComponent {
		return new EllipseComponent()
	}
	public remove(): void {
		for (const [dir, viz] of this.resizeVisualizations) {
			AdjustDragHandler.snapDrag(this, viz, false)
			viz.remove()
		}
		SnapDragHandler.snapDrag(this, false)
		this.visualization.remove()
		this.draggable(false)
		this.resizable(false)
		this.viewSelected(false)
		this.selectionElement?.remove()
	}
	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (!this.placePoint) {
			// not started placing
			SnapCursorController.instance.moveTo(pos)
		} else {
			let secondPoint: SVG.Point
			if (ev && (ev as MouseEvent | TouchEvent).ctrlKey) {
				// get point on one of the two diagonals
				let diff = pos.sub(this.placePoint)
				if (diff.x * diff.y < 0) {
					secondPoint = new SVG.Point(pos.x - pos.y, pos.y - pos.x)
						.add(this.placePoint.x + this.placePoint.y)
						.div(2)
				} else {
					secondPoint = new SVG.Point(
						this.placePoint.x - this.placePoint.y,
						this.placePoint.y - this.placePoint.x
					)
						.add(pos.x + pos.y)
						.div(2)
				}
			} else {
				secondPoint = pos
			}
			this.position = this.placePoint.add(secondPoint).div(2)
			this.size = new SVG.Point(
				Math.abs(secondPoint.x - this.placePoint.x),
				Math.abs(secondPoint.y - this.placePoint.y)
			)
			this.update()
		}
	}
	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		if (this.finishedPlacing) {
			return true
		}
		if (!this.placePoint) {
			this.placePoint = pos
			this.position = pos
			this.size = new SVG.Point()
			this.shapeVisualization.show()
			this.updateTheme()
			SnapCursorController.instance.visible = false
			return false
		}

		this.placeMove(pos, ev)
		return true
	}
	public placeFinish(): void {
		if (this.finishedPlacing) {
			return
		}
		if (!this.placePoint) {
			this.placeStep(new SVG.Point())
		}

		this.finishedPlacing = true
		this.update()
		this.draggable(true)
		this.shapeVisualization.show()
		this.updateTheme()
		SnapCursorController.instance.visible = false
	}

	private labelPos: DirectionInfo
	public updateLabelPosition(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		let useBBox = this.bbox.transform(transformMatrix)
		// get relevant positions and bounding boxes
		let textPos: SVG.Point
		if (this.positionChoice.value.key == defaultBasicDirection.key) {
			textPos = new SVG.Point(this.bbox.cx, this.bbox.cy)
		} else {
			let bboxHalfSize = new SVG.Point(useBBox.w / 2, useBBox.h / 2)
			textPos = this.position.add(
				bboxHalfSize.mul(this.positionChoice.value.direction.div(this.positionChoice.value.direction.abs()))
			)
		}
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelRef: SVG.Point
		let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
		if (this.anchorChoice.value.key == defaultBasicDirection.key) {
			let clamp = function (value: number, min: number, max: number) {
				if (value < min) {
					return min
				} else if (value > max) {
					return max
				} else {
					return value
				}
			}
			let horizontalTextPosition = clamp(Math.round((2 * (useBBox.cx - textPos.x)) / useBBox.w), -1, 1)
			let verticalTextPosition = clamp(Math.round((2 * (useBBox.cy - textPos.y)) / useBBox.h), -1, 1)
			labelRef = new SVG.Point(horizontalTextPosition, verticalTextPosition)
			this.labelPos = basicDirections.find((item) => item.direction.eq(labelRef))
		} else {
			this.labelPos = this.anchorChoice.value
			labelRef = this.labelPos.direction
		}

		let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w, labelBBox.h)).add(labelRef.mul(labelDist))

		// acutally move the label
		let movePos = textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({ translate: [movePos.x, movePos.y] }))
	}
}
