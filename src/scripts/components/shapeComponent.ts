import * as SVG from "@svgdotjs/svg.js"
import {
	DirectionInfo,
	CanvasController,
	basicDirections,
	defaultBasicDirection,
	SnappingInfo,
	SnapDragHandler,
	AdjustDragHandler,
	defaultStroke,
	SelectionController,
	NodeComponent,
	NodeSaveObject,
	FillInfo,
	Fillable,
	StrokeInfo,
	Strokable,
	closestBasicDirection,
} from "../internal"
import { resizeSVG, selectedBoxWidth } from "../utils/selectionHelper"

export type ShapeSaveObject = NodeSaveObject & {
	fill?: FillInfo
	stroke?: StrokeInfo
	size: SVG.Point
}

export const dashArrayToPattern = (linewidth: SVG.Number, dasharray: number[]): string => {
	let pattern = []
	for (let index = 0; index < dasharray.length - 1; index += 2) {
		const onElement = dasharray[index]
		const offElement = dasharray[index + 1]
		pattern.push("on " + linewidth.times(onElement).toString())
		pattern.push("off " + linewidth.times(offElement).toString())
	}
	return "dash pattern={" + pattern.join(" ") + "}"
}

export abstract class ShapeComponent extends Strokable(Fillable(NodeComponent)) {
	protected placePoint: SVG.Point

	public constructor() {
		super()
		this.resizeVisualizations = new Map<DirectionInfo, SVG.Element>()

		this.snappingPoints = []
		CanvasController.instance.canvas.add(this.visualization)
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

	public flip(horizontal: boolean): void {
		this.rotationDeg = (horizontal ? 0 : 180) - this.rotationDeg
		this.simplifyRotationAngle()
		this.update()
	}

	protected recalculateResizePoints() {
		const halfsize = this.size.div(2)
		const transformMatrix = this.getTransformMatrix()
		for (const [dir, viz] of this.resizeVisualizations) {
			let pos = halfsize.add(halfsize.mul(dir.direction)).transform(transformMatrix)
			viz.center(pos.x, pos.y)
		}
	}

	protected applyJson(saveObject: ShapeSaveObject): void {
		super.applyJson(saveObject)
		this.placePoint = this.position
		this.size = new SVG.Point(saveObject.size)
		this.referencePosition = this.size.div(2)
	}

	public toJson(): ShapeSaveObject {
		const data = super.toJson() as ShapeSaveObject
		data.size = this.size
		return data
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

	protected update(): void {
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		let transformMatrix = this.getTransformMatrix()
		const halfSize = this.size.div(2)

		this.dragElement.size(this.size.x, this.size.y)
		this.dragElement.transform(transformMatrix)

		this.componentVisualization.size(
			this.size.x < strokeWidth ? 0 : this.size.x - strokeWidth,
			this.size.y < strokeWidth ? 0 : this.size.y - strokeWidth
		)
		this.componentVisualization.center(halfSize.x, halfSize.y)
		this.componentVisualization.transform(transformMatrix)

		this.defaultTextPosition = halfSize
		this._bbox = this.dragElement.bbox().transform(transformMatrix)

		//update resize pointers
		if (this.isResizing) {
			for (const [direction, viz] of this.resizeVisualizations.entries()) {
				const directionTransformed = direction.direction.transform(
					new SVG.Matrix({
						rotate: -this.rotationDeg,
						scaleX: this.scaleState.x,
						scaleY: this.scaleState.y,
					})
				)
				viz.node.style.cursor = closestBasicDirection(directionTransformed).pointer
			}
		}

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updatePositionedLabel()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			this.selectionElement
				.size(this.size.x + selectedBoxWidth, this.size.y + selectedBoxWidth)
				.center(this.size.x / 2, this.size.y / 2)
				.transform(this.getTransformMatrix())
		}
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

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints: this.snappingPoints,
			additionalSnappingPoints: [],
		}
	}

	public viewSelected(show: boolean): void {
		super.viewSelected(show)
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
	}

	public resizable(resize: boolean): void {
		// general method: work with positions in non rotated reference frame (rotation of rotated positions has to be compensated --> inverse transform Matrix). Rotation is done in update via the transformMatrix
		if (resize == this.isResizing) {
			return
		}
		this.isResizing = resize
		if (resize) {
			let originalPos: SVG.Point
			let originalSize: SVG.Point
			let transformMatrixInv: SVG.Matrix
			const getInitialDim = () => {
				originalPos = this.position.clone()
				originalSize = this.size.clone()
				transformMatrixInv = this.getTransformMatrix().inverse()
			}

			for (const direction of basicDirections) {
				if (direction.key == defaultBasicDirection.key || direction.key == "center") {
					continue
				}

				let viz = resizeSVG()
				this.resizeVisualizations.set(direction, viz)

				let startPoint: SVG.Point
				let oppositePoint: SVG.Point
				AdjustDragHandler.snapDrag(this, viz, true, {
					dragStart: (pos) => {
						getInitialDim()
						let positionLocal = originalPos.transform(transformMatrixInv)
						startPoint = positionLocal.add(direction.direction.mul(originalSize).div(2))
						oppositePoint = positionLocal.add(direction.direction.mul(originalSize).div(-2))
					},
					dragMove: (pos, ev) => {
						pos = pos.transform(transformMatrixInv)
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
						this.referencePosition = this.size.div(2)

						this.position = originalPos.add(delta.mul(dirAbs.div(2)).rotate(this.rotationDeg))
						this.update()
					},
					dragEnd: () => {
						return true
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

	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (!this.placePoint) {
			// not started placing
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
			this.referencePosition = this.size.div(2)
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
			this.referencePosition = this.size.div(2)
			this.componentVisualization.show()
			this.updateTheme()
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
		this.componentVisualization.show()
		this.updateTheme()
	}
}
