import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	CircuitikzComponent,
	CircuitikzSaveObject,
	ComponentSymbol,
	MainController,
	SnapController,
	SnapCursorController,
	SnapPoint,
	AdjustDragHandler,
	SnapDragHandler,
	Label,
	Undo,
	SnappingInfo,
	BooleanProperty,
	MathJaxProperty,
	SliderProperty,
	SectionHeaderProperty,
	ColorProperty,
	defaultStroke,
	SelectionController,
} from "../internal"
import {
	lineRectIntersection,
	pointInsideRect,
	selectedBoxWidth,
	selectionColor,
	resizeSVG,
	referenceColor,
	roundTikz,
	selectionSize,
} from "../utils/selectionHelper"

export type PathLabel = Label & {
	otherSide?: boolean
}

export type PathSaveObject = CircuitikzSaveObject & {
	start: { x: number; y: number }
	end: { x: number; y: number }
	label?: PathLabel
}

export type PathOrientation = {
	mirror: boolean
	invert: boolean
}

export class PathComponent extends CircuitikzComponent {
	private posStart: SVG.Point
	private posEnd: SVG.Point

	private startLine: SVG.Line
	private endLine: SVG.Line
	private startLineSelection: SVG.Line
	private endLineSelection: SVG.Line
	private selectionRect: SVG.Rect
	private dragStartLine: SVG.Line
	private dragEndLine: SVG.Line
	private relSymbolStart: SVG.Point
	private relSymbolEnd: SVG.Point

	private pointsPlaced: 0 | 1 | 2 = 0

	private startSVG: SVG.Element
	private endSVG: SVG.Element

	private mirror: BooleanProperty
	private invert: BooleanProperty

	private labelSide: BooleanProperty

