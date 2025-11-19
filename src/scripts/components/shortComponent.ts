import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	SnapPoint,
	SnapDragHandler,
	SnappingInfo,
	SliderProperty,
	SectionHeaderProperty,
	defaultStroke,
	SelectionController,
	PathComponent,
	ChoiceProperty,
	PathSaveObject,
	PathLabelable,
	InfoProperty,
	CircuitComponent,
	PropertyCategories,
	TikzPathCommand,
	CircuitikzTo,
	buildTikzStringFromPathCommand,
	Currentable,
	EnvironmentVariableController,
	Pole,
	PoleEntry,
	poleChoices,
} from "../internal"
import { lineRectIntersection, selectionSize } from "../utils/selectionHelper"

export type ShortSaveObject = PathSaveObject & {
	poles?: Pole
	scale?: number
}

export class ShortComponent extends Currentable(PathLabelable(PathComponent)) {
	private static jsonID = "short"
	static {
		CircuitComponent.jsonSaveMap.set(ShortComponent.jsonID, ShortComponent)
	}

	declare public componentVisualization: SVG.Line
	private lineSelection: SVG.Line
	private dragline: SVG.Line

	private poleStartElement: SVG.Element
	private poleEndElement: SVG.Element

	private scaleProperty: SliderProperty

	private rotationDeg: number = 0

	private poleStart: ChoiceProperty<PoleEntry>
	private poleEnd: ChoiceProperty<PoleEntry>

	constructor() {
		super()

		this.scaleProperty = new SliderProperty(
			"Scale",
			0.1,
			10,
			0.01,
			new SVG.Number(1),
			true,
			undefined,
			"manipulation:scale"
		)
		this.scaleProperty.addChangeListener((ev) => {
			this.update()
			this.updatePoles()
		})
		this.properties.add(PropertyCategories.manipulation, this.scaleProperty)

		this.properties.add(
			PropertyCategories.options,
			new SectionHeaderProperty("Poles", undefined, "options:poles_header")
		)
		this.poleStart = new ChoiceProperty<PoleEntry>(
			"Start",
			poleChoices,
			poleChoices[0],
			undefined,
			"options:poles_start"
		)
		this.poleEnd = new ChoiceProperty<PoleEntry>("End", poleChoices, poleChoices[0], undefined, "options:poles_end")
		this.poleStart.addChangeListener((ev) => {
			this.updatePoles()
		})
		this.poleEnd.addChangeListener((ev) => {
			this.updatePoles()
		})
		this.properties.add(PropertyCategories.options, this.poleStart)
		this.properties.add(PropertyCategories.options, this.poleEnd)

		this.componentVisualization = CanvasController.instance.canvas
			.line()
			.fill("none")
			.stroke({ color: defaultStroke, width: 0.5 })

		this.displayName = "Short"

		this.dragline = CanvasController.instance.canvas
			.line()
			.fill("none")
			.stroke({ width: selectionSize, color: "transparent" })

		this.selectionElement.remove()
		this.selectionElement = CanvasController.instance.canvas.group()
		this.lineSelection = CanvasController.instance.canvas.line().fill("none")
		this.selectionElement.add(this.lineSelection)

		this.selectionElement.hide()

		this.visualization.add(this.componentVisualization)
		this.visualization.add(this.dragline)
		this.visualization.hide()

		this.addInfo()

		this.snappingPoints = [
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			new SnapPoint(this, null, new SVG.Point(0, 0)),
		]
	}

	protected updateCurrentRender(): void {
		this.currentArrowRendering?.remove()
		if (this.currentLabel.value != "") {
			let currentArrow = this.generateCurrentArrow(
				this.referencePoints[0],
				this.referencePoints[1],
				new SVG.Point(),
				new SVG.Point(),
				new SVG.Point(this.scaleProperty.value.value, this.scaleProperty.value.value),
				{ isShort: true }
			)
			this.currentArrowRendering = currentArrow.arrow
			this.currentRendering.add(this.currentArrowRendering)

			const currentLabelBbox = this.currentLabelRendering.bbox()
			const currentLabelReference = new SVG.Point(currentLabelBbox.cx, currentLabelBbox.cy).add(
				new SVG.Point(currentLabelBbox.w / 2, currentLabelBbox.h / 2).mul(currentArrow.labelAnchorDir)
			)
			this.currentLabelRendering.transform(
				new SVG.Matrix({ translate: currentArrow.labelPos.sub(currentLabelReference) })
			)
		}
	}

