import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	convertTextToNativeSVGText,
	dashArrayToPattern,
	defaultBasicDirection,
	defaultFontSize,
	defaultStrokeStyleChoice,
	ExportController,
	FontSize,
	fontSizes,
	MathjaxParser,
	SectionHeaderProperty,
	ShapeComponent,
	ShapeSaveObject,
	SliderProperty,
	SnapPoint,
	strokeStyleChoices,
	Text,
	TextAlign,
	TextAreaProperty,
} from "../internal"
import { rectRectIntersection, roundTikz } from "../utils/selectionHelper"

export type RectangleSaveObject = ShapeSaveObject & {
	size: SVG.Point
	text?: Text
}

export class RectangleComponent extends ShapeComponent {
	private static jsonID = "rect"
	static {
		CircuitComponent.jsonSaveMap.set(RectangleComponent.jsonID, RectangleComponent)
	}

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

		this.componentVisualization = CanvasController.instance.canvas.rect(0, 0)
		this.componentVisualization.hide()

		this.dragElement = CanvasController.instance.canvas.rect(0, 0)
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.componentVisualization)

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
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos.add(halfSize)))
			}
		} else {
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos.add(halfSize))
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

	protected update(): void {
		super.update()
		this.updateText()
	}

	public toJson(): RectangleSaveObject {
		const data = super.toJson() as RectangleSaveObject
		data.type = RectangleComponent.jsonID
		data.size = this.size.simplifyForJson()

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
		rectComponent.referencePosition = rectComponent.size.div(2)

		rectComponent.rotationDeg = saveObject.rotation ?? 0

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				rectComponent.fillInfo.color = saveObject.fill.color
				rectComponent.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
			}
			if (saveObject.fill.opacity != undefined) {
				rectComponent.fillInfo.opacity = saveObject.fill.opacity
				rectComponent.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
			}
		}

		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				rectComponent.strokeInfo.color = saveObject.stroke.color
				rectComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
			}
			if (saveObject.stroke.opacity != undefined) {
				rectComponent.strokeInfo.opacity = saveObject.stroke.opacity
				rectComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
			}
			if (saveObject.stroke.width) {
				rectComponent.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				rectComponent.strokeWidthProperty.value = rectComponent.strokeInfo.width
			}
			if (saveObject.stroke.style) {
				rectComponent.strokeInfo.style = saveObject.stroke.style
				rectComponent.strokeStyleProperty.value = strokeStyleChoices.find(
					(item) => item.key == saveObject.stroke.style
				)
			}
		}

		if (saveObject.label) {
			rectComponent.labelDistance.value =
				saveObject.label.distance ?
					new SVG.Number(saveObject.label.distance.value, saveObject.label.distance.unit)
				:	new SVG.Number(0, "cm")
			if (rectComponent.labelDistance.value.unit == "") {
				rectComponent.labelDistance.value.unit = "cm"
			}

			rectComponent.anchorChoice.value =
				saveObject.label.anchor ?
					basicDirections.find((item) => item.key == saveObject.label.anchor)
				:	defaultBasicDirection

			rectComponent.positionChoice.value =
				saveObject.label.position ?
					basicDirections.find((item) => item.key == saveObject.label.position)
				:	defaultBasicDirection

			rectComponent.mathJaxLabel.value = saveObject.label.value

			rectComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null

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

			rectComponent.textFontSize.value =
				saveObject.text.fontSize ?
					fontSizes.find((item) => item.key == saveObject.text.fontSize)
				:	defaultFontSize

			rectComponent.textInnerSep.value =
				saveObject.text.innerSep ? new SVG.Number(saveObject.text.innerSep) : new SVG.Number("5pt")

			rectComponent.textColor.value = saveObject.text.color ? new SVG.Color(saveObject.text.color) : null
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

			this.strokeStyleProperty.value = strokeStyleChoices[0]

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
				"$": "\\$",
				"%": "\\%",
				"&": "\\&",
				"_": "\\_",
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
