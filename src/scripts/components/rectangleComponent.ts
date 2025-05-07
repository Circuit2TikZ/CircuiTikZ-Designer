import * as SVG from "@svgdotjs/svg.js"
import {
	AdjustDragHandler,
	basicDirections,
	CanvasController,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	convertTextToNativeSVGText,
	dashArrayToPattern,
	defaultBasicDirection,
	defaultFontSize,
	defaultStroke,
	defaultStrokeStyleChoice,
	DirectionInfo,
	ExportController,
	FillInfo,
	FontSize,
	fontSizes,
	getClosestPointerFromDirection,
	MathjaxParser,
	PositionedLabel,
	SectionHeaderProperty,
	ShapeComponent,
	ShapeSaveObject,
	SliderProperty,
	SnapPoint,
	StrokeInfo,
	strokeStyleChoices,
	Text,
	TextAlign,
	TextAreaProperty,
} from "../internal"
import { rectRectIntersection, resizeSVG, roundTikz } from "../utils/selectionHelper"

export type RectangleSaveObject = ShapeSaveObject & {
	position: SVG.Point
	size: SVG.Point
	text?: Text
}

export class RectangleComponent extends ShapeComponent {
	protected declare shapeVisualization: SVG.Rect
	protected declare dragElement: SVG.Rect

	private textAreaProperty: TextAreaProperty
	private textInnerSep: SliderProperty
	private textFontSize: ChoiceProperty<FontSize>
	private textColor: ColorProperty
	private textSVG: SVG.G

	private createAsText: boolean
	private useHyphenation: boolean

	public constructor(createAsText: boolean = false) {
		super()
		this.createAsText = createAsText
		this.useHyphenation = false
		this.displayName = "Rectangle"

		this.shapeVisualization = CanvasController.instance.canvas.rect(0, 0)
		this.shapeVisualization.hide()

		this.dragElement = CanvasController.instance.canvas.rect(0, 0)
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.shapeVisualization)

		this.visualization.add(this.dragElement)

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Text").buildHTML())
		this.textAreaProperty = new TextAreaProperty({
			text: "",
			align: TextAlign.LEFT,
			justify: -1,
			showPlaceholderText: this.createAsText,
			useHyphenation: this.useHyphenation,
		})
		if (createAsText) {
			this.strokeStyleProperty.value = strokeStyleChoices[1]
		}
		this.textAreaProperty.addChangeListener((ev) => {
			this.createAsText = ev.value.showPlaceholderText
			this.useHyphenation = ev.value.useHyphenation
			this.update()
		})
		this.propertiesHTMLRows.push(this.textAreaProperty.buildHTML())

		this.textFontSize = new ChoiceProperty("Fontsize", fontSizes, defaultFontSize)
		this.textFontSize.addChangeListener((ev) => {
			this.update()
		})
		this.propertiesHTMLRows.push(this.textFontSize.buildHTML())

		this.textInnerSep = new SliderProperty("Inner sep", 0, 10, 0.1, new SVG.Number(5, "pt"))
		this.textInnerSep.addChangeListener((ev) => {
			this.update()
		})
		this.propertiesHTMLRows.push(this.textInnerSep.buildHTML())

		this.textColor = new ColorProperty("Color", null)
		this.textColor.addChangeListener((ev) => {
			this.updateText()
		})
		this.propertiesHTMLRows.push(this.textColor.buildHTML())

		this.addName()

