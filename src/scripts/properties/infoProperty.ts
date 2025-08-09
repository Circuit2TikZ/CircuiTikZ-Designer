import { EditableProperty } from "../internal"

export class InfoProperty extends EditableProperty<string> {
	private valueElement: HTMLSpanElement
	private labelElement: HTMLElement
	private labelString: string

	public constructor(label: string, initalValue?: string, tooltip = "") {
		super(initalValue, tooltip)
		this.labelString = label
	}

	public buildHTML(): HTMLElement {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add(
			"row",
			"mx-0",
			"my-2",
			"border",
			"border-info-subtle",
			"bg-info-subtle",
			"text-info-emphasis",
			"rounded"
		)

		this.labelElement = document.createElement("span") as HTMLSpanElement
		this.labelElement.classList.add("text-start", "col-auto", "me-3")
		this.labelElement.innerHTML = this.labelString || "Label"
		row.appendChild(this.labelElement)

		this.valueElement = document.createElement("span") as HTMLSpanElement
		this.valueElement.classList.add("text-end", "col")
		this.valueElement.innerHTML = this.value || ""
		row.appendChild(this.valueElement)

		return row
	}
	public eq(first: string, second: string): boolean {
		return first == second
	}
	public updateHTML(): void {
		if (this.valueElement) {
			this.valueElement.innerHTML = this.value ?? ""
		}
	}
}
