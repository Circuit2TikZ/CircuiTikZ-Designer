import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	ChoiceProperty,
	CircuitComponent,
	ColorProperty,
	convertTextToNativeSVGText,
	defaultBasicDirection,
	defaultFontSize,
	FontSize,
	fontSizes,
	MathjaxParser,
	PropertyCategories,
	SectionHeaderProperty,
	ShapeComponent,
	ShapeSaveObject,
	SliderProperty,
	SnapPoint,
	strokeStyleChoices,
	Text,
	TextAlign,
	TextAreaProperty,
	textToSVG,
	TikzNodeCommand,
} from "../internal"
import { rectRectIntersection, roundTikz } from "../utils/selectionHelper"

export type RectangleSaveObject = ShapeSaveObject & {
	text?: Text
}

export class RectangleComponent extends ShapeComponent {
	private static jsonID = "rect"
	static {
		CircuitComponent.jsonSaveMap.set(RectangleComponent.jsonID, RectangleComponent)
	}

	declare protected dragElement: SVG.Rect

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

		this.properties.add(PropertyCategories.text, new SectionHeaderProperty("Text"))
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
		this.properties.add(PropertyCategories.text, this.textAreaProperty)

		this.textFontSize = new ChoiceProperty("Fontsize", fontSizes, defaultFontSize)
		this.textFontSize.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textFontSize)

		this.textInnerSep = new SliderProperty("Inner sep", 0, 10, 0.1, new SVG.Number(5, "pt"))
		this.textInnerSep.addChangeListener((ev) => {
			this.update()
		})
		this.properties.add(PropertyCategories.text, this.textInnerSep)

		this.textColor = new ColorProperty("Color", null)
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

	protected applyJson(saveObject: RectangleSaveObject): void {
		super.applyJson(saveObject)

		if (saveObject.text) {
			let text: Text = {
				text: saveObject.text.text == undefined ? "" : saveObject.text.text,
				align: saveObject.text.align ?? TextAlign.LEFT,
				justify: saveObject.text.justify ?? -1,
				showPlaceholderText: saveObject.text.showPlaceholderText ?? false,
				useHyphenation: saveObject.text.useHyphenation ?? false,
			}
			this.createAsText = text.showPlaceholderText
			this.useHyphenation = text.useHyphenation
			this.textAreaProperty.value = text

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

		if (this.textAreaProperty.value.text) {
			let options: string[] = []

			//treat justify like left aligned
			let alignDir =
				this.textAreaProperty.value.align == TextAlign.JUSTIFY ? -1 : this.textAreaProperty.value.align - 1
			let dir = new SVG.Point(alignDir, this.textAreaProperty.value.justify)

			// which anchor and position corresponds to the direction?
			let anchor = basicDirections.find((item) => item.direction.eq(dir)).name
			let pos = this.position.add(dir.mul(this.size.div(2)).rotate(this.rotationDeg))
			options.push("anchor=" + anchor)

			switch (this.textAreaProperty.value.align) {
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
			const textSections = mathjaxParser.parse(this.textAreaProperty.value.text)
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
		// save which symbols are used by this component
		const backgroundDefs = CanvasController.instance.canvas.findOne("#backgroundDefs") as SVG.Defs

		let labelUse = this.labelRendering?.find("use") ?? []
		let textUse = this.textSVG?.find("use") ?? []

		for (const element of labelUse.concat(textUse)) {
			const id = element.node.getAttribute("xlink:href")
			if (!defs.has(id)) {
				const symbol = backgroundDefs.findOne(id) as SVG.Element
				defs.set(id, symbol.clone(true, false))
			}
		}

		this.labelRendering?.addClass("labelRendering")
		this.textSVG?.addClass("textSVG")
		const copiedSVG = this.visualization.clone(true)
		if (this.labelRendering) {
			if (!this.mathJaxLabel.value) {
				copiedSVG.removeElement(copiedSVG.find(".labelRendering")[0])
			}
			this.labelRendering.removeClass("labelRendering")
			copiedSVG.findOne(".labelRendering")?.removeClass("labelRendering")
		}
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

		let draggable = copiedSVG.find(".draggable")[0]
		if (draggable) {
			copiedSVG.removeElement(draggable)
		}

		const viz = copiedSVG.findOne('[fill-opacity="0"][stroke-opacity="0"]')
		viz?.remove()
		return copiedSVG
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
