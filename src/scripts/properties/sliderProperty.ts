import * as SVG from "@svgdotjs/svg.js";
import { EditableProperty, Undo } from "../internal";

export class SliderProperty extends EditableProperty<SVG.Number>{
	public eq(first: SVG.Number, second: SVG.Number): boolean {
		return first.eq(second)
	}

	private min:number
	private max:number
	private step:number

	private label:string
	private numberInput:HTMLInputElement
	private unitLabel:HTMLLabelElement

	public constructor(label:string,min:number,max:number,step:number,initalValue?:SVG.Number){
		super(initalValue)
		this.label = label
		this.min = min
		this.max = max
		this.step = step
	}

	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12","my-0","input-group","d-flex","flex-row","w-100")
		{
			let distanceLabel = document.createElement("label") as HTMLLabelElement
			distanceLabel.classList.add("input-group-text","fs-6")
			distanceLabel.innerHTML=this.label
			distanceLabel.setAttribute("for","labelDistanceSlider")
			col.appendChild(distanceLabel)
			
			this.numberInput = document.createElement("input") as HTMLInputElement
			this.numberInput.classList.add("form-range","w-25","flex-grow-1","h-100","px-2","border")
			this.numberInput.id="labelDistanceSlider"
			this.numberInput.type="range"
			this.numberInput.min=this.min.toString()
			this.numberInput.max=this.max.toString()
			this.numberInput.step=this.step.toString()
			this.numberInput.value = this.value.value.toString()
			col.appendChild(this.numberInput)
	
			this.unitLabel = distanceLabel.cloneNode(true) as HTMLLabelElement
			let update = ()=>{
				this.updateUnitLabel()
				this.updateValue(new SVG.Number(Number.parseFloat(this.numberInput.value),this.value.unit))
			}
			update()
			col.appendChild(this.unitLabel)

			this.numberInput.addEventListener("input",update)
			this.numberInput.addEventListener("change",()=>{
				Undo.addState()
			})
		}
		row.appendChild(col)
		return row
	}

	private updateUnitLabel(){
		this.unitLabel.innerText=this.value.value.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})+" "+this.value.unit
	}

	public updateHTML(): void {
		if (this.numberInput) {
			this.numberInput.value=this.value.value.toString()
			this.updateUnitLabel()
		}
	}
}