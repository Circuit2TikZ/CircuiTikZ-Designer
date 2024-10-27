import * as SVG from "@svgdotjs/svg.js";
import { EditableProperty } from "./editableProperty";

export class ColorProperty extends EditableProperty<SVG.Color|null>{

	private label:string
	private input:HTMLInputElement

	public constructor(label:string,initialValue?:SVG.Color|null){
		super(initialValue)
		this.label = label
	}

	public eq(first: SVG.Color|null, second: SVG.Color|null): boolean {
		if (first==null&&second==null||first===second) {
			return true
		}
		if (first==null) {
			return false
		}
		if (second==null) {
			return false
		}
		let f = first.rgb()
		let s = second.rgb()
		return (f.r==s.r&&f.g==s.g&&f.b==s.b)
	}
	public buildHTML(): HTMLElement {
		//<label for="exampleColorInput" class="form-label">Color picker</label>
		// <input type="color" class="form-control form-control-color" id="exampleColorInput" value="#563d7c" title="Choose your color">
		let row = this.getRow()
		let col= document.createElement("div") as HTMLDivElement
		col.classList.add("col-12","input-group","my-0")
		{
			let labelElement = document.createElement("label") as HTMLLabelElement
			labelElement.classList.add("input-group-text")
			labelElement.innerHTML = this.label??"Choose color"
			col.appendChild(labelElement)

			this.input = document.createElement("input") as HTMLInputElement
			this.input.classList.add("form-control","form-control-color")
			this.input.value = this.value?this.value.toString():""
			this.input.setAttribute("type","color")
			col.appendChild(this.input)
		}
		row.appendChild(col)
		return row
	}
	public updateHTML(): void {
		this.input.value = this.value?this.value.toString():""
	}
}