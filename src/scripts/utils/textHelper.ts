import * as SVG from "@svgdotjs/svg.js"
import TextToSVG from "text-to-svg"
import { CanvasController, fontSizes, Text, TextAlign } from "../internal"

// the information of a single line
// this contains the information of all elements in the line
// the total width of the line, the ascent and descent of the line
// ascent and descent are the maximum ascent and descent of all elements in the line
type LineInfo = {
	elements: ElementInfo[]
	totalWidth: number
	ascent: number
	descent: number
}

// the information of a single element in a line
// this can be a string or a mathjax rendering
type ElementInfo = {
	element: string | SVG.G
	//the width of the element
	width: number
	// the distance from the baseline to the top of the element
	ascent: number
	// the distance from the baseline to the bottom of the element
	descent: number
}

const syllableRegex = /([^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?)|[^aeiouy]+$/gi

export let textToSVG: TextToSVG

export function loadTextConverter() {
	return new Promise<void>((resolve) => {
		TextToSVG.load(
			"https://cdn.jsdelivr.net/gh/dreampulse/computer-modern-web-font@master/font/Serif/cmunrm.woff",
			(err, tTSVG) => {
				textToSVG = tTSVG
				resolve()
			}
		)
	})
}

// this function converts text into an SVG group containing the text tags and mathjax renderings
// it uses the Mathjax parser to parse the text and then renders the mathjax elements
export function convertTextToNativeSVGText(text: Text, textBox: SVG.Box, useHyphenation = false) {
	const fontSizept = fontSizes.find((fs) => fs.key == text.fontSize).size
	const fontSize = fontSizept.toString() + "pt"

	// used to parse the text into text and mathjax elements
	const mathjaxParser = new MathjaxParser()

	const explicitLines = text.text.split("\n").map((line) => line.trim())

	const lines: LineInfo[] = []
	for (const line of explicitLines) {
		const textSections = mathjaxParser.parse(line)
		const renderedSections: (string | MathJaxRenderInfo)[] = []
		for (const section of textSections) {
			if (section.type == "inline") {
				const rendered = renderMathJax(section.text, fontSizept)
				renderedSections.push(rendered)
			} else {
				section.text.split(/\s+/).forEach((word) => {
					renderedSections.push(word)
				})
			}
		}

		const wrappedLines = wrapLine(renderedSections, fontSize, textBox.w, useHyphenation)
		lines.push(...wrappedLines)
	}

	// return svgText
	return layoutText(lines, text, textBox)
}

function layoutText(lines: LineInfo[], text: Text, textBox: SVG.Box): SVG.G {
	const fontSizept = fontSizes.find((fs) => fs.key == text.fontSize).size
	const fontSizepx = (fontSizept * 4) / 3
	const fontSize = fontSizept.toString() + "pt"
	const spaceWidth = getTextMetrics(" ", fontSize).width
	const lineSpacing = 0.414 // the standard line spacing in em

	const group = new SVG.G()
	const renderedElements = new SVG.G()
	renderedElements.fill(text.color == "default" ? "black" : text.color)
	let tspans = []
	let lineTspans = []

	const defaultTextMetrics = getTextMetrics("pH", fontSize)
	const defaultAscent = defaultTextMetrics.actualBoundingBoxAscent
	const defaultDescent = defaultTextMetrics.actualBoundingBoxDescent

	let currentBaselineYPos = 0

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		line.ascent = index > 0 ? Math.max(line.ascent, defaultAscent) : line.ascent
		line.descent = index < lines.length - 1 ? Math.max(line.descent, defaultDescent) : line.descent

		currentBaselineYPos += line.ascent

		const remainingLineSpace = textBox.w - line.totalWidth

		const xoffset =
			text.align == TextAlign.RIGHT ? remainingLineSpace
			: text.align == TextAlign.CENTER ? remainingLineSpace / 2
			: 0

		const currentSpaceWidth =
			text.align == TextAlign.JUSTIFY ? remainingLineSpace / (line.elements.length - 1) + spaceWidth : spaceWidth

		let currentXPos = 0
		for (let elementIndex = 0; elementIndex < line.elements.length; elementIndex++) {
			const element = line.elements[elementIndex]

			if (typeof element.element == "string") {
				lineTspans.push(
					`<tspan x="${xoffset + currentXPos}" y="${currentBaselineYPos}" >${element.element}</tspan>`
				)
			} else {
				const renderedElement = element.element
				const containerGroup = new SVG.G()
				containerGroup.add(renderedElement)
				containerGroup.transform({
					translateX: xoffset + currentXPos,
					translateY: currentBaselineYPos,
				})
				renderedElements.add(containerGroup)
			}
			currentXPos += currentSpaceWidth + element.width
		}

		tspans.push(lineTspans.join(""))
		lineTspans = []
		currentBaselineYPos += line.descent + (index < lines.length - 1 ? fontSizepx * lineSpacing : 0)
	}

	const ypos = textBox.y + ((text.justify + 1) / 2) * (textBox.h - currentBaselineYPos)

	const textPos = new SVG.Point(textBox.x, ypos)
	let svgText = new SVG.Text()
	svgText.transform({ translateX: textPos.x, translateY: textPos.y })
	svgText.fill(text.color == "default" ? "black" : text.color)
	svgText.node.innerHTML = tspans.join("\n")
	svgText.attr("font-family", "Computer Modern Serif")
	svgText.stroke("none")
	svgText.attr("font-size", fontSize)
	group.add(svgText)

	renderedElements.transform({ translateX: textPos.x, translateY: textPos.y })
	group.add(renderedElements)

	return group
}

