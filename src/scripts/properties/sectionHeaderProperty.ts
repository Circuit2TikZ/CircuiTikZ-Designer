import { EditableProperty } from "../internal"

export class SectionHeaderProperty extends EditableProperty<string> {
	private labelElement: HTMLElement

	public eq(first: string, second: string): boolean {
		return first == second
	}
	public buildHTML(): HTMLElement {
		this.labelElement = document.createElement("span") as HTMLSpanElement
		this.labelElement.classList.add("col-12", "form-label", "mb-0", "fw-bold")
		this.labelElement.innerHTML = this.value ?? ""

		let row = this.getRow()
		row.appendChild(this.labelElement)
		return row
	}
	public updateHTML(): void {
		if (this.labelElement) {
			this.labelElement.innerHTML = this.value
		}
	}
}
