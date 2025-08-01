import { EditableProperty, Undo } from "../internal"

export type ChoiceEntry = {
	key: string
	name: string
}

export class ChoiceProperty<T extends ChoiceEntry> extends EditableProperty<T> {
	private label: string
	private selectElement: HTMLSelectElement
	private choiceOptions: T[]

	public get entries(): T[] {
		return this.choiceOptions
	}

	public constructor(label: string, choiceOptions: T[], initialValue?: T, tooltip = "") {
		super(initialValue, tooltip)
		this.label = label
		this.choiceOptions = choiceOptions
	}
	public eq(first: T, second: T): boolean {
		return first.key == second.key
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "input-group", "my-0")
		{
			let anchorLabel = document.createElement("label") as HTMLLabelElement
			anchorLabel.classList.add("input-group-text")
			anchorLabel.innerHTML = this.label
			col.appendChild(anchorLabel)

			this.selectElement = document.createElement("select") as HTMLSelectElement
			this.selectElement.classList.add("form-select")
			this.selectElement.name = "anchor"
			for (let index = 0; index < this.choiceOptions.length; index++) {
				const labelKey = this.choiceOptions[index].key
				const labelName = this.choiceOptions[index].name

				let optionElement = document.createElement("option") as HTMLOptionElement
				optionElement.value = labelKey
				optionElement.innerHTML = labelName
				optionElement.selected = this.value ? labelKey == this.value.key : false
				this.selectElement.appendChild(optionElement)
			}

			this.selectElement.addEventListener("change", (ev) => {
				this.updateValue(this.choiceOptions.find((el) => el.key == this.selectElement.value))
				Undo.addState()
			})
			col.appendChild(this.selectElement)
		}
		row.appendChild(col)
		return row
	}
	public updateHTML(): void {
		if (this.selectElement) {
			for (const optionElement of this.selectElement.children) {
				;(optionElement as HTMLOptionElement).selected =
					(optionElement as HTMLOptionElement).value == this.value.key
			}
		}
	}
}
