import { CanvasController, EditableProperty, Undo } from "../internal"

export class MathJaxProperty extends EditableProperty<string> {
	private input: HTMLInputElement

	public constructor(initialValue?: string, tooltip = "") {
		super(initialValue ?? "", tooltip)
	}

	public eq(first: string, second: string): boolean {
		return first == second
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col", "col-md-12", "col-xxl", "my-0", "input-group")
		{
			let formulaSpan1 = document.createElement("span") as HTMLSpanElement
			formulaSpan1.classList.add("input-group-text")
			formulaSpan1.innerHTML = "$"
			col.appendChild(formulaSpan1)

			this.input = document.createElement("input") as HTMLInputElement
			this.input.classList.add("form-control")
			this.input.type = "text"
			this.input.value = this.value ?? ""
			col.appendChild(this.input)

			let formulaSpan2 = document.createElement("div") as HTMLDivElement
			formulaSpan2.classList.add("input-group-text")
			formulaSpan2.innerHTML = "$"
			col.appendChild(formulaSpan2)

			let previousState = ""
			this.input.addEventListener("focusin", (ev) => {
				previousState = this.value ?? ""
			})
			this.input.addEventListener("input", (ev) => {
				this.updateValue(this.input.value)
			})

			this.input.addEventListener("focusout", (ev) => {
				if (this.value && previousState !== this.value) {
					Undo.addState()
				}
			})
			this.input.addEventListener("mousedown", (ev) => {
				CanvasController.instance.draggingFromInput = this.input
			})
		}
		row.appendChild(col)
		return row
	}
	public updateHTML(): void {
		if (this.input) {
			this.input.value = this.value
		}
	}
}
