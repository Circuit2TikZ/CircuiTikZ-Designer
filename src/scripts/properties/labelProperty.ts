import { Element } from "@svgdotjs/svg.js";
import { EditableProperty, NodeComponent } from "../internal"

export enum LabelAnchor {
	default="default",
	center="center",
	north="north",
	south="south",
	east="east",
	west="west",
	northeast="north east",
	northwest="north west",
	southeast="south east",
	southwest="south west"
}

export type Label = {
	value:string
	anchor?:LabelAnchor
	labelDistance?:number
	rendering?: Element
}

export class LabelProperty extends EditableProperty<Label>{
	public getValue(): Label {
		return this._value
	}
	public setValue(value: Label, updateHTML?: boolean): void {
		if (value) {
			let rendering = this._value?.rendering
			this._value = {
				value:value.value,
				labelDistance:value.labelDistance,
				anchor:value.anchor
			}
			if (value.rendering) {
				this._value.rendering=value.rendering
			}else{
				this._value.rendering=rendering
			}
		}
		if (updateHTML) {
			this.input.value = value.value
		}
	}

	private input:HTMLInputElement
	private renderButton:HTMLButtonElement
	private invalidDiv:HTMLDivElement
	
	private distanceInput:HTMLInputElement
	private anchorSelect:HTMLSelectElement

	public buildHTML(container:HTMLElement): void {
		let row1 = document.createElement("div") as HTMLDivElement
		row1.classList.add("row","g-2","my-2")
		{
			let labelSpan = document.createElement("span") as HTMLSpanElement
			labelSpan.classList.add("col-3","col-md-12","form-label")
			labelSpan.innerHTML = this._label??""
			row1.appendChild(labelSpan)
	
			let div2 = document.createElement("div") as HTMLDivElement
			div2.classList.add("col","col-md-12","col-xxl","input-group", "has-validation")
			{
				let formulaSpan1 = document.createElement("span") as HTMLSpanElement
				formulaSpan1.classList.add("input-group-text")
				formulaSpan1.innerHTML = "$"
				div2.appendChild(formulaSpan1)
		
				this.input = document.createElement("input") as HTMLInputElement
				this.input.classList.add("form-control")
				this.input.type = "text"
				this.input.style.minWidth = "50px"
				this.input.value = this._value?(this._value.value??""):""
				div2.appendChild(this.input)
				
				div2.appendChild(formulaSpan1.cloneNode(true))

				this.invalidDiv = document.createElement("div") as HTMLDivElement
				this.invalidDiv.classList.add("invalid-feedback","d-none")
				div2.appendChild(this.invalidDiv)

				this.renderButton = document.createElement("button") as HTMLButtonElement
				this.renderButton.classList.add("btn", "btn-secondary", "px-2")
				this.renderButton.type = "button"
				this.renderButton.innerHTML = "Render"
				div2.appendChild(this.renderButton)
			}
			row1.appendChild(div2)
		}

		this.input.addEventListener("keydown",(ev:KeyboardEvent)=>{						
			if (ev.key==="Enter") {
				if (this._value.value!==this.input.value) {
					this.update()
				}
			}
		})

		this.renderButton.addEventListener("click",(ev)=>{
			this.update()
		})

		if (this.componentReference instanceof NodeComponent) {
			let positionDiv= document.createElement("div") as HTMLDivElement
			positionDiv.classList.add("col-12","input-group")

			let anchorLabel = document.createElement("label") as HTMLLabelElement
			anchorLabel.classList.add("input-group-text")
			anchorLabel.setAttribute("for","labelAnchor")
			anchorLabel.innerHTML = "Position"
			positionDiv.appendChild(anchorLabel)

			this.anchorSelect = document.createElement("select") as HTMLSelectElement
			this.anchorSelect.classList.add("form-select")
			this.anchorSelect.id = "labelAnchor"
			this.anchorSelect.name = "anchor"
			let labelKeys = Object.keys(LabelAnchor)
			let labelValues = Object.values(LabelAnchor)
			let options = ["default","center","north","south","east","west","north east","north west","south east","south west"]
			for (let index = 0; index < labelKeys.length; index++) {
				const labelKey = labelKeys[index];
				const labelValue = labelValues[index];

				let optionElement = document.createElement("option") as HTMLOptionElement
				optionElement.value = labelKey
				optionElement.innerHTML = labelValue
				this.anchorSelect.appendChild(optionElement)
			}
			positionDiv.appendChild(this.anchorSelect)
			row1.appendChild(positionDiv)

			let distanceDiv = document.createElement("div") as HTMLDivElement
			distanceDiv.classList.add("col-12","input-group","d-flex","flex-row","w-100")

			let distanceLabel = document.createElement("label") as HTMLLabelElement
			distanceLabel.classList.add("input-group-text","fs-6")
			distanceLabel.innerHTML="Gap"
			// distanceLabel.setAttribute("for","labelDistanceSlider")
			distanceDiv.appendChild(distanceLabel)
			
			this.distanceInput = document.createElement("input") as HTMLInputElement
			this.distanceInput.classList.add("form-range","w-25","flex-grow-1","h-100","px-2","border","rounded-end")
			this.distanceInput.id="labelDistanceSlider"
			this.distanceInput.type="range"
			distanceDiv.appendChild(this.distanceInput)

			this.anchorSelect.addEventListener("change", (ev)=>{
				this.update()
			})

			this.distanceInput.addEventListener("input",()=>{
				this.update()
			})

			row1.appendChild(distanceDiv)
		}

		container.append(row1)
	}

	private update(){
		this.updateValue({
			value:this.input.value,
			labelDistance:this.distanceInput?Number.parseFloat(this.distanceInput.value):undefined,
			anchor:this.anchorSelect?LabelAnchor[this.anchorSelect.value]:undefined
		})
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
}