// greedy algorithm to fully use up the text rectangle. maybe change to Knuth–Plass line breaking later on
function wrapLine(
	line: (string | MathJaxRenderInfo)[],
	fontSize: string,
	maxWidth: number,
	useHyphenation: boolean
): LineInfo[] {
	const completedLines: LineInfo[] = []
	let currentLine: ElementInfo[] = []
	let currentLineWidth = 0
	let currentMaxAscent = 0
	let currentMaxDescent = 0
	const spaceWidth = getTextMetrics(" ", fontSize).width

	line.forEach((element, index) => {
		let elementWidth = 0
		let elementAscent = 0
		let elementDescent = 0
		const startSpace = currentLineWidth > 0 ? spaceWidth : 0

		if (typeof element === "string") {
			// if the element is a string
			let textMetrics = getTextMetrics(element, fontSize)
			elementWidth = textMetrics.width
			elementAscent = textMetrics.actualBoundingBoxAscent
			elementDescent = textMetrics.actualBoundingBoxDescent

			if (currentLineWidth + startSpace + elementWidth > maxWidth) {
				if (useHyphenation) {
					const syllables = element.match(syllableRegex)
					// if syllables is not empty, fit the word into the linewidth while respecting the bounding box
					if (syllables) {
						let fittedSyllables = fitWord(syllables, currentLineWidth + startSpace, maxWidth, fontSize)

						// Add syllables to lines
						for (let i = 0; i < fittedSyllables.length; i++) {
							let textMetrics = getTextMetrics(fittedSyllables[i], fontSize)
							elementWidth = textMetrics.width
							elementAscent = textMetrics.actualBoundingBoxAscent
							elementDescent = textMetrics.actualBoundingBoxDescent

							if (elementWidth > 0) {
								// Add the fitted syllable to the current line
								currentLine.push({
									ascent: elementAscent,
									descent: elementDescent,
									width: elementWidth,
									element: fittedSyllables[i],
								})
								currentLineWidth += elementWidth + (i == 0 ? startSpace : 0)
								currentMaxAscent = Math.max(currentMaxAscent, elementAscent)
								currentMaxDescent = Math.max(currentMaxDescent, elementDescent)
							}

							// Add to completed lines if it's not the last fitted syllable
							if (i < fittedSyllables.length - 1) {
								completedLines.push({
									elements: currentLine,
									totalWidth: currentLineWidth,
									ascent: currentMaxAscent,
									descent: currentMaxDescent,
								})
								// reset for the next line
								currentLine = []
								currentLineWidth = 0
								currentMaxAscent = 0
								currentMaxDescent = 0
							}
						}
					}
				} else {
					//no hyphenation, just add the current line to the completed lines and start a new line with the current element
					completedLines.push({
						elements: currentLine,
						totalWidth: currentLineWidth,
						ascent: currentMaxAscent,
						descent: currentMaxDescent,
					})
					currentLine = [
						{ ascent: elementAscent, descent: elementDescent, width: elementWidth, element: element },
					]
					currentLineWidth = elementWidth
					currentMaxAscent = elementAscent
					currentMaxDescent = elementDescent
				}
			} else {
				// the current element fits into the current line
				// add the current element to the current line
				currentLine.push({
					ascent: elementAscent,
					descent: elementDescent,
					width: elementWidth,
					element: element,
				})
				currentLineWidth += elementWidth + startSpace
				currentMaxAscent = Math.max(currentMaxAscent, elementAscent)
				currentMaxDescent = Math.max(currentMaxDescent, elementDescent)
			}
		} else {
			// the element is a mathjax rendering
			// the ascent depends on the baseline alignment
			elementAscent = (1 + element.baselineAlignmentRatio) * element.height
			elementDescent = element.height - elementAscent
			elementWidth = element.width

			if (currentLineWidth + startSpace + elementWidth > maxWidth) {
				// if the element does not fit into the current line, add the current line to the completed lines
				completedLines.push({
					elements: currentLine,
					totalWidth: currentLineWidth,
					ascent: currentMaxAscent,
					descent: currentMaxDescent,
				})
				// and start a new line with the current element
				currentLine = [
					{ ascent: elementAscent, descent: elementDescent, width: elementWidth, element: element.element },
				]
				currentLineWidth = elementWidth
				currentMaxAscent = elementAscent
				currentMaxDescent = elementDescent
			} else {
				// the current element fits into the current line
				// add the current element to the current line
				currentLine.push({
					ascent: elementAscent,
					descent: elementDescent,
					width: elementWidth,
					element: element.element,
				})
				currentLineWidth += elementWidth + startSpace
				currentMaxAscent = Math.max(currentMaxAscent, elementAscent)
				currentMaxDescent = Math.max(currentMaxDescent, elementDescent)
			}
		}

		// Add the last line if it's the final element
		if (index === line.length - 1 && currentLine.length > 0) {
			completedLines.push({
				elements: currentLine,
				totalWidth: currentLineWidth,
				ascent: currentMaxAscent,
				descent: currentMaxDescent,
			})
		}
	})

	// remove empty lines
	return completedLines.filter((line) => line.elements.length > 0)
}

