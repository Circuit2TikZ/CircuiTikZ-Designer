import { EditableProperty } from "../internal";

export class InfoProperty extends EditableProperty<string>{
	public getValue(): string {
		return this._value
	}
	public setValue(value: string, updateHTML?: boolean): void {
		this._value = value
		if (this.valueElement && updateHTML) {
			this.valueElement.innerHTML = value
		}
	}

	private valueElement:HTMLSpanElement

	public buildHTML(container:HTMLElement): void {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","mx-0", "my-2", "border", "border-info-subtle", "bg-info-subtle", "text-info-emphasis", "rounded")

		this.labelElement = document.createElement("span") as HTMLSpanElement
		this.labelElement.classList.add("text-start","col")
		this.labelElement.innerHTML = this._label??"Label"
		row.appendChild(this.labelElement)

		this.valueElement = document.createElement("span") as HTMLSpanElement
		this.valueElement.classList.add("text-end","col")
		this.valueElement.innerHTML = this._value??"Label"
		row.appendChild(this.valueElement)
		
		container.appendChild(row)
	}
}