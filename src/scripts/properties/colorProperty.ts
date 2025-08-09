import * as SVG from "@svgdotjs/svg.js"
import { EditableProperty } from "./editableProperty"
import { Undo } from "../internal"

export class ColorProperty extends EditableProperty<SVG.Color | null> {
	private label: string
	private input: HTMLInputElement
	private nullable: boolean
	private enabler: HTMLInputElement

	public constructor(label: string, initialValue?: SVG.Color | null, nullable = true, tooltip = "") {
		super(initialValue, tooltip)
		this.label = label
		this.nullable = nullable
	}

	public eq(first: SVG.Color | null, second: SVG.Color | null): boolean {
		if ((first == null && second == null) || first === second) {
			return true
		}
		if (first == null) {
			return false
		}
		if (second == null) {
			return false
		}
		let f = first.rgb()
		let s = second.rgb()
		return f.r == s.r && f.g == s.g && f.b == s.b
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()
		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "input-group", "my-0")
		{
			let labelElement = document.createElement("label") as HTMLLabelElement
			labelElement.classList.add("input-group-text")
			labelElement.innerHTML = this.label || "Choose color"
			col.appendChild(labelElement)

			if (this.nullable) {
				let enablerDiv = document.createElement("div") as HTMLDivElement
				enablerDiv.classList.add("input-group-text")
				this.enabler = document.createElement("input") as HTMLInputElement
				this.enabler.classList.add("form-check-input", "mt-0")
				this.enabler.setAttribute("type", "checkbox")
				this.enabler.checked = this.value !== null

				this.enabler.addEventListener("change", (ev) => {
					this.updateValue(this.enabler.checked ? new SVG.Color(this.input.value, "rgb") : null)
					Undo.addState()
				})
				enablerDiv.appendChild(this.enabler)
				col.appendChild(enablerDiv)
			}

			this.input = document.createElement("input") as HTMLInputElement
			this.input.classList.add("form-control", "form-control-color")
			this.input.value = this.value ? this.value.toString() : ""
			this.input.setAttribute("type", "color")

			this.input.addEventListener("input", (ev) => {
				if (this.nullable) {
					this.updateValue(this.enabler.checked ? new SVG.Color(this.input.value, "rgb") : null)
				} else {
					this.updateValue(new SVG.Color(this.input.value, "rgb"))
				}
			})
			this.input.addEventListener("change", (ev) => {
				Undo.addState()
			})

			col.appendChild(this.input)
		}
		row.appendChild(col)
		return row
	}

	public updateHTML(): void {
		if (this.value) {
			this.input.value = this.value.toString()
		}
		if (this.enabler) {
			this.enabler.checked = this.value != null
		}
	}
}
