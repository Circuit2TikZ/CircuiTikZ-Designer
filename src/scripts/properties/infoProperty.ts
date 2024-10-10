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

	public buildHTML(): HTMLElement {
		this.container?.remove()
		this.container = document.createElement("div") as HTMLDivElement
		this.container.classList.add("d-flex", "gap-3", "w-100", "h-auto", "justify-content-between", "align-items-center", "border", "border-info-subtle", "bg-info-subtle", "text-info-emphasis", "rounded", "px-2", "py-1")

		this.labelElement = document.createElement("span") as HTMLSpanElement
		this.labelElement.classList.add("text-end")
		this.labelElement.innerHTML = this._label??"Label"
		this.container.appendChild(this.labelElement)

		this.valueElement = document.createElement("span") as HTMLSpanElement
		this.valueElement.classList.add("text-end")
		this.valueElement.innerHTML = this._value??"Label"
		this.container.appendChild(this.valueElement)
		return this.container
	}
}