// fit the word into the current line width
// if the word is too long, split it into syllables and add a hyphen
function fitWord(syllables: string[], currentLineWidth: number, maxWidth: number, fontSize: string): string[] {
	let remainingSyllables = []
	let currentLine = ""
	const min = currentLineWidth > 0 ? 0 : 1 // if an empty line is used, at least one syllable should be written in that line
	for (let index = syllables.length; index >= min; index--) {
		currentLine = syllables.slice(0, index).join("") + (index < syllables.length && index > 0 ? "-" : "")
		remainingSyllables = syllables.slice(index)

		let leftWidth = getTextMetrics(currentLine, fontSize).width
		if (currentLineWidth + leftWidth < maxWidth) {
			break
		}
	}
	let remainingLines = []
	if (remainingSyllables.length > 0) {
		remainingLines = fitWord(remainingSyllables, 0, maxWidth, fontSize)
	}
	return [currentLine].concat(remainingLines)
}

// get the metrics of a string
// this is used to get the width of the string and the ascent and descent of the font
// the ascent and descent are used to calculate the position of the text
function getTextMetrics(text: string, fontSize: string): TextMetrics {
	const canvas = document.createElement("canvas")
	const context = canvas.getContext("2d")
	context.font = `${fontSize} "Computer Modern Serif"`
	return context.measureText(text)
}
export type MathJaxRenderInfo = {
	// the rendered mathjax element
	element: SVG.G
	// how much the baseline of the rendered mathjax element is shifted from the baseline of the text
	baselineAlignmentRatio: number
	// the width of the rendered mathjax element
	width: number
	// the height of the rendered mathjax element
	height: number
}
export function renderMathJax(text: string, fontSize = 10): MathJaxRenderInfo {
	// @ts-ignore
	window.MathJax.texReset()
	// @ts-ignore
	const node = window.MathJax.tex2svg(text, { display: false })
	// mathjax renders the text via an svg container. That container also contains definitions and SVG.Use elements. get that container
	let svgElement = new SVG.Svg(node.querySelector("svg"))

	// move the label definitions to the overall definitions of the canvas
	let backgroundDefs = CanvasController.instance.canvas.findOne("#backgroundDefs") as SVG.Defs
	let defs = svgElement.findOne("defs") as SVG.Defs
	for (const def of defs.children()) {
		backgroundDefs.put(def)
	}
	defs.remove()

	// 1.971 magic number (how large 1em, i.e. font size, is in terms of ex) for the font used in MathJax.
	// 1.137 is a correction factor to make the normal text ex align with the mathjax ex (looks better). this is a bit of a hack
	let exem = 1 / (1.971 * 1.137)
	//convert width and height from ex to pt via expt and then to px
	let widthStr = svgElement.node.getAttribute("width")
	let width = new SVG.Number(new SVG.Number(widthStr).value * exem * fontSize, "pt").convertToUnit("px")
	let heightStr = svgElement.node.getAttribute("height")
	let height = new SVG.Number(new SVG.Number(heightStr).value * exem * fontSize, "pt").convertToUnit("px")
	let size = new SVG.Point(width.value, height.value)

	// remove unnecessary data
	for (const elementGroup of svgElement.find("use")) {
		elementGroup.node.removeAttribute("data-c")
	}
	let groupElements = svgElement.find("g") as SVG.List<SVG.G>
	for (const elementGroup of groupElements) {
		elementGroup.node.removeAttribute("data-mml-node")
	}
	// remove unnecessary svg groups
	for (const elementGroup of groupElements) {
		let children = elementGroup.children()
		if (children.length == 1 && !elementGroup.node.hasAttributes()) {
			elementGroup.parent().put(children[0])
			elementGroup.remove()
		} else {
			if (elementGroup.fill() == "currentColor") {
				elementGroup.fill("inherit")
			}
		}
	}

	//remove background of mathjax error message
	for (const elementGroup of svgElement.find("rect")) {
		if (elementGroup.node.hasAttribute("data-background")) {
			elementGroup.remove()
		}
	}

	// the current rendering svg viewbox
	let svgViewBox = svgElement.viewbox()

	// scale such that px size is actually correct for rendering
	let scale = size.div(new SVG.Point(svgViewBox.w, svgViewBox.h))
	let m = new SVG.Matrix({
		scaleX: scale.x,
		scaleY: scale.y,
	})
	// add all symbol components to a group
	let transformGroup = new SVG.G()
	for (const child of svgElement.children()) {
		transformGroup.add(child)
	}
	// apply the transformation --> the symbol now has the correct size and no rotation
	transformGroup.transform(m)

	let renderInfo: MathJaxRenderInfo = {
		element: transformGroup,
		baselineAlignmentRatio:
			new SVG.Number(svgElement.node.style.verticalAlign).value /
			svgElement.node.height.baseVal.valueInSpecifiedUnits,
		width: size.x,
		height: size.y,
	}

	return renderInfo
}

