import { EditableProperty, Label, Undo } from "../internal"

export class TextProperty extends EditableProperty<string>{

	private input:HTMLInputElement
	
	protected buildHTML(): void {
		this.container = document.createElement("div") as HTMLDivElement
		this.container.classList.add("d-flex", "flex-column", "w-100", "h-auto", "justify-content-start", "align-items-start", "blueprint")

		let span = document.createElement("span") as HTMLSpanElement
		span.classList.add("form-label")
		span.innerHTML = "Label"
		this.container.appendChild(span)

		this.input = document.createElement("input") as HTMLInputElement
		this.input.classList.add("form-control")
		this.input.setAttribute("type","text")
		this.container.appendChild(this.input)

		let invalidDiv = document.createElement("div") as HTMLDivElement
		invalidDiv.classList.add("invalid-feedback", "d-none")
		this.container.appendChild(invalidDiv)

		this._value = ""
		this.input.addEventListener("focusin",(ev)=>{
			this.lastValue = ""
		})
		this.input.addEventListener("input",(ev)=>{
			this.updateValue(this.input.value)
		})

		this.input.addEventListener("focusout",(ev)=>{
			if (this.lastValue!==undefined&&this.value!==undefined&&this.lastValue!==this.value) {
				Undo.addState()
			}
		})
	}

	public get value(): string {
		return this._value
	}

	public set value(value: string) {
		this.input.value = value
		this._value = value
	}
}