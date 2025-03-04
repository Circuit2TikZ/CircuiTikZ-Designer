import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, fontSizes, Text, TextAlign } from "../internal"

type LineInfo = {
	text: string
	width: number
}
const syllableRegex = /([^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?)|[^aeiouy]+$/gi

export function convertForeignObjectTextToNativeSVGText(text: Text, textBox: SVG.Box) {
	const fontSize = fontSizes.find((fs) => fs.key == text.fontSize).size.toString() + "pt"

	const explicitLines = text.text.split("\n").map((line) => line.trim())

	// get lines including word wrapping
	const lines = explicitLines.map((line) => wrapLine(line, fontSize, textBox.w)).flat(2)

	// convert lines to svg tspans
	let tspans = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]

		const remainingLineSpace = textBox.w - line.width

		const xoffset =
			text.align == TextAlign.RIGHT ? remainingLineSpace
			: text.align == TextAlign.CENTER ? remainingLineSpace / 2
			: 0

		let dy = ""
		if (tspans.length == 0) {
			if (text.justify == 1) {
				dy = ` dy="-${lines.length * 1.2}em"`
			} else if (text.justify == 0) {
				dy = ` dy="-${((1.2 * lines.length) / 2).toPrecision(3)}em"`
			}
		} else {
			dy = ' dy="1.2em"'
		}

		let blockFormat = ""
		if (text.align == TextAlign.JUSTIFY && index < lines.length - 1) {
			const words = line.text.split(" ")
			if (words.length > 1) {
				blockFormat = ` word-spacing="${remainingLineSpace / (words.length - 1)}px"`
			}
		}

		tspans.push(
			`<tspan x="${textBox.x + xoffset}"${blockFormat} baseline-shift="-0.85em"${dy}>${line.text}</tspan>`
		)
	}

	const textPos = new SVG.Point(
		textBox.x,
		text.justify == -1 ? textBox.y
		: text.justify == 1 ? textBox.y2
		: textBox.cy
	)
	let svgText = new SVG.Text()
	svgText.move(textPos.x, textPos.y)
	svgText.fill(text.color == "default" ? "black" : text.color)
	svgText.node.innerHTML = tspans.join("\n")
	svgText.attr("font-family", "Times New Roman")
	svgText.stroke("none")
	svgText.attr("font-size", fontSize)

	return svgText
}

// greedy algorithm to fully use up the text rectangle. maybe change to Knuth–Plass line breaking later on
function wrapLine(line: string, fontSize: string, maxWidth: number): LineInfo[] {
	const words = line.split(/\s+/)
	const completedLines: LineInfo[] = []
	let nextLine = ""

	words.forEach((word, index) => {
		const nextLineWidth = getTextWidth(nextLine, fontSize)
		const wordWidth = getTextWidth((nextLine == "" ? "" : " ") + word, fontSize)
		if (nextLineWidth + wordWidth >= maxWidth) {
			const syllables = word.match(syllableRegex)
			// fit the overflowing word onto as many lines as needed
			let lines = fitWord(syllables, nextLineWidth, maxWidth, fontSize)
			// the first line is what is still possible to put on the "nextLine"
			completedLines.push({
				text: [nextLine, lines[0]].join(""),
				width: nextLineWidth + getTextWidth(lines[0], fontSize),
			})

			let otherLines = lines.splice(1)
			// all other lines exept the last are already completed lines
			for (let index = 0; index < otherLines.length - 1; index++) {
				const line = otherLines[index]
				completedLines.push({
					text: line,
					width: getTextWidth(line, fontSize),
				})
			}
			nextLine = ""
			// the last line should be treated normally as the new next line, which could have breaking words again
			if (otherLines.length > 0) {
				nextLine = otherLines.at(-1)
			}
		} else {
			// if the word fits completely, just add it to the line
			if (nextLine == "") {
				nextLine = word
			} else {
				nextLine = [nextLine, word].join(" ")
			}
		}

		// if no more words are available, add the next line as the final completed line
		if (index + 1 === words.length) {
			completedLines.push({ text: nextLine, width: getTextWidth(nextLine, fontSize) })
		}
	})
	return completedLines.filter((line) => line.text !== "")
}

function fitWord(syllables: string[], currentLineWidth, maxWidth, fontSize): string[] {
	let remainingSyllables = []
	let currentLine = ""
	const min = currentLineWidth > 0 ? 0 : 1 // if an empty line is used, at least one syllable should be written in that line
	for (let index = syllables.length; index >= min; index--) {
		currentLine =
			(currentLineWidth > 0 && index > 0 ? " " : "") +
			syllables.slice(0, index).join("") +
			(index < syllables.length && index > 0 ? "-" : "")
		remainingSyllables = syllables.slice(index)

		let leftWidth = getTextWidth(currentLine, fontSize)
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

function getTextWidth(text: string, fontSize: string): number {
	if (text == "") {
		return 0
	}
	const canvas = document.createElement("canvas")
	const context = canvas.getContext("2d")
	context.font = `${fontSize} "Times New Roman"`
	return context.measureText(text).width
}