		this.selectionElement = CanvasController.instance.canvas.rect(0, 0).hide()
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		let relPositions: { anchorname: string; relPos: SVG.Point }[] = []
		let halfSize = this.size.div(2)
		for (const anchor of basicDirections) {
			if (anchor.key == defaultBasicDirection.key) {
				continue
			}
			relPositions.push({ relPos: halfSize.mul(anchor.direction), anchorname: anchor.name })
		}
		if (!this.snappingPoints || this.snappingPoints.length == 0) {
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos.add(this.position)))
			}
		} else {
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos.add(this.position))
				snappingPoint.recalculate()
			}
		}
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		const rect = new SVG.Box(
			this.position.x - this.size.x / 2,
			this.position.y - this.size.y / 2,
			this.size.x,
			this.size.y
		)
		return rectRectIntersection(rect, selectionRectangle, this.rotationDeg)
	}

	protected recalculateResizePoints() {
		let halfsize = this.size.div(2)
		for (const [dir, viz] of this.resizeVisualizations) {
			let pos = this.position.add(halfsize.mul(dir.direction).rotate(this.rotationDeg))
			viz.center(pos.x, pos.y)
		}
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
						startPoint = originalPos.add(direction.direction.mul(originalSize).div(2))
						oppositePoint = originalPos.add(direction.direction.mul(originalSize).div(-2))
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

	protected update(): void {
		super.update()
		this.updateText()
	}

	public toJson(): RectangleSaveObject {
		let data: RectangleSaveObject = {
			type: "rect",
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

		if (this.textAreaProperty.value) {
			let textData: Text = {
				text: undefined,
			}
			let hasText = false
			if (this.textAreaProperty.value.text != undefined && this.textAreaProperty.value.text !== "") {
				textData.text = this.textAreaProperty.value.text
				if (this.textAreaProperty.value.align !== TextAlign.LEFT) {
					textData.align = this.textAreaProperty.value.align
				}
				if (this.textAreaProperty.value.justify !== -1) {
					textData.justify = this.textAreaProperty.value.justify
				}
				if (this.textFontSize.value.key !== defaultFontSize.key) {
					textData.fontSize = this.textFontSize.value.key
				}
				if (this.textInnerSep.value.value !== 5) {
					textData.innerSep = this.textInnerSep.value
				}
				if (this.textColor.value) {
					textData.color = this.textColor.value.toString()
				}
				hasText = true
			}
			textData.showPlaceholderText = this.createAsText || undefined
			textData.useHyphenation = this.useHyphenation || undefined

			if (hasText || this.createAsText) {
				data.text = textData
			}
		}

		return data
	}

	static fromJson(saveObject: RectangleSaveObject): RectangleComponent {
		let rectComponent = new RectangleComponent()
		rectComponent.position = new SVG.Point(saveObject.position)
		rectComponent.placePoint = rectComponent.position
		rectComponent.size = new SVG.Point(saveObject.size)

		rectComponent.rotationDeg = saveObject.rotationDeg ?? 0

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				rectComponent.fillInfo.color = saveObject.fill.color
				rectComponent.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
				rectComponent.fillColorProperty.updateHTML()
			}
			if (saveObject.fill.opacity != undefined) {
				rectComponent.fillInfo.opacity = saveObject.fill.opacity
				rectComponent.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
				rectComponent.fillOpacityProperty.updateHTML()
			}
		}

		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				rectComponent.strokeInfo.color = saveObject.stroke.color
				rectComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
				rectComponent.strokeColorProperty.updateHTML()
			}
			if (saveObject.stroke.opacity != undefined) {
				rectComponent.strokeInfo.opacity = saveObject.stroke.opacity
				rectComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
				rectComponent.strokeOpacityProperty.updateHTML()
			}
			if (saveObject.stroke.width) {
				rectComponent.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				rectComponent.strokeWidthProperty.value = rectComponent.strokeInfo.width
				rectComponent.strokeWidthProperty.updateHTML()
			}
			if (saveObject.stroke.style) {
				rectComponent.strokeInfo.style = saveObject.stroke.style
				rectComponent.strokeStyleProperty.value = strokeStyleChoices.find(
					(item) => item.key == saveObject.stroke.style
				)
				rectComponent.strokeStyleProperty.updateHTML()
			}
		}

		if (saveObject.label) {
			rectComponent.labelDistance.value =
				saveObject.label.distance ? new SVG.Number(saveObject.label.distance) : new SVG.Number(0)
			rectComponent.labelDistance.updateHTML()
			rectComponent.anchorChoice.value =
				saveObject.label.anchor ?
					basicDirections.find((item) => item.key == saveObject.label.anchor)
				:	defaultBasicDirection
			rectComponent.anchorChoice.updateHTML()
			rectComponent.positionChoice.value =
				saveObject.label.position ?
					basicDirections.find((item) => item.key == saveObject.label.position)
				:	defaultBasicDirection
			rectComponent.positionChoice.updateHTML()
			rectComponent.mathJaxLabel.value = saveObject.label.value
			rectComponent.mathJaxLabel.updateHTML()
			rectComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
			rectComponent.labelColor.updateHTML()
			rectComponent.generateLabelRender()
		}

		if (saveObject.text) {
			let text: Text = {
				text: saveObject.text.text == undefined ? "" : saveObject.text.text,
				align: saveObject.text.align ?? TextAlign.LEFT,
				justify: saveObject.text.justify ?? -1,
				showPlaceholderText: saveObject.text.showPlaceholderText ?? false,
				useHyphenation: saveObject.text.useHyphenation ?? false,
			}
			rectComponent.createAsText = text.showPlaceholderText
			rectComponent.useHyphenation = text.useHyphenation
			rectComponent.textAreaProperty.value = text
			rectComponent.textAreaProperty.updateHTML()
			rectComponent.textFontSize.value =
				saveObject.text.fontSize ?
					fontSizes.find((item) => item.key == saveObject.text.fontSize)
				:	defaultFontSize
			rectComponent.textFontSize.updateHTML()
			rectComponent.textInnerSep.value =
				saveObject.text.innerSep ? new SVG.Number(saveObject.text.innerSep) : new SVG.Number("5pt")
			rectComponent.textInnerSep.updateHTML()
			rectComponent.textColor.value = saveObject.text.color ? new SVG.Color(saveObject.text.color) : null
			rectComponent.textColor.updateHTML()
		}

		rectComponent.placeFinish()
		rectComponent.updateTheme()
		return rectComponent
	}

	/**
	 * override placeFinish: change the default look of the component if the rectangle was created as a text component
	 */
	public placeFinish(): void {
		super.placeFinish()
		if (this.createAsText) {
			this.strokeOpacityProperty.value = new SVG.Number(0, "%")
			this.strokeInfo.opacity = this.strokeOpacityProperty.value.value / 100
			this.updateTheme()
			this.strokeOpacityProperty.updateHTML()
			this.strokeStyleProperty.value = strokeStyleChoices[0]
			this.strokeStyleProperty.updateHTML()
			this.update()
		}
	}

	public toTikzString(): string {
		let optionsArray: string[] = ["shape=rectangle"]
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
			if (this.strokeInfo.style && this.strokeInfo.style != defaultStrokeStyleChoice.key) {
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
				roundTikz(new SVG.Number(this.size.x - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)
		optionsArray.push(
			"minimum height=" +
				roundTikz(new SVG.Number(this.size.y - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)

		if (this.rotationDeg != 0) {
			optionsArray.push(`rotate=${this.rotationDeg}`)
		}

		let id = this.name.value
		if (!id && this.mathJaxLabel.value) {
			id = ExportController.instance.createExportID("Rect")
		}

		let textStr = ""
		if (this.textAreaProperty.value.text) {
			//treat justify like left aligned
			let alignDir =
				this.textAreaProperty.value.align == TextAlign.JUSTIFY ? -1 : this.textAreaProperty.value.align - 1
			let dir = new SVG.Point(alignDir, this.textAreaProperty.value.justify)

			// which anchor and position corresponds to the direction?
			let anchor = basicDirections.find((item) => item.direction.eq(dir)).name

			let pos = this.position.add(dir.mul(this.size.div(2)).rotate(this.rotationDeg))

			// text dimensions
			let innerSep = this.textInnerSep.value.plus(this.strokeInfo.width.times(0.5))
			let textWidth = new SVG.Number(this.size.x, "px")
				.minus(this.strokeInfo.width.plus(this.textInnerSep.value).times(2))
				.convertToUnit("cm")

			let fontStr = this.textFontSize.value.key == defaultFontSize.key ? "" : `\\${this.textFontSize.value.name} `
			let options = `[anchor=${anchor}, align=${
				this.textAreaProperty.value.align == TextAlign.LEFT ? "left"
				: this.textAreaProperty.value.align == TextAlign.CENTER ? "center"
				: this.textAreaProperty.value.align == TextAlign.RIGHT ? "right"
				: "justify"
			}, text width=${roundTikz(textWidth.value)}cm, inner sep=${innerSep.toString()}${this.rotationDeg != 0 ? ", rotate=" + this.rotationDeg : ""}]`

			//escape special characters
			const replaceDict = {
				"#": "\\#",
				$: "\\$",
				"%": "\\%",
				"&": "\\&",
				_: "\\_",
				"{": "\\{",
				"}": "\\}",
				"~": "\\textasciitilde",
				"^": "\\textasciicircum",
				"\\": "\\textbackslash",
				"\n": "\\\\",
			}
			const mathjaxParser = new MathjaxParser()
			const sections: string[] = []
			const textSections = mathjaxParser.parse(this.textAreaProperty.value.text)
			for (const section of textSections) {
				if (section.type == "text") {
					sections.push(section.text.replaceAll(/[\#\%\$\&\_\{\}\~\^\\\n]/g, (match) => replaceDict[match]))
				} else {
					sections.push("$" + section.text + "$")
				}
			}
			let escapedText = sections.join(" ")
			console.log(escapedText)

			let latexStr = `${fontStr}${escapedText}`
			latexStr =
				this.textColor.value ?
					"\\textcolor" + this.textColor.value.toTikzString() + "{" + latexStr + "}"
				:	latexStr

			textStr = ` node ${options} at ${pos.toTikzString()}{${latexStr}}`
		}

		let labelNodeStr = ""
		if (this.mathJaxLabel.value) {
			let labelStr = "anchor=" + this.labelPos.name

			let labelDist = this.labelDistance.value.convertToUnit("cm")

			let anchorDir =
				this.anchorChoice.value.key == defaultBasicDirection.key ?
					new SVG.Point()
				:	this.anchorChoice.value.direction
			let labelShift = anchorDir.mul(-labelDist.value)
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
		return `\\node${optionsStr}${id ? "(" + id + ")" : ""} at ${this.position.toTikzString()}{}${textStr}${labelNodeStr};`
	}

	public copyForPlacement(): CircuitComponent {
		return new RectangleComponent(this.createAsText)
	}

	private labelPos: DirectionInfo
	public updateLabelPosition(): void {
		if (!this.mathJaxLabel.value || !this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		let bbox = new SVG.Box(
			this.position.x - this.size.x / 2,
			this.position.y - this.size.y / 2,
			this.size.x,
			this.size.y
		)
		// get relevant positions and bounding boxes
		let textPos = this.position
		let textPosNoTrans = this.position
		if (this.positionChoice.value.key != defaultBasicDirection.key) {
			let bboxHalfSize = this.size.div(2)
			textPosNoTrans = this.position.add(bboxHalfSize.mul(this.positionChoice.value.direction))
			textPos = textPosNoTrans.transform(transformMatrix)
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

			let horizontalTextPosition = clamp(Math.round((2 * (bbox.cx - textPosNoTrans.x)) / bbox.w), -1, 1)
			let verticalTextPosition = clamp(Math.round((2 * (bbox.cy - textPosNoTrans.y)) / bbox.h), -1, 1)
			labelRef = new SVG.Point(horizontalTextPosition, verticalTextPosition).rotate(this.rotationDeg)
			labelRef.x = Math.round(labelRef.x)
			labelRef.y = Math.round(labelRef.y)
			this.labelPos = basicDirections.find((item) => item.direction.eq(labelRef))
		} else {
			this.labelPos = this.anchorChoice.value
			labelRef = this.labelPos.direction
		}

		let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w, labelBBox.h)).add(labelRef.mul(labelDist))

		// actually move the label
		let movePos = textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({ translate: [movePos.x, movePos.y] }))
	}

	private updateText() {
		this.textSVG?.remove()

		if (this.textAreaProperty.value.text || this.createAsText) {
			let textData: Text = {
				text: this.textAreaProperty.value.text || (this.createAsText ? "text component" : ""),
			}
			textData.align = this.textAreaProperty.value.align ?? TextAlign.LEFT
			textData.justify = this.textAreaProperty.value.justify ?? -1
			textData.fontSize = this.textFontSize.value.key

			textData.color = this.textColor.value?.toString() || "var(--bs-emphasis-color)"

			const innerSep = this.textInnerSep.value.convertToUnit("px").value
			let strokeWidth = this.strokeInfo.width.convertToUnit("px").value
			let w = this.size.x - strokeWidth * 2 - 2 * innerSep
			let h = this.size.y - strokeWidth * 2 - 2 * innerSep
			const textPos = this.position.sub(new SVG.Point(w > 0 ? w : 0, h > 0 ? h : 0).div(2))
			const textBox = new SVG.Box(textPos.x, textPos.y, w > 0 ? w : 0, h > 0 ? h : 0)

			if (this.textSVG) {
				let removeIDs = new Set<string>()
				for (const element of this.textSVG.find("use")) {
					removeIDs.add(element.node.getAttribute("xlink:href"))
				}

				for (const id of removeIDs) {
					CanvasController.instance.canvas.find(id)[0]?.remove()
				}
			}
			this.textSVG = convertTextToNativeSVGText(textData, textBox, this.useHyphenation)

			let transformMatrix = new SVG.Matrix({
				rotate: -this.rotationDeg,
				origin: [this.position.x, this.position.y],
			})
			this.textSVG.transform(transformMatrix)
			this.textSVG.node.style.pointerEvents = "none"

			this.visualization.add(this.textSVG)
		}
	}
}