	constructor(symbol: ComponentSymbol) {
		super(symbol)
		SnapCursorController.instance.visible = true

		let startPinIndex = this.componentVariant.pins.findIndex((value) => value.name === "START")
		let endPinIndex = this.componentVariant.pins.findIndex((value) => value.name === "END")

		this.relSymbolStart = this.componentVariant.pins.at(startPinIndex).point
		this.relSymbolEnd = this.componentVariant.pins.at(endPinIndex).point

		this.startLine = CanvasController.instance.canvas
			.line()
			.fill("none")
			.stroke({ color: defaultStroke, width: 0.5 })
		this.endLine = this.startLine.clone(true)

		this.dragStartLine = CanvasController.instance.canvas
			.line()
			.fill("none")
			.stroke({ width: selectionSize, color: "transparent" })
		this.dragEndLine = this.dragStartLine.clone(true)

		this.selectionElement.remove()
		this.selectionElement = CanvasController.instance.canvas.group()
		this.startLineSelection = CanvasController.instance.canvas.line().fill("none")
		this.endLineSelection = CanvasController.instance.canvas.line().fill("none")
		this.selectionRect = CanvasController.instance.canvas.rect(0, 0).fill("none")
		this.selectionElement.add(this.selectionRect)
		this.selectionElement.add(this.startLineSelection)
		this.selectionElement.add(this.endLineSelection)

		this.selectionElement.hide()

		this.visualization.add(this.symbolUse)
		this.visualization.add(this.startLine)
		this.visualization.add(this.endLine)
		this.visualization.add(this.dragStartLine)
		this.visualization.add(this.dragEndLine)
		this.visualization.hide()

		{
			//label section
			this.propertiesHTMLRows.push(new SectionHeaderProperty("Label").buildHTML())

			this.mathJaxLabel = new MathJaxProperty()
			this.mathJaxLabel.addChangeListener((ev) => this.generateLabelRender())
			this.propertiesHTMLRows.push(this.mathJaxLabel.buildHTML())

			this.labelDistance = new SliderProperty("Gap", -0.5, 1, 0.01, new SVG.Number(0.12, "cm"))
			this.labelDistance.addChangeListener((ev) => this.updateLabelPosition())
			this.propertiesHTMLRows.push(this.labelDistance.buildHTML())

			this.labelColor = new ColorProperty("Color", null)
			this.labelColor.addChangeListener((ev) => {
				this.updateTheme()
			})
			this.propertiesHTMLRows.push(this.labelColor.buildHTML())

			this.labelSide = new BooleanProperty("Switch side")
			this.labelSide.addChangeListener((ev) => this.updateLabelPosition())
			this.propertiesHTMLRows.push(this.labelSide.buildHTML())
		}

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Symbol Orientation").buildHTML())

		this.mirror = new BooleanProperty("Mirror", false)
		this.mirror.addChangeListener((ev) => {
			this.scaleState.y *= -1
			this.update()
		})
		this.propertiesHTMLRows.push(this.mirror.buildHTML())

		this.invert = new BooleanProperty("Invert", false)
		this.invert.addChangeListener((ev) => {
			this.scaleState.x *= -1
			this.update()
		})
		this.propertiesHTMLRows.push(this.invert.buildHTML())

		this.addName()
		this.addInfo()

		this.snappingPoints = [
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			...this.componentVariant.pins
				.filter((_, index) => !(index == startPinIndex || index == endPinIndex))
				.map((pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))),
		]
	}

	public moveTo(position: SVG.Point): void {
		let diff = position.sub(this.position)
		this.posStart = diff.add(this.posStart)
		this.posEnd = diff.add(this.posEnd)
		this.update()
	}

	public moveStartTo(position: SVG.Point) {
		this.posStart = position
		this.update()
	}

	public moveEndTo(position: SVG.Point) {
		this.posEnd = position
		this.update()
	}

	public rotate(angleDeg: number): void {
		this.posStart = this.posStart.rotate(angleDeg, this.position)
		this.posEnd = this.posEnd.rotate(angleDeg, this.position)
		this.update()
	}
	public flip(horizontal: boolean): void {
		let newPos1 = new SVG.Point(this.posStart.x, this.posEnd.y)
		let newPos2 = new SVG.Point(this.posEnd.x, this.posStart.y)
		if (horizontal) {
			this.posStart = newPos1
			this.posEnd = newPos2
		} else {
			this.posStart = newPos2
			this.posEnd = newPos1
		}
		this.mirror.updateValue(!this.mirror.value, true)

		this.update()
	}

	public recalculateSnappingPoints(): void {
		const inverseTransform = this.getTransformMatrix().inverse()
		this.snappingPoints[0].updateRelPosition(this.posStart.transform(inverseTransform))
		this.snappingPoints[1].updateRelPosition(this.posEnd.transform(inverseTransform))
		super.recalculateSnappingPoints()
	}

	protected updateOptions(): void {
		super.updateOptions()
		let startPinIndex = this.componentVariant.pins.findIndex((value) => value.name === "START")
		let endPinIndex = this.componentVariant.pins.findIndex((value) => value.name === "END")
		this.snappingPoints = [
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			...this.componentVariant.pins
				.filter((_, index) => !(index == startPinIndex || index == endPinIndex))
				.map((pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))),
		]
		this.update()
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
				additionalSnappingPoints: this.pointsPlaced > 0 ? [new SnapPoint(this, "", new SVG.Point())] : [],
			}
		}
	}

	protected update(): void {
		this.position = this.posStart.add(this.posEnd).div(2)

		const angle = Math.atan2(this.posStart.y - this.posEnd.y, this.posEnd.x - this.posStart.x)
		this.rotationDeg = (angle * 180) / Math.PI

		let m = this.getTransformMatrix()
		this.symbolUse.transform(m)

		let startEnd = this.relSymbolStart.add(this.componentVariant.mid).transform(m)
		let endStart = this.relSymbolEnd.add(this.componentVariant.mid).transform(m)

		if (this.invert.value) {
			let switchPos = startEnd
			startEnd = endStart
			endStart = switchPos
		}

		this.recalculateResizePoints()
		this.startLine.plot(this.posStart.x, this.posStart.y, startEnd.x, startEnd.y)
		this.endLine.plot(this.posEnd.x, this.posEnd.y, endStart.x, endStart.y)
		this.startLineSelection.plot(this.posStart.x, this.posStart.y, startEnd.x, startEnd.y)
		this.endLineSelection.plot(this.posEnd.x, this.posEnd.y, endStart.x, endStart.y)
		this.dragStartLine.plot(this.posStart.x, this.posStart.y, startEnd.x, startEnd.y)
		this.dragEndLine.plot(this.posEnd.x, this.posEnd.y, endStart.x, endStart.y)

		this.updateLabelPosition()
		this._bbox = this.visualization.bbox()
		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x, this._bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			// use the saved position instead of the bounding box (bbox position fails in safari)
			let bbox = this.symbolBBox
			this.selectionRect
				.size(bbox.w + selectedBoxWidth, bbox.h + selectedBoxWidth)
				.transform(this.getTransformMatrix())
		}
	}

	public viewSelected(show: boolean): void {
		super.viewSelected(show)
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
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

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		if (this.pointsPlaced < 2) {
			return false
		}
		// if 1 of the 2 lines hanging of the symbol intersect the selection rect -> should select
		if (
			lineRectIntersection(this.startLine, selectionRectangle) ||
			lineRectIntersection(this.endLine, selectionRectangle)
		) {
			return true
		}

		const bbox = this.symbolBBox
		// get the corner points of the bounding box and rotate each of them to their proper positions
		const transform = this.getTransformMatrix()
		const boxPoints = [
			new SVG.Point(bbox.x, bbox.y).transform(transform),
			new SVG.Point(bbox.x2, bbox.y).transform(transform),
			new SVG.Point(bbox.x2, bbox.y2).transform(transform),
			new SVG.Point(bbox.x, bbox.y2).transform(transform),
		]

		// if all of these points are inside the selection rect -> should select
		if (boxPoints.map((value) => pointInsideRect(value, selectionRectangle)).every((value) => value)) {
			return true
		}

		//necessary to check if the complete selection rect is inside the component
		let selectionRectInside = true

		// if at least one line defined by 2 of the 4 corner points intersects the selection rect -> should select
		for (let index = 0; index < boxPoints.length; index++) {
			const p1 = boxPoints[index]
			const p2 = boxPoints[(index + 1) % boxPoints.length]
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
			} else {
				selectionRectInside =
					selectionRectInside &&
					p2.sub(p1).rotate(-90).dot(new SVG.Point(selectionRectangle.cx, selectionRectangle.cy).sub(p1)) > 0
			}
		}

		// no intersection between the selection rect and the component or selection rect inside component
		return selectionRectInside
	}

	public toJson(): PathSaveObject {
		let data: PathSaveObject = {
			type: "path",
			id: this.componentVariant.symbol.id(),
			start: this.posStart.simplifyForJson(),
			end: this.posEnd.simplifyForJson(),
		}

		if (this.name.value) {
			data.name = this.name.value
		}

		if (this.mathJaxLabel.value) {
			let label: PathLabel = {
				value: this.mathJaxLabel.value,
				otherSide: this.labelSide.value ? true : undefined,
				distance: this.labelDistance.value.value != 0 ? this.labelDistance.value : undefined,
				color: this.labelColor.value ? this.labelColor.value.toString() : undefined,
			}
			data.label = label
		}

		if (this.scaleState && (this.scaleState.x != 1 || this.scaleState.y != 1)) {
			data.scale = this.scaleState
		}

		return data
	}
	public toTikzString(): string {
		const optionsString = this.referenceSymbol.optionsToStringArray(this.optionsFromProperties()).join(", ")

		let distStr = roundTikz(this.labelDistance.value.convertToUnit("cm").minus(0.1).value) + "cm"
		let shouldDist = this.labelDistance.value && distStr != "0.0cm"

		const scaleFactor =
			this.scaleProperty.value.value != 1 ? new SVG.Number(this.scaleProperty.value.value * 1.4, "cm") : undefined

		let latexStr = this.mathJaxLabel.value ? "$" + this.mathJaxLabel.value + "$" : ""
		latexStr =
			latexStr && this.labelColor.value ?
				"\\textcolor" + this.labelColor.value.toTikzString() + "{" + latexStr + "}"
			:	latexStr
		return (
			"\\draw " +
			this.posStart.toTikzString() +
			" to[" +
			this.referenceSymbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(this.name.value === "" ? "" : ", name=" + this.name.value) +
			(this.mathJaxLabel.value !== "" ?
				", l" +
				(this.labelSide.value ? "_" : "") +
				"={" +
				latexStr +
				"}" +
				(shouldDist ? ", label distance=" + distStr : "")
			:	"") +
			(this.mirror.value ? ", mirror" : "") +
			(this.invert.value ? ", invert" : "") +
			(scaleFactor ?
				",/tikz/circuitikz/bipoles/length=" + scaleFactor.value.toPrecision(3) + scaleFactor.unit
			:	"") +
			"] " +
			this.posEnd.toTikzString() +
			";"
		)
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		const copiedSVG = super.toSVG(defs)
		for (const line of copiedSVG.find("line.draggable")) {
			copiedSVG.removeElement(line)
		}
		return copiedSVG
	}

	public remove(): void {
		SnapDragHandler.snapDrag(this, false)
		if (this.startSVG) {
			AdjustDragHandler.snapDrag(this, this.startSVG, false)
			this.startSVG.remove()
		}
		if (this.endSVG) {
			AdjustDragHandler.snapDrag(this, this.endSVG, false)
			this.endSVG.remove()
		}
		this.selectionElement?.remove()
		this.resizable(false)
		this.visualization.remove()
		this.viewSelected(false)
		this.labelRendering?.remove()
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.symbolUse.node.classList.add("draggable")
			this.dragStartLine.node.classList.add("draggable")
			this.dragEndLine.node.classList.add("draggable")
		} else {
			this.symbolUse.node.classList.remove("draggable")
			this.dragStartLine.node.classList.add("draggable")
			this.dragEndLine.node.classList.add("draggable")
		}
		SnapDragHandler.snapDrag(this, drag)
	}

	protected recalculateResizePoints(): void {
		this.startSVG?.center(this.posStart.x, this.posStart.y)
		this.endSVG?.center(this.posEnd.x, this.posEnd.y)
	}

	public resizable(resize: boolean): void {
		if (this.isResizing == resize) {
			return
		}
		this.isResizing = resize
		if (resize) {
			this.startSVG = resizeSVG()
			this.startSVG.node.style.cursor = "move"

			this.endSVG = resizeSVG()
			this.endSVG.node.style.cursor = "move"

			let startPos: SVG.Point
			let endPos: SVG.Point
			AdjustDragHandler.snapDrag(this, this.startSVG, true, {
				dragStart: (pos) => {
					startPos = this.posStart
				},
				dragMove: (pos) => {
					this.moveStartTo(pos)
				},
				dragEnd: () => {
					return startPos.eq(this.posStart)
				},
			})
			AdjustDragHandler.snapDrag(this, this.endSVG, true, {
				dragStart: (pos) => {
					endPos = this.posEnd
				},
				dragMove: (pos) => {
					this.moveEndTo(pos)
				},
				dragEnd: () => {
					return endPos.eq(this.posEnd)
				},
			})
		} else {
			AdjustDragHandler.snapDrag(this, this.startSVG, false)
			AdjustDragHandler.snapDrag(this, this.endSVG, false)
			this.startSVG?.remove()
			this.endSVG?.remove()
		}
		this.update()
	}

	public placeMove(pos: SVG.Point): void {
		SnapCursorController.instance.moveTo(pos)
		if (this.pointsPlaced == 1) {
			this.moveEndTo(pos)
		}
	}
	public placeStep(pos: SVG.Point): boolean {
		if (this.pointsPlaced == 0) {
			this.visualization.show()
			this.posStart = pos
		}
		this.pointsPlaced += 1
		this.placeMove(pos)
		return this.pointsPlaced > 1
	}
	public placeFinish(): void {
		while (!this.finishedPlacing) {
			this.finishedPlacing = this.placeStep(CanvasController.instance.lastCanvasPoint)
		}
		this.finishedPlacing = true
		SnapCursorController.instance.visible = false
		SnapController.instance.hideSnapPoints()
		this.update()
		this.draggable(true)
	}

	public copyForPlacement(): PathComponent {
		return new PathComponent(this.referenceSymbol)
	}

	public static fromJson(saveObject: PathSaveObject): PathComponent {
		let symbol = MainController.instance.symbols.find((value, index, symbols) =>
			saveObject.id.startsWith(value.node.id)
		)
		let pathComponent: PathComponent = new PathComponent(symbol)
		pathComponent.posStart = new SVG.Point(saveObject.start)
		pathComponent.posEnd = new SVG.Point(saveObject.end)
		pathComponent.pointsPlaced = 2
		pathComponent.setPropertiesFromOptions(symbol.getOptionsFromSymbolID(saveObject.id))

		if (saveObject.scale) {
			pathComponent.scaleState = new SVG.Point(saveObject.scale)
			pathComponent.scaleProperty.updateValue(new SVG.Number(Math.abs(saveObject.scale.x)), true)
		}
		pathComponent.mirror.value = pathComponent.scaleState.y < 0
		pathComponent.mirror.updateHTML()
		pathComponent.invert.value = pathComponent.scaleState.x < 0
		pathComponent.invert.updateHTML()
		pathComponent.scaleProperty.value = new SVG.Number(Math.abs(pathComponent.scaleState.x))
		pathComponent.scaleProperty.updateHTML()

		if (saveObject.name) {
			pathComponent.name.value = saveObject.name
			pathComponent.name.updateHTML()
		}

		if (saveObject.label) {
			if (Object.hasOwn(saveObject.label, "value")) {
				pathComponent.labelSide.value = saveObject.label.otherSide ?? false
				pathComponent.labelSide.updateHTML()
				pathComponent.labelDistance.value =
					saveObject.label.distance ? new SVG.Number(saveObject.label.distance) : new SVG.Number(0, "cm")
				pathComponent.labelDistance.updateHTML()
				pathComponent.mathJaxLabel.value = saveObject.label.value
				pathComponent.mathJaxLabel.updateHTML()
				pathComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
				pathComponent.labelColor.updateHTML()
				pathComponent.generateLabelRender()
			} else {
				//@ts-ignore
				pathComponent.mathJaxLabel.value = saveObject.label
			}
		}
		pathComponent.placeFinish()
		pathComponent.visualization.show()

		return pathComponent
	}

	public updateLabelPosition(): void {
		if (!this.mathJaxLabel || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		// breaking points where the label is parallel to the path or to the x axis. in degrees
		const breakVertical = 70
		const breakHorizontal = 21

		let pathDiff = this.posEnd.sub(this.posStart)

		// the bounding boxes for the label and the symbol
		let labelBBox = labelSVG.bbox()
		let symbolBBox = this.symbolUse.bbox()

		// the nominal reference point of the label (bottom center)
		let labelRef = new SVG.Point(labelBBox.cx, labelBBox.y2)
		// the rotation angle of the label (not always identical to the path rotation angle)
		let rotAngle = this.rotationDeg
		if (rotAngle > 90) {
			// upper left quadrant -> don't show label upside down -> rotate the label by additional 180 deg
			rotAngle -= 180
			// the label reference point should now be the top center
			labelRef.y = labelBBox.y
		} else if (rotAngle < -90) {
			// lower left quadrant -> don't show label upside down -> rotate the label by additional 180 deg
			rotAngle += 180
			// the label reference point should now be the top center
			labelRef.y = labelBBox.y
		}

		// mirroring the symbol should not impact the label except from shifting its position to stay close to the symbol (only relevant for asymetric symbols)
		let referenceoffsetY =
			this.scaleState.y < 0 ? this.componentVariant.mid.y - symbolBBox.h : -this.componentVariant.mid.y

		// nominally the reference point of the symbol is its center (w.r.t. the x coordinate for a path which is horizontal)
		let referenceOffsetX = 0

		let otherSide = this.labelSide.value
		let other = otherSide ? -1 : 1
		if (otherSide) {
			labelRef.y = labelBBox.y - labelRef.y
			referenceoffsetY += symbolBBox.h
		}

		// if the path is close to horizontal or vertical according to the break points
		let nearHorizontal =
			Math.abs(this.rotationDeg) < breakHorizontal || Math.abs(this.rotationDeg) > 180 - breakHorizontal
		let nearVertical =
			Math.abs(this.rotationDeg) > breakVertical && Math.abs(this.rotationDeg) < 180 - breakVertical

		if (nearHorizontal) {
			// the label should not be rotated w.r.t. the x axis
			rotAngle = 0
			//the offset where the rotation pivot point should lie (for both label and symbol)
			let horizontalOffset = (Math.min(labelBBox.w, symbolBBox.w) * Math.sign(this.rotationDeg)) / 2
			referenceOffsetX = horizontalOffset * Math.sign(pathDiff.x) * other
			labelRef.x += horizontalOffset * other
		} else if (nearVertical) {
			// the label should not be rotated w.r.t. the x axis
			rotAngle = 0
			let right = this.rotationDeg > 0 ? Math.sign(90 - this.rotationDeg) : Math.sign(this.rotationDeg + 90)
			let up = Math.sign(this.rotationDeg)
			//the offset where the rotation pivot point should lie (for both label and symbol)
			let verticalOffset = Math.min(labelBBox.h, symbolBBox.w) / 2

			referenceOffsetX = -verticalOffset * right * up * other

			labelRef = new SVG.Point(
				(labelBBox.w / 2) * (1 + up * other),
				labelBBox.h / 2 + verticalOffset * other * right
			)
		}

		referenceoffsetY -= other * (this.labelDistance.value ? this.labelDistance.value.convertToUnit("px").value : 0)

		// where the anchor point of the symbol is located relative to the midAbs point
		let referenceOffset = new SVG.Point(referenceOffsetX, referenceoffsetY).transform(
			new SVG.Matrix({
				rotate: -this.rotationDeg,
			})
		)

		// acutally move and rotate the label to the correct position
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
