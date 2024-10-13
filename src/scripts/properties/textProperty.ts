import { EditableProperty, Undo } from "../internal"

export class TextProperty extends EditableProperty<string>{
	private input:HTMLInputElement
	private invalidDiv:HTMLDivElement
	
	public buildHTML(container:HTMLElement): void {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","g-2", "my-2")

		let span = document.createElement("span") as HTMLSpanElement
		span.classList.add("col-3","form-label")
		span.innerHTML = this._label??""
		row.appendChild(span)
		
		let inputDiv = document.createElement("div") as HTMLDivElement
		inputDiv.classList.add("col","col-md-12")
		{
			this.input = document.createElement("input") as HTMLInputElement
			this.input.classList.add("w-100","form-control")
			this.input.setAttribute("type","text")
			this.input.value = this._value??""
			inputDiv.appendChild(this.input)
			
			this.invalidDiv = document.createElement("div") as HTMLDivElement
			this.invalidDiv.classList.add("col-12","invalid-feedback", "d-none")
			inputDiv.appendChild(this.invalidDiv)
		}
		row.appendChild(inputDiv)

		this.input.addEventListener("focusin",(ev)=>{
			this.lastValue = this._value??""
		})
		this.input.addEventListener("input",(ev)=>{
			this.updateValue(this.input.value)
		})

		this.input.addEventListener("focusout",(ev)=>{
			if (this.lastValue!==undefined&&this.getValue()!==undefined&&this.lastValue!==this.getValue()) {
				Undo.addState()
			}
		})
		container.appendChild(row)
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