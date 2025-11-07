import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	BooleanProperty,
	CanvasController,
	ChoiceEntry,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	convertTextToNativeSVGText,
	defaultBasicDirection,
	MathjaxParser,
	PropertyCategories,
	SectionHeaderProperty,
	ShapeComponent,
	ShapeSaveObject,
	SliderProperty,
	SnapPoint,
	strokeStyleChoices,
	TextAreaProperty,
	textToSVG,
	TikzNodeCommand,
	RadioButtonProperty,
} from "../internal"
import { rectRectIntersection, roundTikz } from "../utils/selectionHelper"

export type RectangleSaveObject = ShapeSaveObject & {
	text?: Text
}

export type FontSize = ChoiceEntry & {
	size: number
}
export const fontSizes: FontSize[] = [
	{ key: "tiny", name: "tiny", size: 5 },
	{ key: "scriptsize", name: "scriptsize", size: 7 },
	{ key: "footnotesize", name: "footnotesize", size: 8 },
	{ key: "small", name: "small", size: 9 },
	{ key: "normalsize", name: "normalsize", size: 10 },
	{ key: "large", name: "large", size: 12 },
	{ key: "Large", name: "Large", size: 14.4 },
	{ key: "LARGE", name: "LARGE", size: 17.28 },
	{ key: "huge", name: "huge", size: 20.74 },
	{ key: "Huge", name: "Huge", size: 24.88 },
]
export const defaultFontSize = fontSizes[4]

export type Text = {
	text: string
	align?: TextAlign
	justify?: TextJustify
	fontSize?: string
	innerSep?: SVG.Number
	color?: string | "default"
	showPlaceholderText?: boolean
	useHyphenation?: boolean
}

export enum TextAlign {
	LEFT,
	CENTER,
	RIGHT,
	JUSTIFY,
}

export enum TextJustify {
	START = -1,
	CENTER = 0,
	END = 1,
}

export class RectangleComponent extends ShapeComponent {
	private static jsonID = "rect"
	static {
		CircuitComponent.jsonSaveMap.set(RectangleComponent.jsonID, RectangleComponent)
	}

	declare protected dragElement: SVG.Rect

	private text: Text
	private textAreaProperty: TextAreaProperty
	private textAreaPlaceHolder: BooleanProperty
	private textAreaHyphenation: BooleanProperty
	private textAreaAlign: RadioButtonProperty<{ key: string; name: string; isMaterialSymbol: boolean; numberID: any }>
	private textAreaJustify: RadioButtonProperty<{
		key: string
		name: string
		isMaterialSymbol: boolean
		numberID: any
	}>
	private textFontSize: ChoiceProperty<FontSize>
	private textInnerSep: SliderProperty
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

