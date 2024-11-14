import * as SVG from "@svgdotjs/svg.js"
import {
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	ComponentSaveObject,
	DirectionInfo,
	PositionedLabel,
	SliderProperty,
	TextProperty,
	CanvasController,
	SectionHeaderProperty,
	MathJaxProperty,
	basicDirections,
	defaultBasicDirection,
	SnappingInfo,
	SnapDragHandler,
	ChoiceEntry,
	SnapCursorController,
	AdjustDragHandler,
} from "../internal"
import { selectedBoxWidth } from "../utils/selectionHelper"

export type ShapeSaveObject = ComponentSaveObject & {
	rotationDeg?: number
	fill?: FillInfo
	stroke?: StrokeInfo
	label?: PositionedLabel
	name?: string
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

export abstract class ShapeComponent extends CircuitComponent {
	protected strokeInfo: StrokeInfo
	protected fillInfo: FillInfo

	protected shapeVisualization: SVG.Element
	protected size: SVG.Point

	protected dragElement: SVG.Element
	protected resizeVisualizations: Map<DirectionInfo, SVG.Element>

	protected fillColorProperty: ColorProperty
	protected fillOpacityProperty: SliderProperty
	protected strokeColorProperty: ColorProperty
	protected strokeOpacityProperty: SliderProperty
	protected strokeWidthProperty: SliderProperty
	protected strokeStyleProperty: ChoiceProperty<StrokeStyle>

	protected anchorChoice: ChoiceProperty<DirectionInfo>
	protected positionChoice: ChoiceProperty<DirectionInfo>

	protected placePoint: SVG.Point

	public constructor() {
		super()

		this.visualization = CanvasController.instance.canvas.group()
		this.resizeVisualizations = new Map<DirectionInfo, SVG.Element>()

		this.fillInfo = {
			color: "default",
			opacity: 0,
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
				this.fillInfo.opacity = 0
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
		SnapCursorController.instance.visible = true
		this.snappingPoints = []
		CanvasController.instance.canvas.add(this.visualization)
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate: -this.rotationDeg,
			origin: [this.position.x, this.position.y],
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
		this.resizable(!this.isResizing)
		this.resizable(!this.isResizing)
	}

	public flip(horizontal: boolean): void {
		this.rotationDeg = (horizontal ? 180 : 0) - this.rotationDeg
		this.simplifyRotationAngle()
		this.update()
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

		this._bbox = this.dragElement.bbox().transform(transformMatrix)

		this.relPosition = this.position.sub(new SVG.Point(this.bbox.x, this.bbox.y))
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updateLabelPosition()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let lineWidth = selectedBoxWidth.convertToUnit("px").value

			this.selectionElement
				.size(this.size.x + lineWidth, this.size.y + lineWidth)
				.center(this.position.x, this.position.y)
				.transform(this.getTransformMatrix())
		}
	}

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color
		if (strokeColor == "default") {
			strokeColor = "var(--bs-emphasis-color)"
		}

		let fillColor = this.fillInfo.color
		if (fillColor == "default") {
			fillColor = "none"
		}

		this.shapeVisualization.stroke({
			color: strokeColor,
			opacity: this.strokeInfo.opacity,
			width: this.strokeInfo.opacity == 0 ? 0 : this.strokeInfo.width.convertToUnit("px").value,
			dasharray: this.strokeStyleProperty.value.dasharray
				.map((factor) => this.strokeInfo.width.times(factor).toString())
				.join(" "),
		})
		this.shapeVisualization.fill({
			color: fillColor,
			opacity: this.fillInfo.opacity,
		})

		let labelColor = "var(--bs-emphasis-color)"
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

	public draggable(drag: boolean): void {
		if (drag) {
			this.dragElement.node.classList.add("draggable")
		} else {
			this.dragElement.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this, drag, this.dragElement)
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
}
