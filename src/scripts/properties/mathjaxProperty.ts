import { EditableProperty } from "../internal";

export class MathJaxProperty extends EditableProperty<string>{

	private renderButton:HTMLButtonElement
	private input:HTMLInputElement

	public constructor(initialValue?:string){
		super(initialValue??"")
	}

	public eq(first: string, second: string): boolean {
		return first==second
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col","col-md-12","col-xxl","my-0","input-group", "has-validation")
		{
			let formulaSpan1 = document.createElement("span") as HTMLSpanElement
			formulaSpan1.classList.add("input-group-text")
			formulaSpan1.innerHTML = "$"
			col.appendChild(formulaSpan1)
	
			this.input = document.createElement("input") as HTMLInputElement
			this.input.classList.add("form-control")
			this.input.type = "text"
			this.input.style.minWidth = "50px"
			this.input.value = this.value
			col.appendChild(this.input)
			
			let formulaSpan2 = formulaSpan1.cloneNode(true) as HTMLSpanElement
			formulaSpan2.style.borderRadius="0"
			col.appendChild(formulaSpan2)

			this.renderButton = document.createElement("button") as HTMLButtonElement
			this.renderButton.classList.add("btn", "btn-primary", "px-2")
			this.renderButton.type = "button"
			this.renderButton.innerHTML = "Render"
			col.appendChild(this.renderButton)

			const update = ()=>{
				this.updateValue(this.input.value)
			}

			this.input.addEventListener("keydown",(ev:KeyboardEvent)=>{						
				if (ev.key==="Enter") {
					update()
				}
			})
	
			this.renderButton.addEventListener("click",(ev)=>{
				update()
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