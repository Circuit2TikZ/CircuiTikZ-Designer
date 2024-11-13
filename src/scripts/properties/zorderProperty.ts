import { CanvasController, CircuitComponent, EditableProperty } from "../internal"

export class ZOrderProperty extends EditableProperty<number> {
	private componentReference: CircuitComponent

	public constructor(componentReference: CircuitComponent) {
		super()
		this.componentReference = componentReference
	}

	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let frontDiv = document.createElement("div") as HTMLDivElement
		frontDiv.classList.add("col-6", "mt-0")
		let bringFront = document.createElement("button") as HTMLButtonElement
		bringFront.classList.add("w-100", "btn", "btn-primary")
		bringFront.innerHTML = "Bring to front"
		frontDiv.appendChild(bringFront)
		row.appendChild(frontDiv)

		let backDiv = document.createElement("div") as HTMLDivElement
		backDiv.classList.add("col-6", "mt-0")
		let pushBack = document.createElement("button") as HTMLButtonElement
		pushBack.classList.add("w-100", "btn", "btn-primary")
		pushBack.innerHTML = "Push to back"
		backDiv.appendChild(pushBack)
		row.appendChild(backDiv)

		bringFront.addEventListener("click", (ev) => {
			CanvasController.instance.componentsToForeground([this.componentReference])
		})

		pushBack.addEventListener("click", (ev) => {
			CanvasController.instance.componentsToBackground([this.componentReference])
		})

		return row
	}

	public eq(first: number, second: number): boolean {
		return true
	}
	public updateHTML(): void {}
}
