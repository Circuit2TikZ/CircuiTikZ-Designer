import { EditableProperty, Label, Undo } from "../internal"

export class TextProperty extends EditableProperty<string>{
	private input:HTMLInputElement
	private invalidDiv:HTMLDivElement
	
	public buildHTML(): HTMLElement {
		this.container?.remove()
		this.container = document.createElement("div") as HTMLDivElement
		this.container.classList.add("d-flex", "flex-column", "w-100", "h-auto", "justify-content-start", "align-items-start")

		let span = document.createElement("span") as HTMLSpanElement
		span.classList.add("form-label")
		span.innerHTML = this._label??""
		this.container.appendChild(span)

		this.input = document.createElement("input") as HTMLInputElement
		this.input.classList.add("form-control")
		this.input.setAttribute("type","text")
		this.input.value = this._value??""
		this.container.appendChild(this.input)

		this.invalidDiv = document.createElement("div") as HTMLDivElement
		this.invalidDiv.classList.add("invalid-feedback", "d-none")
		this.container.appendChild(this.invalidDiv)

		this.input.addEventListener("focusin",(ev)=>{
			this.lastValue = ""
		})
		this.input.addEventListener("input",(ev)=>{
			this.updateValue(this.input.value)
		})

		this.input.addEventListener("focusout",(ev)=>{
			if (this.lastValue!==undefined&&this.getValue()!==undefined&&this.lastValue!==this.getValue()) {
				Undo.addState()
			}
		})
		return this.container
	}

	public changeInvalidStatus(msg:string){
		if (this.invalidDiv) {
			if (msg==="") {
				this.input.classList.remove("is-invalid")
				this.invalidDiv.classList.add("d-none")
				this.invalidDiv.innerHTML=""
			}else{
				this.input.classList.add("is-invalid")
				this.invalidDiv.classList.remove("d-none")
				this.invalidDiv.innerHTML="Invalid! "+msg
			}
		}
	}

	public getValue(): string {
		return this._value
	}
	public setValue(value: string, updateHTML=true): void {
		this._value = value
		if (this.input&&updateHTML) {
			this.input.value = value
		}
	}
}