import { EditableProperty } from "../internal";
import * as SVG from "@svgdotjs/svg.js";

export class FlipStateProperty extends EditableProperty<SVG.Point>{
	public getValue(): SVG.Point {
		return this._value
	}
	public setValue(value: SVG.Point, updateHTML?: boolean): void {
		if (value) {
			if (!this._value) {
				this._value = value
			} else {
				this._value.x=value.x
				this._value.y=value.y
			}
			if (updateHTML&&this.checkBoxX) {
				this.checkBoxX.checked = value.x<0
				this.checkBoxY.checked = value.y<0
			}
		}
	}

	private checkBoxX:HTMLInputElement
	private checkBoxY:HTMLInputElement
	public buildHTML(container: HTMLElement): void {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","justify-content-between","g-2")

		this.labelElement = document.createElement("span") as HTMLSpanElement
		this.labelElement.classList.add("col-12","form-label","mb-0","mt-3")
		this.labelElement.innerHTML = this._label??""
		row.appendChild(this.labelElement)

		let flipYDiv = document.createElement("div") as HTMLDivElement
		flipYDiv.classList.add("col-12")
		let checkBoxContainerY = document.createElement("div") as HTMLDivElement
		checkBoxContainerY.classList.add("form-check", "form-switch","ms-1")
		{
			this.checkBoxY = document.createElement("input") as HTMLInputElement
			this.checkBoxY.classList.add("form-check-input")
			this.checkBoxY.setAttribute("type","checkbox")
			this.checkBoxY.setAttribute("role","switch")
			this.checkBoxY.checked = this._value.y<0
			checkBoxContainerY.appendChild(this.checkBoxY)
	
			let labelElementY = document.createElement("label") as HTMLLabelElement
			labelElementY.classList.add("form-check-label")
			labelElementY.innerHTML = "Flip X"
			checkBoxContainerY.appendChild(labelElementY)
		}
		flipYDiv.appendChild(checkBoxContainerY)
		row.appendChild(flipYDiv)

		let flipXDiv = document.createElement("div") as HTMLDivElement
		flipXDiv.classList.add("col-12")
		let checkBoxContainerX = document.createElement("div") as HTMLDivElement
		checkBoxContainerX.classList.add("form-check", "form-switch","ms-1")
		{
			this.checkBoxX = document.createElement("input") as HTMLInputElement
			this.checkBoxX.classList.add("form-check-input")
			this.checkBoxX.setAttribute("type","checkbox")
			this.checkBoxX.setAttribute("role","switch")
			this.checkBoxX.checked = this._value.x<0
			checkBoxContainerX.appendChild(this.checkBoxX)
	
			let labelElementX = document.createElement("label") as HTMLLabelElement
			labelElementX.classList.add("form-check-label")
			labelElementX.innerHTML = "Flip Y"
			checkBoxContainerX.appendChild(labelElementX)
		}
		flipXDiv.appendChild(checkBoxContainerX)
		row.appendChild(flipXDiv)

		container.appendChild(row)

		this.checkBoxX.addEventListener("change",ev=>{
			this.updateValue(new SVG.Point(this.checkBoxX.checked?-1:1,this.checkBoxY.checked?-1:1))
		})
		this.checkBoxY.addEventListener("change",ev=>{
			this.updateValue(new SVG.Point(this.checkBoxX.checked?-1:1,this.checkBoxY.checked?-1:1))
		})
	}
}