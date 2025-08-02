import * as SVG from "@svgdotjs/svg.js"
import {
	ChoiceProperty,
	ColorProperty,
	DirectionInfo,
	SliderProperty,
	CanvasController,
	SectionHeaderProperty,
	basicDirections,
	defaultBasicDirection,
	SnappingInfo,
	SnapDragHandler,
	ChoiceEntry,
	AdjustDragHandler,
	defaultStroke,
	SelectionController,
	NodeComponent,
	NodeSaveObject,
	getClosestPointerFromDirection,
	PropertyCategories,
} from "../internal"
import { resizeSVG, selectedBoxWidth } from "../utils/selectionHelper"

export type ShapeSaveObject = NodeSaveObject & {
	fill?: FillInfo
	stroke?: StrokeInfo
	size: SVG.Point
}

export type StrokeInfo = {
	width?: SVG.Number
	color?: string | "default"
	opacity?: number
	style?: string
}

export type FillInfo = {
	color?: string | "default"
	opacity?: number
}

export type StrokeStyle = ChoiceEntry & {
	dasharray: number[]
}

export const strokeStyleChoices: StrokeStyle[] = [
	{ key: "solid", name: "solid", dasharray: [1, 0] },
	{ key: "dotted", name: "dotted", dasharray: [1, 4] },
	{ key: "denselydotted", name: "densely dotted", dasharray: [1, 2] },
	{ key: "looselydotted", name: "loosely dotted", dasharray: [1, 8] },
	{ key: "dashed", name: "dashed", dasharray: [4, 4] },
	{ key: "denselydashed", name: "densely dashed", dasharray: [4, 2] },
	{ key: "looselydashed", name: "loosely dashed", dasharray: [4, 8] },
	{ key: "dashdot", name: "dash dot", dasharray: [4, 2, 1, 2] },
	{ key: "denselydashdot", name: "densely dash dot", dasharray: [4, 1, 1, 1] },
	{ key: "looselydashdot", name: "loosely dash dot", dasharray: [4, 4, 1, 4] },
	{ key: "dashdotdot", name: "dash dot dot", dasharray: [4, 2, 1, 2, 1, 2] },
	{ key: "denselydashdotdot", name: "densely dash dot dot", dasharray: [4, 1, 1, 1, 1, 1] },
	{ key: "looselydashdotdot", name: "loosely dash dot dot", dasharray: [4, 4, 1, 4, 1, 4] },
]
export const defaultStrokeStyleChoice = strokeStyleChoices[0]

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

export abstract class ShapeComponent extends NodeComponent {
	protected strokeInfo: StrokeInfo
	protected fillInfo: FillInfo

	protected fillColorProperty: ColorProperty
	protected fillOpacityProperty: SliderProperty
	protected strokeColorProperty: ColorProperty
	protected strokeOpacityProperty: SliderProperty
	protected strokeWidthProperty: SliderProperty
	protected strokeStyleProperty: ChoiceProperty<StrokeStyle>

	protected placePoint: SVG.Point

	public constructor() {
		super()
		this.resizeVisualizations = new Map<DirectionInfo, SVG.Element>()

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
		this.properties.add(PropertyCategories.fill, new SectionHeaderProperty("Fill"))

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

		this.properties.add(PropertyCategories.fill, this.fillColorProperty)
		this.properties.add(PropertyCategories.fill, this.fillOpacityProperty)

		this.properties.add(PropertyCategories.stroke, new SectionHeaderProperty("Stroke"))
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
		this.properties.add(PropertyCategories.stroke, this.strokeColorProperty)
		this.properties.add(PropertyCategories.stroke, this.strokeOpacityProperty)
		this.properties.add(PropertyCategories.stroke, this.strokeWidthProperty)
		this.properties.add(PropertyCategories.stroke, this.strokeStyleProperty)

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

	public toJson(): ShapeSaveObject {
		const data = super.toJson() as ShapeSaveObject
		data.size = this.size

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
		return data
	}

	protected update(): void {
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		let transformMatrix = this.getTransformMatrix()

		this.dragElement.size(this.size.x, this.size.y)
		this.dragElement.transform(transformMatrix)

		this.componentVisualization.size(
			this.size.x < strokeWidth ? 0 : this.size.x - strokeWidth,
			this.size.y < strokeWidth ? 0 : this.size.y - strokeWidth
		)
		this.defaultTextPosition = this.size.div(2)
		this.componentVisualization.transform(transformMatrix)

		this._bbox = this.dragElement.bbox().transform(transformMatrix)

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

				const directionTransformed = direction.direction.rotate(this.rotationDeg)

				let viz = resizeSVG()
				viz.node.style.cursor = getClosestPointerFromDirection(directionTransformed)
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
