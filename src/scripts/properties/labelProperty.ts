import { EditableProperty, Label } from "../internal"

export class LabelProperty extends EditableProperty<Label>{
	public getValue(): Label {
		return this._value
	}
	public setValue(value: Label, updateHTML?: boolean): void {
		this._value = value
		if (updateHTML) {
			this.input.value = value.value
		}
	}

	private input:HTMLInputElement
	private renderButton:HTMLButtonElement
	private invalidDiv:HTMLDivElement

	public buildHTML(): HTMLElement {
		/**
		 * <div id="blueprintMathJax" class="d-flex flex-column w-100 h-auto justify-content-start align-items-start blueprint">
				<span class="form-label">Label</span>
				<div class="d-flex flex-row w-100 gap-3">
					<div class="input-group">
						<span class="input-group-text">$</span>
						<input type="text" class="form-control">
						<span class="input-group-text">$</span>
					</div>
					<button type="button" class="btn btn-primary">Render</button>
				</div>
				<div class="invalid-feedback d-none">Invalid</div>
			</div>
		 */
		this.container?.remove()
		this.container = document.createElement("div") as HTMLDivElement
		this.container.classList.add("d-flex", "flex-column", "w-100", "h-auto", "justify-content-start", "align-items-start")

		let labelSpan = document.createElement("span") as HTMLSpanElement
		labelSpan.classList.add("form-label")
		labelSpan.innerHTML = "Label"
		this.container.appendChild(labelSpan)

		let div1 = document.createElement("div") as HTMLDivElement
		div1.classList.add("d-flex", "flex-row", "w-100", "gap-3")

		let div2 = document.createElement("div") as HTMLDivElement
		div2.classList.add("input-group")

		let formulaSpan1 = document.createElement("span") as HTMLSpanElement
		formulaSpan1.classList.add("input-group-text")
		formulaSpan1.innerHTML = "$"
		div2.appendChild(formulaSpan1)

		this.input = document.createElement("input") as HTMLInputElement
		this.input.classList.add("form-control")
		this.input.type = "text"
		div2.appendChild(this.input)

		let formulaSpan2 = document.createElement("span") as HTMLSpanElement
		formulaSpan2.classList.add("input-group-text")
		formulaSpan2.innerHTML = "$"
		div2.appendChild(formulaSpan2)
		div1.appendChild(div2)

		this.renderButton = document.createElement("button") as HTMLButtonElement
		this.renderButton.classList.add("btn", "btn-primary")
		this.renderButton.type = "button"
		this.renderButton.innerHTML = "Render"
		div1.appendChild(this.renderButton)
		this.container.appendChild(div1)

		this.invalidDiv = document.createElement("div") as HTMLDivElement
		this.invalidDiv.classList.add("invalid-feedback", "d-none")
		this.container.appendChild(this.invalidDiv)

		return this.container
	}
}