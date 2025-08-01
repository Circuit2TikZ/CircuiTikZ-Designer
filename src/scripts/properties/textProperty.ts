import { EditableProperty, Undo } from "../internal"

export class TextProperty extends EditableProperty<string> {
	private input: HTMLInputElement
	private invalidDiv: HTMLDivElement

	private label: string

	public constructor(label: string, initalValue?: string, tooltip = "") {
		super(initalValue, tooltip)
		this.label = label
	}

	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let inputDiv = document.createElement("div") as HTMLDivElement
		inputDiv.classList.add("col", "col-md-12", "my-0", "input-group", "has-validation")
		{
			let labelSpan = document.createElement("span") as HTMLSpanElement
			labelSpan.classList.add("input-group-text")
			labelSpan.innerHTML = this.label ?? ""
			inputDiv.appendChild(labelSpan)

			this.input = document.createElement("input") as HTMLInputElement
			this.input.classList.add("form-control")
			this.input.setAttribute("type", "text")
			this.input.value = this.value ?? ""
			inputDiv.appendChild(this.input)

			this.invalidDiv = document.createElement("div") as HTMLDivElement
			this.invalidDiv.classList.add("col-12", "invalid-feedback", "d-none")
			inputDiv.appendChild(this.invalidDiv)
		}
		row.appendChild(inputDiv)

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
		return row
	}

	public changeInvalidStatus(msg: string) {
		if (this.invalidDiv) {
			if (msg === "") {
				this.input.classList.remove("is-invalid")
				this.invalidDiv.classList.add("d-none")
				this.invalidDiv.innerHTML = ""
			} else {
				this.input.classList.add("is-invalid")
				this.input.classList.add("is-invalid")
				this.invalidDiv.classList.remove("d-none")
				this.invalidDiv.innerHTML = "Invalid! " + msg
			}
		}
	}

	public updateHTML(): void {
		if (this.input) {
			this.input.value = this.value
		}
	}

	public eq(first: string, second: string): boolean {
		return first == second
	}
}
