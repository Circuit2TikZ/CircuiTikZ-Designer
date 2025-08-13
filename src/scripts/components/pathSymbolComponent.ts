import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	ComponentSymbol,
	MainController,
	SnapPoint,
	SnapDragHandler,
	SnappingInfo,
	BooleanProperty,
	SliderProperty,
	SectionHeaderProperty,
	defaultStroke,
	SelectionController,
	PathComponent,
	ChoiceEntry,
	ChoiceProperty,
	EnumOption,
	PathLabel,
	PathSaveObject,
	SymbolOption,
	Variant,
	defaultFill,
	PathLabelable,
	InfoProperty,
	CircuitComponent,
	PropertyCategories,
	Nameable,
	TikzPathCommand,
	CircuitikzTo,
	SaveController,
	buildTikzStringFromPathCommand,
} from "../internal"
import { lineRectIntersection, pointInsideRect, selectedBoxWidth, selectionSize } from "../utils/selectionHelper"

export type PathSymbolSaveObject = PathSaveObject & {
	id: string
	scale?: SVG.Point
	name?: string
	options?: string[]
	label?: PathLabel
}

export class PathSymbolComponent extends PathLabelable(Nameable(PathComponent)) {
	private static jsonID = "path"
	static {
		CircuitComponent.jsonSaveMap.set(PathSymbolComponent.jsonID, PathSymbolComponent)
	}
	public referenceSymbol: ComponentSymbol

	private startLine: SVG.Line
	private endLine: SVG.Line
	private startLineSelection: SVG.Line
	private endLineSelection: SVG.Line
	private selectionRect: SVG.Rect
	private dragStartLine: SVG.Line
	private dragEndLine: SVG.Line
	/**
	 * the vector in local coordinates from componentVariant.mid to the point where the first half of the path line should end
	 */
	private relSymbolStart: SVG.Point
	/**
	 * the vector in local coordinates from componentVariant.mid to the point where the second half of the path line should start
	 */
	private relSymbolEnd: SVG.Point

	private rotationDeg: number = 0

	private mirror: BooleanProperty
	private invert: BooleanProperty

	protected scaleProperty: SliderProperty

	/**
	 * the scale of the component, i.e. how much it is scaled compared to the original symbol size. this also includes mirroring and inverting.
	 * It is greatly discouraged to use this property to scale the component, since an elegant solution in tikz does not exist for that.
	 */
	protected scaleState: SVG.Point

	protected optionProperties: Map<BooleanProperty, SymbolOption>
	protected optionEnumProperties: Map<ChoiceProperty<ChoiceEntry>, EnumOption>
	protected componentVariant: Variant

