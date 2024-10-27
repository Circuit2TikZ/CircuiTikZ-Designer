import { EditableProperty, Undo } from "../internal";

export class ChoiceProperty extends EditableProperty<string|number>{

	private label:string
	private selectElement:HTMLSelectElement
	private choiceOptions:{[key:string]:string|number}

	public constructor(label:string, choiceOptions:{[key:string]:string|number}, initialValue?:string|number){
		super(initialValue)
		this.label = label
		this.choiceOptions=choiceOptions
	}
	public eq<T=string|number>(first: T, second: T): boolean {
		return first==second
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col= document.createElement("div") as HTMLDivElement
		col.classList.add("col-12","input-group","my-0")
		{			
			let anchorLabel = document.createElement("label") as HTMLLabelElement
			anchorLabel.classList.add("input-group-text")
			anchorLabel.innerHTML = this.label
			col.appendChild(anchorLabel)

			let labelKeys = Object.keys(this.choiceOptions)
			let labelValues = Object.values(this.choiceOptions)

			this.selectElement = document.createElement("select") as HTMLSelectElement
			this.selectElement.classList.add("form-select")
			this.selectElement.name = "anchor"
			for (let index = 0; index < labelKeys.length; index++) {
				const labelKey = labelKeys[index];
				const labelValue = labelValues[index];
	
				let optionElement = document.createElement("option") as HTMLOptionElement
				optionElement.value = labelKey
				optionElement.innerHTML = typeof labelValue == "string"?labelValue:labelValue.toString()
				optionElement.selected = this.value?labelValue==this.value:false
				this.selectElement.appendChild(optionElement)	
			}

			this.selectElement.addEventListener("change", (ev)=>{
				this.updateValue(this.choiceOptions[this.selectElement.value])
				Undo.addState()
			})
			col.appendChild(this.selectElement)
		}
		row.appendChild(col)
		return row
	}
	public updateHTML(): void {
		if (this.selectElement) {
			let key = Object.entries(this.choiceOptions).find((value)=>{
				return value[1]==this.value
			})[0]
			for (const optionElement of this.selectElement.children) {
				(optionElement as HTMLOptionElement).selected = (optionElement as HTMLOptionElement).value==key
			}
		}
	}
}