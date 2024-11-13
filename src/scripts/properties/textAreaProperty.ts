import * as SVG from "@svgdotjs/svg.js"
import { ChoiceEntry, EditableProperty, Undo } from "../internal"
import sanitizeHtml from "sanitize-html"

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
	justify?: number
	fontSize?: string
	innerSep?: SVG.Number
	color?: string | "default"
}

export enum TextAlign {
	LEFT,
	CENTER,
	RIGHT,
	JUSTIFY,
}

export class TextAreaProperty extends EditableProperty<Text> {
	private input: HTMLTextAreaElement

	private alignLeft: HTMLInputElement
	private alignCenter: HTMLInputElement
	private alignRight: HTMLInputElement
	private alignJustify: HTMLInputElement
	private justifyStart: HTMLInputElement
	private justifyCenter: HTMLInputElement
	private justifyEnd: HTMLInputElement

	public constructor(initalValue?: Text) {
		super(initalValue)
	}

	public buildHTML(): HTMLElement {
		let rowTextArea = this.getRow()
		//font size
		//align top-bottom, left-right

		let inputDiv = document.createElement("div") as HTMLDivElement
		inputDiv.classList.add("col-12", "mt-0")
		//<textarea class="form-control" id="exampleFormControlTextarea1" rows="3"></textarea>
		{
			this.input = document.createElement("textArea") as HTMLTextAreaElement
			this.input.classList.add("form-control")
			this.input.value = this.value.text ?? ""
			inputDiv.appendChild(this.input)
		}
		rowTextArea.appendChild(inputDiv)

		let previousState: Text
		this.input.addEventListener("focusin", (ev) => {
			previousState = this.value
		})
		this.input.addEventListener("input", (ev) => {
			this.update()
		})

		this.input.addEventListener("focusout", (ev) => {
			if (this.value && previousState !== this.value) {
				Undo.addState()
			}
		})

		const btnLabelClasses = [
			"btn",
			"btn-outline-secondary",
			"fs-5",
			"material-symbols-outlined",
			"d-flex",
			"align-items-center",
			"justify-content-center",
			"px-1",
			"flex-grow-1",
		]

		let alignDiv = document.createElement("div") as HTMLDivElement
		alignDiv.classList.add("col-12", "input-group")
		{
			let labelAlign = document.createElement("span") as HTMLSpanElement
			labelAlign.classList.add("col-4", "input-group-text")
			labelAlign.innerHTML = "Align"
			alignDiv.appendChild(labelAlign)

			//left
			this.alignLeft = document.createElement("input") as HTMLInputElement
			this.alignLeft.classList.add("btn-check")
			this.alignLeft.type = "radio"
			this.alignLeft.name = "align"
			this.alignLeft.id = "alignLeft"
			this.alignLeft.checked = true
			this.alignLeft.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			alignDiv.appendChild(this.alignLeft)

			let alignLeftLabel = document.createElement("label") as HTMLLabelElement
			alignLeftLabel.classList.add(...btnLabelClasses)
			alignLeftLabel.innerHTML = "format_align_left"
			alignLeftLabel.setAttribute("for", "alignLeft")
			alignDiv.appendChild(alignLeftLabel)

			//center
			this.alignCenter = document.createElement("input") as HTMLInputElement
			this.alignCenter.classList.add("btn-check")
			this.alignCenter.type = "radio"
			this.alignCenter.name = "align"
			this.alignCenter.id = "alignCenter"
			this.alignCenter.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			alignDiv.appendChild(this.alignCenter)

			let alignCenterLabel = document.createElement("label") as HTMLLabelElement
			alignCenterLabel.classList.add(...btnLabelClasses)
			alignCenterLabel.innerHTML = "format_align_center"
			alignCenterLabel.setAttribute("for", "alignCenter")
			alignDiv.appendChild(alignCenterLabel)

			//right
			this.alignRight = document.createElement("input") as HTMLInputElement
			this.alignRight.classList.add("btn-check")
			this.alignRight.type = "radio"
			this.alignRight.name = "align"
			this.alignRight.id = "alignRight"
			this.alignRight.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			alignDiv.appendChild(this.alignRight)

			let alignRightLabel = document.createElement("label") as HTMLLabelElement
			alignRightLabel.classList.add(...btnLabelClasses)
			alignRightLabel.innerHTML = "format_align_right"
			alignRightLabel.setAttribute("for", "alignRight")
			alignDiv.appendChild(alignRightLabel)

			//justify
			this.alignJustify = document.createElement("input") as HTMLInputElement
			this.alignJustify.classList.add("btn-check")
			this.alignJustify.type = "radio"
			this.alignJustify.name = "align"
			this.alignJustify.id = "alignJustify"
			this.alignJustify.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			alignDiv.appendChild(this.alignJustify)

			let alignJustifyLabel = document.createElement("label") as HTMLLabelElement
			alignJustifyLabel.classList.add(...btnLabelClasses)
			alignJustifyLabel.innerHTML = "format_align_justify"
			alignJustifyLabel.setAttribute("for", "alignJustify")
			alignDiv.appendChild(alignJustifyLabel)
		}
		rowTextArea.appendChild(alignDiv)

		let justifyDiv = document.createElement("div") as HTMLDivElement
		justifyDiv.classList.add("col-12", "input-group")
		{
			let labelAlign = document.createElement("span") as HTMLSpanElement
			labelAlign.classList.add("col-4", "input-group-text")
			labelAlign.innerHTML = "Justify"
			justifyDiv.appendChild(labelAlign)

			//left
			this.justifyStart = document.createElement("input") as HTMLInputElement
			this.justifyStart.classList.add("btn-check")
			this.justifyStart.type = "radio"
			this.justifyStart.name = "justify"
			this.justifyStart.id = "justifyStart"
			this.justifyStart.checked = true
			this.justifyStart.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			justifyDiv.appendChild(this.justifyStart)

			let justifyStartLabel = document.createElement("label") as HTMLLabelElement
			justifyStartLabel.classList.add(...btnLabelClasses)
			justifyStartLabel.innerHTML = "vertical_align_top"
			justifyStartLabel.setAttribute("for", "justifyStart")
			justifyDiv.appendChild(justifyStartLabel)

			//center
			this.justifyCenter = document.createElement("input") as HTMLInputElement
			this.justifyCenter.classList.add("btn-check")
			this.justifyCenter.type = "radio"
			this.justifyCenter.name = "justify"
			this.justifyCenter.id = "justifyCenter"
			this.justifyCenter.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			justifyDiv.appendChild(this.justifyCenter)

			let justifyCenterLabel = document.createElement("label") as HTMLLabelElement
			justifyCenterLabel.classList.add(...btnLabelClasses)
			justifyCenterLabel.innerHTML = "vertical_align_center"
			justifyCenterLabel.setAttribute("for", "justifyCenter")
			justifyDiv.appendChild(justifyCenterLabel)

			//right
			this.justifyEnd = document.createElement("input") as HTMLInputElement
			this.justifyEnd.classList.add("btn-check")
			this.justifyEnd.type = "radio"
			this.justifyEnd.name = "justify"
			this.justifyEnd.id = "justifyEnd"
			this.justifyEnd.addEventListener("change", (ev) => {
				this.update()
				Undo.addState()
			})
			justifyDiv.appendChild(this.justifyEnd)

			let justifyEndLabel = document.createElement("label") as HTMLLabelElement
			justifyEndLabel.classList.add(...btnLabelClasses)
			justifyEndLabel.innerHTML = "vertical_align_bottom"
			justifyEndLabel.setAttribute("for", "justifyEnd")
			justifyDiv.appendChild(justifyEndLabel)
		}
		rowTextArea.appendChild(justifyDiv)

		return rowTextArea
	}