	constructor(symbol: ComponentSymbol) {
		super()
		this.scaleState = new SVG.Point(1, 1)
		this.scaleProperty = new SliderProperty("Scale", 0.1, 10, 0.01, new SVG.Number(1), true)
		this.scaleProperty.addChangeListener((ev) => {
			this.scaleState = new SVG.Point(
				Math.sign(this.scaleState.x) * ev.value.value,
				Math.sign(this.scaleState.y) * ev.value.value
			)
			this.update()
		})
		this.properties.add(PropertyCategories.manipulation, this.scaleProperty)

		this.optionProperties = new Map()
		this.optionEnumProperties = new Map()

		if (symbol.possibleOptions.length > 0 || symbol.possibleEnumOptions.length > 0) {
			this.properties.add(PropertyCategories.options, new SectionHeaderProperty("Options"))
			for (const option of symbol.possibleOptions) {
				const property = new BooleanProperty(option.displayName ?? option.name, false)
				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionProperties.set(property, option)
				this.properties.add(PropertyCategories.options, property)
			}
			for (const enumOption of symbol.possibleEnumOptions) {
				let choices: ChoiceEntry[] = enumOption.selectNone ? [{ key: "-", name: "--default--" }] : []
				enumOption.options.forEach((option) => {
					choices.push({ key: option.name, name: option.displayName ?? option.name })
				})
				const property = new ChoiceProperty(enumOption.displayName, choices, choices[0])

				property.addChangeListener((ev) => {
					this.updateOptions()
				})
				this.optionEnumProperties.set(property, enumOption)
				this.properties.add(PropertyCategories.options, property)
			}
		}

		this.componentVariant = symbol.getVariant(this.optionsFromProperties())

		this.componentVisualization = CanvasController.instance.canvas.use(this.componentVariant.symbol)
		this.componentVisualization.fill(defaultFill)
		this.componentVisualization.stroke(defaultStroke)
		this.componentVisualization.node.style.color = defaultStroke

		this.displayName = symbol.displayName
		this.referenceSymbol = symbol
		this.scaleState = new SVG.Point(1, 1)

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

		this.visualization.add(this.componentVisualization)
		this.visualization.add(this.startLine)
		this.visualization.add(this.endLine)
		this.visualization.add(this.dragStartLine)
		this.visualization.add(this.dragEndLine)
		this.visualization.hide()

		this.properties.add(PropertyCategories.manipulation, new SectionHeaderProperty("Symbol Orientation"))

		this.mirror = new BooleanProperty("Mirror", false)
		this.mirror.addChangeListener((ev) => {
			this.scaleState.y *= -1
			this.update()
		})
		this.properties.add(PropertyCategories.manipulation, this.mirror)

		this.invert = new BooleanProperty("Invert", false)
		this.invert.addChangeListener((ev) => {
			this.scaleState.x *= -1
			this.update()
		})
		this.properties.add(PropertyCategories.manipulation, this.invert)

		this.addInfo()

		this.snappingPoints = [
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			new SnapPoint(this, null, new SVG.Point(0, 0)),
			...this.componentVariant.pins
				.filter((_, index) => !(index == startPinIndex || index == endPinIndex))
				.map((pin) => new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))),
		]
	}

	protected addInfo() {
		this.properties.add(PropertyCategories.info, new SectionHeaderProperty("Info"))
		this.properties.add(PropertyCategories.info, new InfoProperty("ID", this.referenceSymbol.tikzName))
	}

	protected optionsFromProperties(): SymbolOption[] {
		const selectedOptions: SymbolOption[] = []
		this.optionProperties.forEach((option, property) => {
			if (property.value) {
				selectedOptions.push(option)
			}
		})
		this.optionEnumProperties.forEach((option, property) => {
			if (property.value.key != "-") {
				selectedOptions.push(
					option.options.find((o) => {
						return o.name == property.value.key
					})
				)
			}
		})
		return selectedOptions
	}

	protected setPropertiesFromOptions(options: SymbolOption[]) {
		this.optionProperties.forEach((value, property) => {
			if (options.find((op) => op.name == value.name)) {
				property.value = true
			} else {
				property.value = false
			}
		})
		this.optionEnumProperties.forEach((enumOption, property) => {
			let foundOption = false
			for (const option of enumOption.options) {
				if (options.find((op) => op.name == option.name)) {
					foundOption = true
					property.value = property.entries.find((entry) => entry.key == option.name)
					break
				}
			}
			if (!foundOption) {
				property.value = property.entries[0]
			}
		})
		this.updateOptions()
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
		this.mirror.updateValue(!this.mirror.value)

		this.update()
	}

	public recalculateSnappingPoints(): void {
		const inverseTransform = this.getTransformMatrix().inverse()
		this.snappingPoints[0].updateRelPosition(this.referencePoints[0].transform(inverseTransform))
		this.snappingPoints[1].updateRelPosition(this.referencePoints[1].transform(inverseTransform))
		super.recalculateSnappingPoints()
	}

	protected updateOptions(): void {
		this.componentVariant = this.referenceSymbol.getVariant(this.optionsFromProperties())
		this.componentVisualization.node.setAttribute("href", "#" + this.componentVariant.symbol.id())

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
				additionalSnappingPoints:
					this.referencePoints.length > 0 ? [new SnapPoint(this, "", new SVG.Point())] : [],
			}
		}
	}

	protected update(): void {
		this.position = this.referencePoints[0].add(this.referencePoints[1]).div(2)

		const angle = Math.atan2(
			this.referencePoints[0].y - this.referencePoints[1].y,
			this.referencePoints[1].x - this.referencePoints[0].x
		)
		this.rotationDeg = (angle * 180) / Math.PI

		let m = this.getTransformMatrix()
		this.componentVisualization.transform(m)

		let startLineEndPoint = this.relSymbolStart.add(this.componentVariant.mid).transform(m)
		let endLineStartPoint = this.relSymbolEnd.add(this.componentVariant.mid).transform(m)

		if (this.invert.value) {
			let switchPos = startLineEndPoint
			startLineEndPoint = endLineStartPoint
			endLineStartPoint = switchPos
		}

		this.recalculateResizePoints()
		this.startLine.plot(
			this.referencePoints[0].x,
			this.referencePoints[0].y,
			startLineEndPoint.x,
			startLineEndPoint.y
		)
		this.endLine.plot(
			this.referencePoints[1].x,
			this.referencePoints[1].y,
			endLineStartPoint.x,
			endLineStartPoint.y
		)
		this.startLineSelection.plot(
			this.referencePoints[0].x,
			this.referencePoints[0].y,
			startLineEndPoint.x,
			startLineEndPoint.y
		)
		this.endLineSelection.plot(
			this.referencePoints[1].x,
			this.referencePoints[1].y,
			endLineStartPoint.x,
			endLineStartPoint.y
		)
		this.dragStartLine.plot(
			this.referencePoints[0].x,
			this.referencePoints[0].y,
			startLineEndPoint.x,
			startLineEndPoint.y
		)
		this.dragEndLine.plot(
			this.referencePoints[1].x,
			this.referencePoints[1].y,
			endLineStartPoint.x,
			endLineStartPoint.y
		)

		this.updatePathLabel()
		this._bbox = this.visualization.bbox()
		this.referencePosition = this.position.sub(new SVG.Point(this._bbox.x, this._bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			// use the saved position instead of the bounding box (bbox position fails in safari)
			let bbox = this.componentVariant.viewBox
			this.selectionRect
				.center(bbox.cx, bbox.cy)
				.size(bbox.w + selectedBoxWidth, bbox.h + selectedBoxWidth)
				.transform(this.getTransformMatrix())
		}
	}

	public viewSelected(show: boolean): void {
		super.viewSelected(show)
		this.resizable(this.isSelected && show && SelectionController.instance.currentlySelectedComponents.length == 1)
	}

	/**
	 * For tikz path symbols, this getTransformMatrix returns the transformation necessary for the symbol from local symbol coodinates to world coordinates
	 */
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

	public updateTheme() {
		let labelColor = defaultStroke
		if (this.labelColor && this.labelColor.value) {
			labelColor = this.labelColor.value.toString()
		}
		this.labelRendering?.fill(labelColor)
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		// if 1 of the 2 lines hanging of the symbol intersect the selection rect -> should select
		if (
			lineRectIntersection(this.startLine, selectionRectangle) ||
			lineRectIntersection(this.endLine, selectionRectangle)
		) {
			return true
		}

		const bbox = this.componentVariant.viewBox
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

	public toJson(): PathSymbolSaveObject {
		let data = super.toJson() as PathSymbolSaveObject
		data.type = PathSymbolComponent.jsonID
		data.id = this.referenceSymbol.tikzName

		if (this.componentVariant.options.length > 0) {
			data.options = this.componentVariant.options.map((option) => option.displayName ?? option.name)
		}

		if (this.scaleState && (this.scaleState.x != 1 || this.scaleState.y != 1)) {
			data.scale = this.scaleState
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
		let options: string[] = [this.referenceSymbol.tikzName]
		options.push(...this.referenceSymbol.optionsToStringArray(this.optionsFromProperties()))
		if (this.mirror.value) {
			options.push("mirror")
		}
		if (this.invert.value) {
			options.push("invert")
		}

		const scaleFactor =
			this.scaleProperty.value.value != 1 ? new SVG.Number(this.scaleProperty.value.value * 1.4, "cm") : undefined
		if (scaleFactor) {
			options.push("/tikz/circuitikz/bipoles/length=" + scaleFactor.value.toPrecision(3) + scaleFactor.unit)
		}

		let to: CircuitikzTo = { options: options, name: this.name.value }
		this.buildTikzPathLabel(to)
		command.connectors.push(to)
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		let symbolID = this.componentVariant.symbol.id()
		if (!defs.has(symbolID)) {
			const symbol = this.componentVariant.symbol.clone(true, false)
			defs.set(symbolID, symbol)
		}
		this.labelRendering?.addClass("labelRendering")
		const copiedSVG = this.visualization.clone(true)
		if (this.labelRendering) {
			this.labelRendering.removeClass("labelRendering")
			if (!this.mathJaxLabel.value) {
				copiedSVG.removeElement(copiedSVG.find(".labelRendering")[0])
			} else {
				for (const use of copiedSVG.find(".labelRendering")[0].find("use")) {
					const id = use.node.getAttribute("xlink:href")
					if (!defs.has(id)) {
						defs.set(id, CanvasController.instance.canvas.find(id)[0].clone(true, false))
					}
				}
			}

			copiedSVG.findOne(".labelRendering")?.removeClass("labelRendering")
		}
		return copiedSVG
	}

	public remove(): void {
		SnapDragHandler.snapDrag(this, false)
		this.resizable(false)
		this.viewSelected(false)
		this.visualization.remove()
		this.selectionElement?.remove()
		this.labelRendering?.remove()
	}

	public copyForPlacement(): PathSymbolComponent {
		return new PathSymbolComponent(this.referenceSymbol)
	}

	protected static idNoOptions(id: string): string {
		return id.split("_").slice(0, 2).join("_")
	}

	public applyJson(saveObject: PathSymbolSaveObject): void {
		super.applyJson(saveObject)
		let options = saveObject.options ?? []
		this.setPropertiesFromOptions(this.referenceSymbol.getOptionsFromOptionNames(options))

		if (saveObject.scale) {
			this.scaleState = new SVG.Point(saveObject.scale)
			this.scaleProperty.updateValue(new SVG.Number(Math.abs(saveObject.scale.x)))
		}
		this.mirror.value = this.scaleState.y < 0
		this.invert.value = this.scaleState.x < 0
		this.scaleProperty.value = new SVG.Number(Math.abs(this.scaleState.x))

		this.update()
		this.visualization.show()
	}

	public static fromJson(saveObject: PathSymbolSaveObject): PathSymbolComponent {
		let symbol: ComponentSymbol

		if (SaveController.instance.currentlyLoadedSaveVersion != "") {
			symbol = MainController.instance.symbols.find((symbol) => symbol.tikzName == saveObject.id)
		} else {
			let idParts = saveObject.id.split("_")
			symbol = MainController.instance.symbols.find(
				(symbol) => symbol.tikzName == idParts[1].replaceAll("-", " ")
			)
			saveObject.options = idParts.slice(2)
			// @ts-ignore
			saveObject.points = [saveObject.start, saveObject.end]
		}
		if (symbol) {
			let pathComponent: PathSymbolComponent = new PathSymbolComponent(symbol)
			return pathComponent
		} else {
			console.error("no path symbol found for saveObject: " + JSON.stringify(saveObject))
			return null
		}
	}

	public updatePathLabel(): void {
		if (!this.mathJaxLabel || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		// breaking points where the label is parallel to the path or to the x axis. in degrees
		const breakVertical = 70
		const breakHorizontal = 21

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
		let referenceoffsetY =
			this.scaleState.y < 0 ? this.componentVariant.mid.y - symbolBBox.h : -this.componentVariant.mid.y
		referenceoffsetY *= Math.abs(this.scaleState.y)

		// nominally the reference point of the symbol is its center (w.r.t. the x coordinate for a path which is horizontal)
		let referenceOffsetX = 0

		let other = this.labelSide.value ? -1 : 1
		if (other < 0) {
			labelRef.y = labelBBox.y - labelRef.y
			referenceoffsetY += symbolBBox.h * Math.abs(this.scaleState.y)
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
