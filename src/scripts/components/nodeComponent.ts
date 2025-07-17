import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitikzComponent,
	CircuitikzSaveObject,
	clamp,
	ColorProperty,
	ComponentSymbol,
	defaultBasicDirection,
	DirectionInfo,
	ExportController,
	MainController,
	MathJaxProperty,
	PositionedLabel,
	SectionHeaderProperty,
	simpifyRotationAndScale,
	SliderProperty,
	SnapDragHandler,
	SnappingInfo,
	SnapPoint,
} from "../internal"
import { roundTikz, selectedBoxWidth } from "../utils/selectionHelper"

export type NodeSaveObject = CircuitikzSaveObject & {
	position: { x: number; y: number }
	label?: PositionedLabel
	rotation?: number
}

export class NodeComponent extends CircuitikzComponent {
	public anchorChoice: ChoiceProperty<DirectionInfo>
	public positionChoice: ChoiceProperty<DirectionInfo>

	constructor(symbol: ComponentSymbol) {
		super(symbol)
		this.position = new SVG.Point()
		this.relPosition = this.componentVariant.mid
		this.visualization.add(this.symbolUse)

		this.rotationDeg = 0

		{
			//label section
			this.propertiesHTMLRows.push(new SectionHeaderProperty("Label").buildHTML())

			this.mathJaxLabel = new MathJaxProperty()
			this.mathJaxLabel.addChangeListener((ev) => this.generateLabelRender())
			this.propertiesHTMLRows.push(this.mathJaxLabel.buildHTML())

			this.labelReferenceProperty = new ChoiceProperty(
				"Relative to",
				this.labelReferenceChoices,
				this.labelReferenceChoices[0]
			)
			this.labelReferenceProperty.addChangeListener((ev) => {
				this.updateLabelPosition()
			})
			this.propertiesHTMLRows.push(this.labelReferenceProperty.buildHTML())

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

		this.addName()
		this.addInfo()

		this.snappingPoints = this.componentVariant.pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))
		)
	}

	public getTransformMatrix(): SVG.Matrix {
		const symbolRel = this.componentVariant.mid
		return new SVG.Matrix({
			scaleX: this.scaleState.x,
			scaleY: this.scaleState.y,
			translate: [-symbolRel.x, -symbolRel.y],
			origin: [symbolRel.x, symbolRel.y],
		}).lmultiply(
			new SVG.Matrix({
				rotate: -this.rotationDeg,
				translate: [this.position.x, this.position.y],
			})
		)
	}

	public recalculateSnappingPoints(): void {
		super.recalculateSnappingPoints()
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints: this.snappingPoints,
			additionalSnappingPoints: [new SnapPoint(this, "center", this.componentVariant.mid)],
		}
	}

	protected updateOptions(): void {
		super.updateOptions()
		this.snappingPoints = this.componentVariant.pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))
		)
		this.update()
	}

	protected update() {
		let m = this.getTransformMatrix()
		this.symbolUse.transform(m)
		this._bbox = this.symbolBBox.transform(m)

		this.updateLabelPosition()

		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x, this._bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement.visible()) {
			// use the saved position instead of the bounding box (bbox position fails in safari)
			let bbox = this.symbolBBox
			let maxStroke = this.componentVariant.maxStroke

			this.selectionElement
				.size(bbox.w + maxStroke + selectedBoxWidth, bbox.h + maxStroke + selectedBoxWidth)
				.transform(
					this.getTransformMatrix().multiply(
						new SVG.Matrix({
							translate: [
								bbox.x - (selectedBoxWidth + maxStroke) / 2,
								bbox.y - (selectedBoxWidth + maxStroke) / 2,
							],
						})
					)
				)
		}
	}

	public moveTo(position: SVG.Point) {
		this.position = position.clone()
		this.update()
	}

	public rotate(angleDeg: number): void {
		this.rotationDeg += angleDeg
		this.simplifyRotationAngle()

		this.update()
	}

	public flip(horizontal: boolean): void {
		if (horizontal) {
			this.scaleState.y *= -1
			this.rotationDeg *= -1
		} else {
			this.scaleState.y *= -1
			this.rotationDeg = 180 - this.rotationDeg
		}
		this.simplifyRotationAngle()
		this.update()
	}

	public toJson(): NodeSaveObject {
		let data: NodeSaveObject = {
			type: "node",
			id: this.referenceSymbol.tikzName,
			position: this.position.simplifyForJson(),
		}
		if (this.componentVariant.options.length > 0) {
			data.options = this.componentVariant.options.map((option) => option.displayName ?? option.name)
		}
		if (this.rotationDeg !== 0) {
			data.rotation = this.rotationDeg
		}
		if (this.scaleState && (this.scaleState.x != 1 || this.scaleState.y != 1)) {
			data.scale = this.scaleState
		}
		if (this.name.value) {
			data.name = this.name.value
		}
		if (this.mathJaxLabel.value) {
			let labelWithoutRender: PositionedLabel = {
				value: this.mathJaxLabel.value,
				anchor: this.anchorChoice.value.key,
				position: this.positionChoice.value.key,
				relativeToComponent: this.labelReferenceProperty.value.key == "component",
				distance: this.labelDistance.value.value != 0 ? this.labelDistance.value : undefined,
				color: this.labelColor.value ? this.labelColor.value.toString() : undefined,
			}
			data.label = labelWithoutRender
		}

		return data
	}

	public toTikzString(): string {
		const optionsString = this.referenceSymbol.optionsToStringArray(this.optionsFromProperties()).join(", ")

		let id = this.name.value
		if (!id && this.mathJaxLabel.value) {
			id = ExportController.instance.createExportID("N")
		}

		let labelNodeStr = ""
		if (this.mathJaxLabel.value) {
			let labelStr = "anchor=" + this.anchorPos.name

			let labelDist = this.labelDistance.value.convertToUnit("cm")

			if (!isNaN(this.anchorPos.direction.absSquared())) {
				labelDist = labelDist.minus(0.12)
			}

			let labelShift = this.anchorPos.direction.mul(-labelDist.value)
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
					id + ".text"
				:	id + "." + this.labelPos.name
			let latexStr = this.mathJaxLabel.value ? "$" + this.mathJaxLabel.value + "$" : ""
			latexStr =
				latexStr && this.labelColor.value ?
					"\\textcolor" + this.labelColor.value.toTikzString() + "{" + latexStr + "}"
				:	latexStr

			labelNodeStr = " node[" + labelStr + "] at (" + posShift + posStr + "){" + latexStr + "}"
		}

		//don't change the order of scale and rotate!!! otherwise tikz render and UI are not the same
		let [rotation, scale] = simpifyRotationAndScale(this.rotationDeg, this.scaleState)

		return (
			"\\node[" +
			this.referenceSymbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(rotation !== 0 ? `, rotate=${rotation}` : "") +
			(scale.x != 1 ? `, xscale=${scale.x}` : "") +
			(scale.y != 1 ? `, yscale=${scale.y}` : "") +
			"] " +
			(id ? "(" + id + ") " : "") +
			"at " +
			this.position.toTikzString() +
			" {}" +
			labelNodeStr +
			";"
		)
	}
	public remove(): void {
		SnapDragHandler.snapDrag(this, false)
		this.visualization.remove()
		this.viewSelected(false)
		this.selectionElement?.remove()
		this.labelRendering?.remove()
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.visualization.node.classList.add("draggable")
		} else {
			this.visualization.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this, drag, this.symbolUse)
	}

	public resizable(resize: boolean): void {
		throw new Error("Method not implemented.")
	}
	protected recalculateResizePoints(): void {
		throw new Error("Method not implemented.")
	}

	public placeMove(pos: SVG.Point): void {
		this.moveTo(pos)
	}
	public placeRotate(angleDeg: number): void {
		this.rotate(angleDeg)
	}
	public placeFlip(horizontal: boolean): void {
		this.flip(horizontal)
	}
	public placeStep(pos: SVG.Point): boolean {
		this.moveTo(pos)
		return true
	}
	public placeFinish(): void {
		// make draggable
		this.draggable(true)
		this.update()
		this.finishedPlacing = true
	}

	public static fromJson(saveObject: NodeSaveObject): NodeComponent {
		let symbol = MainController.instance.symbols.find((symbol) => symbol.tikzName == saveObject.id)

		let backwards = false
		if (!symbol) {
			// only for backwards compatibility
			symbol = MainController.instance.symbols.find(
				(value, index, symbols) =>
					CircuitikzComponent.idNoOptions(saveObject.id) == CircuitikzComponent.idNoOptions(value.node.id)
			)
			backwards = true
		}

		let nodeComponent: NodeComponent = new NodeComponent(symbol)
		if (backwards) {
			// not working for all options (if key value pair is used)
			nodeComponent.setPropertiesFromOptions(symbol.getOptionsFromSymbolID(saveObject.id))
		} else {
			let options = saveObject.options ?? []
			nodeComponent.setPropertiesFromOptions(symbol.getOptionsFromOptionNames(options))
		}
		nodeComponent.moveTo(new SVG.Point(saveObject.position))

		if (saveObject.rotation) {
			nodeComponent.rotationDeg = saveObject.rotation
		}

		if (saveObject.scale) {
			nodeComponent.scaleState = new SVG.Point(saveObject.scale)
			nodeComponent.scaleProperty.updateValue(new SVG.Number(Math.abs(saveObject.scale.x)), true)
		}

		if (saveObject.name) {
			nodeComponent.name.updateValue(saveObject.name, true)
		}

		if (saveObject.label) {
			if (Object.hasOwn(saveObject.label, "value")) {
				nodeComponent.labelDistance.value =
					saveObject.label.distance ?
						new SVG.Number(saveObject.label.distance.value, saveObject.label.distance.unit)
					:	new SVG.Number(0, "cm")
				if (nodeComponent.labelDistance.value.unit == "") {
					nodeComponent.labelDistance.value.unit = "cm"
				}
				nodeComponent.labelDistance.updateHTML()
				nodeComponent.anchorChoice.value =
					saveObject.label.anchor ?
						basicDirections.find((item) => item.key == saveObject.label.anchor)
					:	defaultBasicDirection
				nodeComponent.anchorChoice.updateHTML()
				nodeComponent.positionChoice.value =
					saveObject.label.position ?
						basicDirections.find((item) => item.key == saveObject.label.position)
					:	defaultBasicDirection
				nodeComponent.positionChoice.updateHTML()
				nodeComponent.labelReferenceProperty.value =
					saveObject.label.relativeToComponent ?
						nodeComponent.labelReferenceChoices[1]
					:	nodeComponent.labelReferenceChoices[0]
				nodeComponent.labelReferenceProperty.updateHTML()
				nodeComponent.mathJaxLabel.value = saveObject.label.value
				nodeComponent.mathJaxLabel.updateHTML()
				nodeComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
				nodeComponent.labelColor.updateHTML()
				nodeComponent.generateLabelRender()
			} else {
				//@ts-ignore
				nodeComponent.mathJaxLabel.value = saveObject.label
			}
		}
		nodeComponent.placeFinish()

		return nodeComponent
	}

	public copyForPlacement(): NodeComponent {
		let newComponent = new NodeComponent(this.referenceSymbol)
		newComponent.rotationDeg = this.rotationDeg
		newComponent.scaleState = new SVG.Point(this.scaleState)
		return newComponent
	}

	private anchorPos: DirectionInfo
	private labelPos: DirectionInfo
	public updateLabelPosition(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		let textPos: SVG.Point
		let ref: SVG.Point

		// get relevant positions and bounding boxes
		let bboxHalfSize = new SVG.Point(this.symbolBBox.w / 2, this.symbolBBox.h / 2)
		let textDir: SVG.Point // normalized direction to bbox size
		let textPosNoTransform: SVG.Point // relative to the upper left corner in local coordinates
		// get the position of the label
		if (this.positionChoice.value.key == defaultBasicDirection.key) {
			textPosNoTransform = this.componentVariant.textPosition.point.add(this.componentVariant.mid)
			textDir = textPosNoTransform.sub(bboxHalfSize).div(bboxHalfSize)
		} else {
			if (this.labelReferenceProperty.value.key == "canvas") {
				// the component should be placed absolute to the canvas
				//reverse local transform effect
				textDir = this.positionChoice.value.direction.transform(
					new SVG.Matrix({
						rotate: -this.rotationDeg,
						scaleX: this.scaleState.x,
						scaleY: this.scaleState.y,
					}).inverse()
				)
				// check which label direction should be used to get the final correct direction
				textDir = textDir.div(textDir.abs())
				textDir.x = Math.round(textDir.x)
				textDir.y = Math.round(textDir.y)
			} else {
				// just use whatever is selected
				textDir = this.positionChoice.value.direction
			}

			textPosNoTransform = bboxHalfSize.add(bboxHalfSize.mul(textDir))
		}
		this.labelPos = basicDirections.find((item) => item.direction.eq(textDir))
		textPos = textPosNoTransform.transform(transformMatrix)
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelRef: SVG.Point
		let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
		if (this.anchorChoice.value.key == defaultBasicDirection.key) {
			labelRef = textDir.mul(-1)
			//transform anchor direction back to global coordinates
			labelRef = labelRef.transform(
				new SVG.Matrix({
					rotate: -this.rotationDeg,
					scaleX: this.scaleState.x,
					scaleY: this.scaleState.y,
				})
			)

			// check which direction should be used to get the final correct direction
			labelRef = labelRef.div(labelRef.abs())
			labelRef.x = Math.round(labelRef.x)
			labelRef.y = Math.round(labelRef.y)

			this.anchorPos = basicDirections.find((item) => item.direction.eq(labelRef))
		} else {
			// an explicit anchor was selected
			this.anchorPos = this.anchorChoice.value
			labelRef = this.anchorPos.direction
		}

		ref = labelRef
			.add(1)
			.div(2)
			.mul(new SVG.Point(labelBBox.w, labelBBox.h))
			.add(new SVG.Point(labelBBox.x, labelBBox.y))
			.add(labelRef.mul(labelDist))

		// acutally move the label
		let movePos = textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({ translate: [movePos.x, movePos.y] }))
	}
}
