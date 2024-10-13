import { EditableProperty, LabelAnchor, NodeLabel, Undo } from "../internal"
import * as SVG from "@svgdotjs/svg.js";

export class NodeLabelProperty extends EditableProperty<NodeLabel>{
	public getValue(): NodeLabel {
		return this._value
	}
	public setValue(value: NodeLabel, updateHTML?: boolean): void {
		if (value) {
			let rendering = this._value?.rendering
			this._value = {
				value:value.value,
				distance:value.distance?value.distance.convertToUnit("cm"):new SVG.Number(0.1,"cm"),
				anchor:value.anchor??LabelAnchor.default
			}
			if (value.rendering) {
				this._value.rendering=value.rendering
			}else{
				this._value.rendering=rendering
			}
		}
		if (updateHTML&&this.input) {
			this.input.value = value.value
			this.distanceInput.value = (this._value?this._value.distance.value??0:0).toString()
		}
	}

	private input:HTMLInputElement
	private renderButton:HTMLButtonElement
	private invalidDiv:HTMLDivElement
	
	private distanceInput:HTMLInputElement
	private anchorSelect:HTMLSelectElement

	public buildHTML(container:HTMLElement): void {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","g-2","my-2")
		{
			this.labelElement = document.createElement("span") as HTMLSpanElement
			this.labelElement.classList.add("col-3","col-md-12","form-label")
			this.labelElement.innerHTML = this._label??""
			row.appendChild(this.labelElement)
	
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

				this.input.addEventListener("keydown",(ev:KeyboardEvent)=>{						
					if (ev.key==="Enter") {
						this.update()
					}
				})
		
				this.renderButton.addEventListener("click",(ev)=>{
					this.update()
				})
			}
			row.appendChild(div2)
		}


		let positionDiv= document.createElement("div") as HTMLDivElement
		positionDiv.classList.add("col-12","input-group")
		{
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
			for (let index = 0; index < labelKeys.length; index++) {
				const labelKey = labelKeys[index];
				const labelValue = labelValues[index];
	
				let optionElement = document.createElement("option") as HTMLOptionElement
				optionElement.value = labelKey
				optionElement.innerHTML = labelValue
				if (this._value.anchor&&labelValue==this._value.anchor) {
					optionElement.selected = true
				}
				this.anchorSelect.appendChild(optionElement)	
			}

			this.anchorSelect.addEventListener("change", (ev)=>{
				this.update()
			})
		}
		positionDiv.appendChild(this.anchorSelect)
		row.appendChild(positionDiv)

		let distanceDiv = document.createElement("div") as HTMLDivElement
		distanceDiv.classList.add("col-12","input-group","d-flex","flex-row","w-100")
		{
			let distanceLabel = document.createElement("label") as HTMLLabelElement
			distanceLabel.classList.add("input-group-text","fs-6")
			distanceLabel.innerHTML="Gap"
			distanceLabel.setAttribute("for","labelDistanceSlider")
			distanceDiv.appendChild(distanceLabel)
			
			this.distanceInput = document.createElement("input") as HTMLInputElement
			this.distanceInput.classList.add("form-range","w-25","flex-grow-1","h-100","px-2","border")
			this.distanceInput.id="labelDistanceSlider"
			this.distanceInput.type="range"
			this.distanceInput.min="-1"
			this.distanceInput.max="2"
			this.distanceInput.step="0.01"
			this.distanceInput.value = (this._value?this._value.distance.value??0:0).toString()
			distanceDiv.appendChild(this.distanceInput)
	
			let unitLabel = distanceLabel.cloneNode(true) as HTMLLabelElement
			unitLabel.innerHTML=this._value.distance.value.toFixed(2)+" "+this._value.distance.unit
			distanceDiv.appendChild(unitLabel)

			this.distanceInput.addEventListener("input",()=>{
				this.update()
				unitLabel.innerText = this._value.distance.value.toFixed(2)+" "+this._value.distance.unit
			})

			this.distanceInput.addEventListener("change",()=>{
				this.update()
				unitLabel.innerText = this._value.distance.value.toFixed(2)+" "+this._value.distance.unit
				Undo.addState()
			})
		}
		row.appendChild(distanceDiv)
		
		container.appendChild(row)
	}

	private update(){
		this.updateValue({
			value:this.input.value,
			distance:this.distanceInput?new SVG.Number(Number.parseFloat(this.distanceInput.value),"cm"):undefined,
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