	private update() {
		let sanitizedText = sanitizeHtml(this.input.value, {
			allowedTags: [],
			allowedAttributes: {},
		})
		let data: Text = {
			text: sanitizedText,
			align:
				this.alignLeft.checked ? TextAlign.LEFT
				: this.alignCenter.checked ? TextAlign.CENTER
				: this.alignRight.checked ? TextAlign.RIGHT
				: TextAlign.JUSTIFY,
			justify:
				this.justifyStart.checked ? -1
				: this.justifyCenter.checked ? 0
				: 1,
		}
		this.updateValue(data)
	}

	public updateHTML(): void {
		if (this.input) {
			this.input.value = this.value.text
			switch (this.value.align) {
				case TextAlign.LEFT:
					this.alignLeft.checked = true
					break
				case TextAlign.CENTER:
					this.alignCenter.checked = true
					break
				case TextAlign.RIGHT:
					this.alignRight.checked = true
					break
				case TextAlign.JUSTIFY:
					this.alignJustify.checked = true
					break
				default:
					break
			}
			switch (this.value.justify) {
				case -1:
					this.justifyStart.checked = true
					break
				case 0:
					this.justifyCenter.checked = true
					break
				case 1:
					this.justifyEnd.checked = true
					break
				default:
					break
			}
		}
	}

	public eq(first: Text, second: Text): boolean {
		return first.text == second.text && first.align == second.align && first.justify == second.justify
	}
}