	protected addInfo() {
		this.properties.add(PropertyCategories.info, new SectionHeaderProperty("Info"))
		this.properties.add(PropertyCategories.info, new InfoProperty("ID", "short"))
	}

	public moveStartTo(position: SVG.Point) {
		this.referencePoints[0] = position
		this.update()
	}

	public moveEndTo(position: SVG.Point) {
		this.referencePoints[1] = position
		this.update()
	}

	public flip(horizontal: boolean): void {
		let newPos1 = new SVG.Point(this.referencePoints[0].x, this.referencePoints[1].y)
		let newPos2 = new SVG.Point(this.referencePoints[1].x, this.referencePoints[0].y)
		if (horizontal) {
			this.referencePoints[0] = newPos1
			this.referencePoints[1] = newPos2
		} else {
			this.referencePoints[0] = newPos2
			this.referencePoints[1] = newPos1
		}

		this.update()
	}

	public recalculateSnappingPoints(): void {
		const inverseTransform = this.getTransformMatrix().inverse()
		this.snappingPoints[0].updateRelPosition(this.referencePoints[0].transform(inverseTransform))
		this.snappingPoints[1].updateRelPosition(this.referencePoints[1].transform(inverseTransform))
		super.recalculateSnappingPoints()
	}

	private updatePoles() {
		this.poleStartElement?.remove()
		this.poleEndElement?.remove()
		this.poleStartElement = null
		this.poleEndElement = null

		if (this.poleStart.value.key != "none") {
			this.poleStartElement = CanvasController.instance.canvas.use("node_" + this.poleStart.value.key)
			this.visualization.add(this.poleStartElement)
		}

		if (this.poleEnd.value.key != "none") {
			this.poleEndElement = CanvasController.instance.canvas.use("node_" + this.poleEnd.value.key)
			this.visualization.add(this.poleEndElement)
		}

		this.updatePolePositions()
	}
	private updatePolePositions() {
		if (this.poleStartElement) {
			const bbox = this.poleStartElement.bbox()
			const point = new SVG.Point(bbox.w / 2, bbox.h / 2)
			this.poleStartElement.transform(
				new SVG.Matrix({
					scale: this.scaleProperty.value.value,
					translate: point.mul(-1),
					origin: point,
				}).lmultiply({ translate: this.referencePoints[0] })
			)
		}
		if (this.poleEndElement) {
			const bbox = this.poleEndElement.bbox()
			const point = new SVG.Point(bbox.w / 2, bbox.h / 2)
			this.poleEndElement.transform(
				new SVG.Matrix({
					scale: this.scaleProperty.value.value,
					translate: point.mul(-1),
					origin: point,
				}).lmultiply({ translate: this.referencePoints[1] })
			)
		}
	}

	public getSnappingInfo(): SnappingInfo {
		if (this.finishedPlacing) {
			return {
				trackedSnappingPoints: this.snappingPoints,
				additionalSnappingPoints: [],
			}
		} else {
			return {
				trackedSnappingPoints: [],
				additionalSnappingPoints:
					this.referencePoints.length > 0 ? [new SnapPoint(this, "", new SVG.Point())] : [],
			}
		}
	}