export class MathjaxParser {
	// adjusted from https://github.com/bersling/mathjax-parser

	private config: MathjaxParserConfig

	public parse(inputText: string, config?: MathjaxParserConfig): TextSection[] {
		//set a default config
		this.config = config || {
			inlineMath: [
				["$", "$"],
				["\\(", "\\)"],
			],
		}

		const delimiterArray = this.buildDelimiterArray(this.config)

		const state = this.findDelimiterPairs(delimiterArray, inputText)

		let result: TextSection[] = []
		let startIdx = 0
		for (let index = 0; index < state.matchedDelimiterSets.length; index++) {
			const delimiterSet = state.matchedDelimiterSets[index]

			if (delimiterSet.start.index > startIdx) {
				// after finding the delimiter pairs, we need to replace the escaped dollar signs with a single dollar sign in order to show only the dollar sign in the ui
				const adjustedText = inputText.slice(startIdx, delimiterSet.start.index).replace(/\\\$/g, "$")
				result.push({ text: adjustedText.trim(), type: "text" })
			}
			let innerStart = delimiterSet.start.index + delimiterSet.start.delimiterGroup.group[0].length
			let outerEnd = delimiterSet.end.index + delimiterSet.end.delimiterGroup.group[1].length

			result.push({
				text: inputText.slice(innerStart, delimiterSet.end.index),
				type: delimiterSet.start.delimiterGroup.type,
			})

			startIdx = outerEnd
		}

		if (startIdx < inputText.length) {
			// after finding the delimiter pairs, we need to replace the escaped dollar signs with a single dollar sign in order to show only the dollar sign in the ui
			const adjustedText = inputText.slice(startIdx).replace(/\\\$/g, "$")
			result.push({ text: adjustedText.trim(), type: "text" })
		}

		return result
	}

