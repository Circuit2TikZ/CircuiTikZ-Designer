import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, fontSizes, Text, TextAlign } from "../internal"

type LineInfo = {
	text: string
	width: number
}

export function convertForeignObjectTextToNativeSVGText(text: Text, textBox: SVG.Box) {
	const fontSize = fontSizes.find((fs) => fs.key == text.fontSize).size.toString() + "pt"

	const explicitLines = text.text.split("\n").map((line) => line.trim())
	const lines = explicitLines.map((line) => wrapLabel(line, fontSize, textBox.w)).flat(2)

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

function wrapLabel(label: string, fontSize: string, maxWidth: number): LineInfo[] {
	const words = label.split(" ")
	const completedLines: LineInfo[] = []
	let nextLine = ""
	words.forEach((word, index) => {
		const wordLength = getTextWidth(`${word} `, fontSize)
		const nextLineLength = getTextWidth(nextLine, fontSize)
		if (wordLength > maxWidth) {
			const { hyphenatedStrings, remainingWord } = breakString(word, fontSize, maxWidth)
			completedLines.push({ text: nextLine, width: nextLineLength }, ...hyphenatedStrings)
			nextLine = remainingWord
		} else if (nextLineLength + wordLength >= maxWidth) {
			completedLines.push({ text: nextLine, width: nextLineLength })
			nextLine = word
		} else {
			nextLine = [nextLine, word].filter(Boolean).join(" ")
		}
		const currentWord = index + 1
		const isLastWord = currentWord === words.length
		if (isLastWord) {
			completedLines.push({ text: nextLine, width: getTextWidth(nextLine, fontSize) })
		}
	})
	return completedLines.filter((line) => line.text !== "")
}

function breakString(word: string, fontSize: string, maxWidth: number, hyphenCharacter = "-") {
	const characters = word.split("")
	const lines: LineInfo[] = []
	let currentLine = ""
	characters.forEach((character, index) => {
		const nextLine = `${currentLine}${character}`
		const lineWidth = getTextWidth(nextLine, fontSize)
		if (lineWidth >= maxWidth) {
			const currentCharacter = index + 1
			const isLastLine = characters.length === currentCharacter
			const hyphenatedNextLine = `${nextLine}${hyphenCharacter}`
			lines.push({ text: isLastLine ? nextLine : hyphenatedNextLine, width: lineWidth })
			currentLine = ""
		} else {
			currentLine = nextLine
		}
	})
	return { hyphenatedStrings: lines, remainingWord: currentLine }
}

function getTextWidth(text: string, fontSize: string): number {
	const canvas = document.createElement("canvas")
	const context = canvas.getContext("2d")
	context.font = `${fontSize} "Times New Roman"`
	return context.measureText(text).width
}