		this.properties.add(PropertyCategories.text, new SectionHeaderProperty("Text", undefined, "text:header"))
		this.textAreaProperty = new TextAreaProperty("", undefined, "text:area")
		if (createAsText) {
			this.strokeStyleProperty.value = strokeStyleChoices[1]
		}
		this.textAreaProperty.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textAreaProperty)

		this.textAreaPlaceHolder = new BooleanProperty(
			"Placeholder",
			createAsText,
			undefined,
			undefined,
			"text:placeholder"
		)
		this.textAreaPlaceHolder.addChangeListener((ev) => {
			this.createAsText = ev.value
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textAreaPlaceHolder)

		this.textAreaHyphenation = new BooleanProperty(
			"Hyphenation",
			this.useHyphenation,
			undefined,
			undefined,
			"text:hyphenation"
		)
		this.textAreaHyphenation.addChangeListener((ev) => {
			this.useHyphenation = ev.value
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textAreaHyphenation)

		this.textAreaAlign = new RadioButtonProperty<{
			key: string
			name: string
			isMaterialSymbol: boolean
			numberID: any
		}>(
			"Align",
			[
				{ key: "LEFT", name: "format_align_left", isMaterialSymbol: true, numberID: TextAlign.LEFT },
				{ key: "CENTER", name: "format_align_center", isMaterialSymbol: true, numberID: TextAlign.CENTER },
				{ key: "RIGHT", name: "format_align_right", isMaterialSymbol: true, numberID: TextAlign.RIGHT },
				{ key: "JUSTIFY", name: "format_align_justify", isMaterialSymbol: true, numberID: TextAlign.JUSTIFY },
			],
			{ key: "LEFT", name: "format_align_left", isMaterialSymbol: true, numberID: TextAlign.LEFT },
			undefined,
			"text:align"
		)
		this.textAreaAlign.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textAreaAlign)

		this.textAreaJustify = new RadioButtonProperty<{
			key: string
			name: string
			isMaterialSymbol: boolean
			numberID: any
		}>(
			"Justify",
			[
				{ key: "START", name: "vertical_align_top", isMaterialSymbol: true, numberID: TextJustify.START },
				{ key: "CENTER", name: "vertical_align_center", isMaterialSymbol: true, numberID: TextJustify.CENTER },
				{ key: "END", name: "vertical_align_bottom", isMaterialSymbol: true, numberID: TextJustify.END },
			],
			{ key: "START", name: "vertical_align_top", isMaterialSymbol: true, numberID: TextJustify.START },
			undefined,
			"text:justify"
		)
		this.textAreaJustify.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textAreaJustify)

		this.textFontSize = new ChoiceProperty("Fontsize", fontSizes, defaultFontSize, undefined, "text:fontsize")
		this.textFontSize.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textFontSize)

		this.textInnerSep = new SliderProperty(
			"Inner sep",
			0,
			10,
			0.1,
			new SVG.Number(5, "pt"),
			undefined,
			undefined,
			"text:innersep"
		)
		this.textInnerSep.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textInnerSep)

		this.textColor = new ColorProperty("Color", null, undefined, undefined, "text:color")
		this.textColor.addChangeListener((ev) => {
			this.updateText()
		})
		this.properties.add(PropertyCategories.text, this.textColor)

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
			if (this.textAreaProperty.value != undefined && this.textAreaProperty.value !== "") {
				textData.text = this.textAreaProperty.value
				if (this.textAreaAlign.value.numberID !== TextAlign.LEFT) {
					textData.align = this.textAreaAlign.value.numberID
				}
				if (this.textAreaJustify.value.numberID !== TextJustify.START) {
					textData.justify = this.textAreaJustify.value.numberID
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

	protected applyJson(saveObject: RectangleSaveObject): void {
		super.applyJson(saveObject)

		if (saveObject.text) {
			let text: Text = {
				text: saveObject.text.text == undefined ? "" : saveObject.text.text,
				align: saveObject.text.align ?? TextAlign.LEFT,
				justify: saveObject.text.justify ?? TextJustify.START,
				showPlaceholderText: saveObject.text.showPlaceholderText ?? false,
				useHyphenation: saveObject.text.useHyphenation ?? false,
			}
			this.createAsText = text.showPlaceholderText
			this.useHyphenation = text.useHyphenation
			this.textAreaProperty.value = text.text
			this.textAreaPlaceHolder.value = this.createAsText
			this.textAreaHyphenation.value = this.useHyphenation
			this.textAreaAlign.value =
				Object.values(this.textAreaAlign.options).find((item) => item.numberID == text.align) ??
				this.textAreaAlign.options[0]
			this.textAreaJustify.value =
				Object.values(this.textAreaJustify.options).find((item) => item.numberID == text.justify) ??
				this.textAreaJustify.options[0]

			this.textFontSize.value =
				saveObject.text.fontSize ?
					fontSizes.find((item) => item.key == saveObject.text.fontSize)
				:	defaultFontSize

			if (saveObject.text.innerSep) {
				if (!(typeof saveObject.text.innerSep == "string")) {
					// SVG.Number as object
					this.textInnerSep.value = new SVG.Number(
						saveObject.text.innerSep.value,
						saveObject.text.innerSep.unit
					)
				} else {
					// SVG.Number as string
					this.textInnerSep.value = new SVG.Number(saveObject.text.innerSep)
				}
			} else {
				this.textInnerSep.value = new SVG.Number("5pt")
			}

			this.textColor.value = saveObject.text.color ? new SVG.Color(saveObject.text.color) : null
		}

		this.update()
		this.componentVisualization.show()
		this.updateTheme()
	}

	static fromJson(saveObject: RectangleSaveObject): RectangleComponent {
		let rectComponent = new RectangleComponent()
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

	protected buildTikzCommand(command: TikzNodeCommand): void {
		command.options.push("shape=rectangle")
		super.buildTikzCommand(command)

		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		command.options.push(
			"minimum width=" +
				roundTikz(new SVG.Number(this.size.x - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)
		command.options.push(
			"minimum height=" +
				roundTikz(new SVG.Number(this.size.y - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)

		if (this.textAreaProperty.value) {
			let options: string[] = []

			//treat justify like left aligned
			let alignDir =
				this.textAreaAlign.value.numberID == TextAlign.JUSTIFY ? -1 : this.textAreaAlign.value.numberID - 1
			let dir = new SVG.Point(alignDir, this.textAreaJustify.value.numberID)

			// which anchor and position corresponds to the direction?
			let anchor = basicDirections.find((item) => item.direction.eq(dir)).name
			let pos = this.position.add(dir.mul(this.size.div(2)).rotate(this.rotationDeg))
			options.push("anchor=" + anchor)

			switch (this.textAreaAlign.value.numberID) {
				case TextAlign.LEFT:
					options.push("align=left")
					break
				case TextAlign.CENTER:
					options.push("align=center")
					break
				case TextAlign.RIGHT:
					options.push("align=right")
					break
				default:
					options.push("align=justify")
					break
			}

			// text dimensions
			let innerSep = this.textInnerSep.value.plus(this.strokeInfo.width)
			let textWidth = new SVG.Number(this.size.x, "px").minus(innerSep.times(2)).convertToUnit("cm")

			options.push(`text width=${roundTikz(textWidth.value)}cm`)
			options.push(`inner sep=${innerSep.toString()}`)

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
			const textSections = mathjaxParser.parse(this.textAreaProperty.value)
			for (const section of textSections) {
				if (section.type == "text") {
					sections.push(section.text.replaceAll(/[\#\%\$\&\_\{\}\~\^\\\n]/g, (match) => replaceDict[match]))
				} else {
					sections.push("$" + section.text + "$")
				}
			}
			let escapedText = sections.join(" ")

			let fontStr = this.textFontSize.value.key == defaultFontSize.key ? "" : `\\${this.textFontSize.value.name} `
			let latexStr = `${fontStr}${escapedText}`
			latexStr =
				this.textColor.value ?
					"\\textcolor" + this.textColor.value.toTikzString() + "{" + latexStr + "}"
				:	latexStr

			command.additionalNodes.push({ options: options, position: pos, content: latexStr, additionalNodes: [] })
		}
	}

	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		const copiedSVG = super.toSVG(defs)
		if (this.textSVG) {
			let texts = copiedSVG.find("text") as SVG.List<SVG.Text>
			for (const textElement of texts) {
				let transform = textElement.transform()
				let fontSize = new SVG.Number(textElement.attr("font-size")).convertToUnit("px").value
				let fill = textElement.fill()

				let g = new SVG.G()
				g.fill(fill)
				g.transform(transform)

				let tspans = textElement.find("tspan") as SVG.List<SVG.Tspan>
				for (const tspanElement of tspans) {
					let pathString = textToSVG.getD(tspanElement.node.textContent, {
						x: Number.parseFloat(tspanElement.node.getAttribute("x")),
						y: Number.parseFloat(tspanElement.node.getAttribute("y")),
						fontSize: fontSize,
					})
					let path = new SVG.Path({ d: pathString })
					g.add(path)
				}
				textElement.parent().add(g)
				textElement.remove()
			}

			if (!this.textAreaProperty.value) {
				copiedSVG.removeElement(copiedSVG.find(".textSVG")[0])
			}
			this.textSVG.removeClass("textSVG")
			copiedSVG.findOne(".textSVG")?.removeClass("textSVG")
		}

		return copiedSVG
	}

	public copyForPlacement(): CircuitComponent {
		return new RectangleComponent(this.createAsText)
	}

	private updateText() {
		this.textSVG?.remove()

		if (this.textAreaProperty.value || this.createAsText) {
			let textData: Text = {
				text: this.textAreaProperty.value || (this.createAsText ? "text component" : ""),
			}
			textData.align = this.textAreaAlign.value.numberID ?? TextAlign.LEFT
			textData.justify = this.textAreaJustify.value.numberID ?? TextJustify.START
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
