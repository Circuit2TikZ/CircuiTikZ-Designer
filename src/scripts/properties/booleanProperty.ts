import { EditableProperty, Undo } from "../internal"

export class BooleanProperty extends EditableProperty<boolean> {
	private checkBox: HTMLInputElement
	private label: string

	public constructor(label: string, initialValue?: boolean) {
		super(initialValue)
		this.label = label
	}
	public eq(first: boolean, second: boolean): boolean {
		return first == second
	}

	public buildHTML(): HTMLElement {
		let row = this.getRow()
		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "my-0")
		let checkBoxContainerX = document.createElement("div") as HTMLDivElement
		checkBoxContainerX.classList.add("form-check", "form-switch")
		{
			this.checkBox = document.createElement("input") as HTMLInputElement
			this.checkBox.classList.add("form-check-input")
			this.checkBox.setAttribute("type", "checkbox")
			this.checkBox.setAttribute("role", "switch")
			this.checkBox.checked = this.value
			checkBoxContainerX.appendChild(this.checkBox)

			let labelElementX = document.createElement("label") as HTMLLabelElement
			labelElementX.classList.add("form-check-label")
			labelElementX.innerHTML = this.label || "CheckBox"
			checkBoxContainerX.appendChild(labelElementX)
		}
		col.appendChild(checkBoxContainerX)
		this.checkBox.addEventListener("change", (ev) => {
			this.updateValue(this.checkBox.checked)
			Undo.addState()
		})
		row.appendChild(col)
		return row
	}
	public updateHTML(): void {
		if (this.checkBox) {
			this.checkBox.checked = this.value
		}
	}
}