	public update(): void {
		this.position = this.referencePoints[0].add(this.referencePoints[1]).div(2)

		const angle = Math.atan2(
			this.referencePoints[0].y - this.referencePoints[1].y,
			this.referencePoints[1].x - this.referencePoints[0].x
		)
		this.rotationDeg = (angle * 180) / Math.PI

		this.recalculateResizePoints()
		this.componentVisualization.plot(
			this.referencePoints[0].x,
			this.referencePoints[0].y,
			this.referencePoints[1].x,
			this.referencePoints[1].y
		)

		this.lineSelection.plot(
			this.referencePoints[0].x,
			this.referencePoints[0].y,
			this.referencePoints[1].x,
			this.referencePoints[1].y
		)
		this.dragline.plot(
			this.referencePoints[0].x,
			this.referencePoints[0].y,
			this.referencePoints[1].x,
			this.referencePoints[1].y
		)

		this.updatePolePositions()

		this.updatePathLabel()
		this.updateCurrentRender()
		this._bbox = this.visualization.bbox()
		this.referencePosition = this.position.sub(new SVG.Point(this._bbox.x, this._bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	protected recalculateSelectionVisuals(): void {}

	public viewSelected(show: boolean): void {
		super.viewSelected(show)
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
	}

	/**
	 * For tikz path symbols, this getTransformMatrix returns the transformation necessary for the symbol from local symbol coodinates to world coordinates
	 */
	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix().lmultiply(
			new SVG.Matrix({
				rotate: -this.rotationDeg,
				translate: [this.position.x, this.position.y],
			})
		)
	}

	public updateTheme() {
		let labelColor = defaultStroke
		if (this.labelColor && this.labelColor.value) {
			labelColor = this.labelColor.value.toString()
		}
		this.labelRendering?.fill(labelColor)
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		return lineRectIntersection(this.componentVisualization, selectionRectangle)
	}

	public toJson(): ShortSaveObject {
		let data = super.toJson() as ShortSaveObject
		data.type = ShortComponent.jsonID

		if (this.scaleProperty.value.value != 1) {
			data.scale = this.scaleProperty.value.value
		}

		if (this.poleStartElement || this.poleEndElement) {
			const poles: Pole = {
				start: this.poleStart.value.key != "none" ? this.poleStart.value.key : undefined,
				end: this.poleEnd.value.key != "none" ? this.poleEnd.value.key : undefined,
			}
			data.poles = poles
		}

		return data
	}

	public toTikzString(): string {
		let command: TikzPathCommand = {
			options: ["draw"],
			additionalNodes: [],
			coordinates: [],
			connectors: [],
		}
		this.buildTikzCommand(command)
		return buildTikzStringFromPathCommand(command)
	}

	protected buildTikzCommand(command: TikzPathCommand): void {
		super.buildTikzCommand(command)
		let options: string[] = ["short"]

		if (this.poleStartElement || this.poleEndElement) {
			if (this.poleStart.value.shortcut != null && this.poleEnd.value.shortcut != null) {
				options.push(this.poleStart.value.shortcut + "-" + this.poleEnd.value.shortcut)
			} else {
				options.push("bipole nodes={" + this.poleStart.value.key + "}{" + this.poleEnd.value.key + "}")
			}
		}

		const scaleFactor =
			this.scaleProperty.value.value != 1 ? new SVG.Number(this.scaleProperty.value.value * 1.4, "cm") : undefined
		if (scaleFactor) {
			options.push("/tikz/circuitikz/bipoles/length=" + scaleFactor.value.toPrecision(3) + scaleFactor.unit)
		}

		let to: CircuitikzTo = { options: options }
		this.buildTikzPathLabel(to)
		this.buildTikzCurrent(to)
		command.connectors.push(to)
	}

	public remove(): void {
		SnapDragHandler.snapDrag(this, false)
		this.resizable(false)
		this.viewSelected(false)
		this.visualization.remove()
		this.selectionElement?.remove()
		this.labelRendering?.remove()
	}

	public copyForPlacement(): ShortComponent {
		return new ShortComponent()
	}

	protected static idNoOptions(id: string): string {
		return id.split("_").slice(0, 2).join("_")
	}

	public applyJson(saveObject: ShortSaveObject): void {
		super.applyJson(saveObject)

		if (saveObject.poles) {
			if (saveObject.poles.start != undefined) {
				this.poleStart.value = poleChoices.find((choice) => choice.key == saveObject.poles.start)
			}
			if (saveObject.poles.end != undefined) {
				this.poleEnd.value = poleChoices.find((choice) => choice.key == saveObject.poles.end)
			}
		}

		if (saveObject.scale) {
			this.scaleProperty.value = new SVG.Number(saveObject.scale)
		}

		this.update()
		this.visualization.show()
		this.updatePoles()
	}

	public static fromJson(saveObject: ShortSaveObject): ShortComponent {
		return new ShortComponent()
	}

	public updatePathLabel(): void {
		if (!this.mathJaxLabel || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		// breaking points where the label is parallel to the path or to the x axis. in degrees
		let breakVertical = 70
		let breakHorizontal = 21

		const globalSettings = EnvironmentVariableController.instance.getGlobalSettings().labelOrientation

		let pathDiff = this.referencePoints[1].sub(this.referencePoints[0])

		// the bounding boxes for the label and the symbol
		let labelBBox = labelSVG.bbox()
		let labelHalfSize = new SVG.Point(labelBBox.w, labelBBox.h).div(2)
		let symbolBBox = this.componentVisualization.bbox()
		let symbolHalfSize = new SVG.Point(symbolBBox.w, symbolBBox.h).div(2)

		// the nominal reference point of the label (bottom center)
		let labelRef = new SVG.Point(labelBBox.cx, labelBBox.y2)
		// the rotation angle of the label (not always identical to the path rotation angle)
		let rotAngle = this.rotationDeg
		if (rotAngle > 90 || rotAngle < -90) {
			// left halfplane -> don't show label upside down -> rotate the label by additional 180 deg
			rotAngle += 180
			// the dafault label reference point should now be the top center
			labelRef.y = labelBBox.y
		}

		// mirroring the symbol should not impact the label except from shifting its position to stay close to the symbol (only relevant for asymetric symbols)
		let referenceoffsetY = (this.labelSide.value ? -1 : 1) * -this.scaleProperty.value.value * 4

		// nominally the reference point of the symbol is its center (w.r.t. the x coordinate for a path which is horizontal)
		let referenceOffsetX = 0

		let other = this.labelSide.value ? -1 : 1
		if (other < 0) {
			labelRef.y = labelBBox.y - labelRef.y
			referenceoffsetY += symbolBBox.h
		}

		if (globalSettings != "rotate") {
			if (globalSettings == "straight") {
				breakHorizontal = 46
				breakVertical = 46
			}

			// if the path is close to horizontal or vertical according to the break points
			let nearHorizontal =
				Math.abs(this.rotationDeg) < breakHorizontal || Math.abs(this.rotationDeg) > 180 - breakHorizontal
			let nearVertical =
				Math.abs(this.rotationDeg) > breakVertical && Math.abs(this.rotationDeg) < 180 - breakVertical

			if (nearHorizontal) {
				// the label should not be rotated w.r.t. the x axis
				rotAngle = 0
				let right = Math.sign(pathDiff.x)
				let up = Math.sign(this.rotationDeg)
				//the offset where the rotation pivot point should lie (for both label and symbol)
				let horizontalOffset = Math.min(labelHalfSize.x, symbolHalfSize.x) * up
				referenceOffsetX = horizontalOffset * right * other
				labelRef.x += horizontalOffset * other
			} else if (nearVertical) {
				// the label should not be rotated w.r.t. the x axis
				rotAngle = 0
				let right = Math.sign(pathDiff.x)
				let up = Math.sign(this.rotationDeg)
				//the offset where the rotation pivot point should lie (for both label and symbol)
				let verticalOffset = Math.min(labelHalfSize.y, symbolHalfSize.x) * right * other

				referenceOffsetX = -verticalOffset * up

				labelRef.y = labelBBox.cy + verticalOffset
				labelRef.x += labelHalfSize.x * (up * other)
			}
		}

		referenceoffsetY -= other * (this.labelDistance.value ? this.labelDistance.value.convertToUnit("px").value : 0)

		// where the anchor point of the symbol is located relative to the midAbs point
		let referenceOffset = new SVG.Point(referenceOffsetX, referenceoffsetY).transform(
			new SVG.Matrix({
				rotate: -this.rotationDeg,
			})
		)

		// actually move and rotate the label to the correct position
		let compRef = this.position.add(referenceOffset)
		let movePos = compRef.sub(labelRef)
		labelSVG.transform({
			rotate: -rotAngle,
			ox: labelRef.x,
			oy: labelRef.y,
			translate: [movePos.x, movePos.y],
		})
	}
}