	private buildDelimiterArray(config: MathjaxParserConfig): DelimiterGroup[] {
		let delimiterArray: DelimiterGroup[] = []
		let insertAtIndex = (idx: number, delimiterArray, grp: string[], type: string) => {
			delimiterArray.splice(idx, 0, {
				group: grp,
				type: type,
			})
		}
		let findIndex = (delimiterArray: DelimiterGroup[], startDelimiter: string): number => {
			let index = 0
			for (let i = 0; i < delimiterArray.length; i++) {
				if (startDelimiter.indexOf(delimiterArray[i].group[0]) > -1) {
					break
				}
				++index
			}
			return index
		}

		config.inlineMath.forEach((grp) => {
			let idx = findIndex(delimiterArray, grp[0])
			insertAtIndex(idx, delimiterArray, grp, "inline")
		})
		return delimiterArray
	}

	private findDelimiterPairs(delimiterArray: DelimiterGroup[], textContent: string): CurrentState {
		//Iterate through all delimiters, trying to find matching delimiters
		let state: CurrentState = {
			matchedDelimiterSets: [],
		}

		let idx = 0
		while (idx < textContent.length) {
			//if all occurrences of delimiters so far are closed (i.e. have 'end'), we're looking for a new opening delimiter
			if (
				state.matchedDelimiterSets.length === 0 ||
				state.matchedDelimiterSets[state.matchedDelimiterSets.length - 1].end
			) {
				let isMatch: boolean = false
				delimiterArray.some((delimiterGroup) => {
					if (this.isMatchingIndex(textContent, idx, delimiterGroup.group[0])) {
						state.lastMatchedGroup = delimiterGroup
						MathjaxParser.pushStart(state.matchedDelimiterSets, idx, delimiterGroup)
						isMatch = true
						return true
					}
				})
				if (isMatch) {
					idx += state.lastMatchedGroup.group[0].length
				} else {
					++idx
				}
			}

			//if start matched, but end not matched yet
			else {
				if (this.isMatchingIndex(textContent, idx, state.lastMatchedGroup.group[1])) {
					MathjaxParser.pushEnd(state.matchedDelimiterSets, idx, state.lastMatchedGroup)
					idx += state.lastMatchedGroup.group[1].length
				} else {
					++idx
				}
			}
		}

		this.cleanOccurrences(state.matchedDelimiterSets)

		return state
	}

	private cleanOccurrences = (occurrences: MyRange<DelimiterMatch>[]) => {
		if (occurrences.length > 0) {
			if (!occurrences[occurrences.length - 1].end) {
				occurrences.pop()
			}
		}
	}

	private static pushStart(
		matchedDelimiterSets: MyRange<DelimiterMatch>[],
		idx: number,
		delimiterGroup: DelimiterGroup
	) {
		matchedDelimiterSets.push({
			start: {
				index: idx,
				delimiterGroup: delimiterGroup,
				isStart: true,
			},
			end: undefined,
		})
	}

	private static pushEnd(
		matchedDelimiterSets: MyRange<DelimiterMatch>[],
		idx: number,
		delimiterGroup: DelimiterGroup
	) {
		matchedDelimiterSets[matchedDelimiterSets.length - 1].end = {
			index: idx,
			delimiterGroup: delimiterGroup,
			isStart: false,
		}
	}

	private isMatchingIndex(text: string, idx: number, delimiter: string): boolean {
		//check number of consecutive escape characters "\" before the delimiter. If uneven, the current delimiter is escaped and not actually matching
		if (idx > 0 && text.slice(0, idx).match(/\\*$/gi)[0].length % 2 == 1) {
			return false
		}
		return text.slice(idx, idx + delimiter.length) === delimiter
	}
}

interface TextSection {
	text: string
	type: MathType
}

interface MyRange<T> {
	start: T
	end: T
}
interface DelimiterMatch {
	index: number
	isStart: boolean
	delimiterGroup: DelimiterGroup
}

interface MathjaxParserConfig {
	inlineMath: string[][] //e.g. [['$','$'],['\\(','\\)']]
}

interface DelimiterGroup {
	group: string[]
	type: MathType
}

interface CurrentState {
	matchedDelimiterSets: MyRange<DelimiterMatch>[]
	lastMatchedGroup?: DelimiterGroup
}

type MathType = "text" | "inline"
