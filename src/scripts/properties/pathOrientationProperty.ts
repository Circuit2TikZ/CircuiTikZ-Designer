import { EditableProperty, PathOrientation } from "../internal";

export class PathOrientationProperty extends EditableProperty<PathOrientation>{
	public getValue(): PathOrientation {
		return this._value
	}
	public setValue(value: PathOrientation, updateHTML?: boolean): void {
		if (value) {
			this._value = {
				mirror:value.mirror,
				invert:value.invert
			}
		}
		if (updateHTML) {
			this.checkBoxMirror.checked = value.mirror
			this.checkBoxInvert.checked = value.invert
		}
	}

	private checkBoxMirror:HTMLInputElement
	private checkBoxInvert:HTMLInputElement
	public buildHTML(container: HTMLElement): void {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","justify-content-between","g-2")

		this.labelElement = document.createElement("span") as HTMLSpanElement
		this.labelElement.classList.add("col-12","form-label","mb-0","mt-3")
		this.labelElement.innerHTML = this._label??""
		row.appendChild(this.labelElement)

		let mirrorDiv = document.createElement("div") as HTMLDivElement
		mirrorDiv.classList.add("col-12")
		let checkBoxContainerMirror = document.createElement("div") as HTMLDivElement
		checkBoxContainerMirror.classList.add("form-check", "form-switch")
		{
			this.checkBoxMirror = document.createElement("input") as HTMLInputElement
			this.checkBoxMirror.classList.add("form-check-input")
			this.checkBoxMirror.setAttribute("type","checkbox")
			this.checkBoxMirror.setAttribute("role","switch")
			this.checkBoxMirror.checked = this._value.mirror??false
			checkBoxContainerMirror.appendChild(this.checkBoxMirror)
	
			let labelElementMirror = document.createElement("label") as HTMLLabelElement
			labelElementMirror.classList.add("form-check-label")
			labelElementMirror.innerHTML = "Mirror"
			checkBoxContainerMirror.appendChild(labelElementMirror)
		}
		mirrorDiv.appendChild(checkBoxContainerMirror)
		row.appendChild(mirrorDiv)

		let invertDiv = document.createElement("div") as HTMLDivElement
		invertDiv.classList.add("col-12")
		let checkBoxContainerInvert = document.createElement("div") as HTMLDivElement
		checkBoxContainerInvert.classList.add("form-check", "form-switch")
		{
			this.checkBoxInvert = document.createElement("input") as HTMLInputElement
			this.checkBoxInvert.classList.add("form-check-input")
			this.checkBoxInvert.setAttribute("type","checkbox")
			this.checkBoxInvert.setAttribute("role","switch")
			this.checkBoxInvert.checked = this._value.invert??false
			checkBoxContainerInvert.appendChild(this.checkBoxInvert)
	
			let labelElementInvert = document.createElement("label") as HTMLLabelElement
			labelElementInvert.classList.add("form-check-label")
			labelElementInvert.innerHTML = "Invert"
			checkBoxContainerInvert.appendChild(labelElementInvert)
		}
		invertDiv.appendChild(checkBoxContainerInvert)
		row.appendChild(invertDiv)

		container.appendChild(row)

		this.checkBoxMirror.addEventListener("change",ev=>{
			this.updateValue({
				mirror:this.checkBoxMirror.checked,
				invert:this.checkBoxInvert.checked
			})
		})
		this.checkBoxInvert.addEventListener("change",ev=>{
			this.updateValue({
				mirror:this.checkBoxMirror.checked,
				invert:this.checkBoxInvert.checked
			})
		})
	}
	
}