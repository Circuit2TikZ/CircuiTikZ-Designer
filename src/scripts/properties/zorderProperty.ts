import { CanvasController, EditableProperty } from "../internal";

export class ZOrderProperty extends EditableProperty<number>{
	public getValue(): number {
		throw new Error("There is no value associated with ZOrderProperty");
	}
	public setValue(value: number, updateHTML?: boolean): void {
		throw new Error("There is no value associated with ZOrderProperty");
	}
	public buildHTML(container: HTMLElement): void {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","g-3","my-3")

		let frontDiv = document.createElement("div") as HTMLDivElement
		frontDiv.classList.add("col-6","mt-0")
		let bringFront = document.createElement("button") as HTMLButtonElement
		bringFront.classList.add("w-100","btn","btn-primary")
		bringFront.innerHTML = "Bring to front"
		frontDiv.appendChild(bringFront)
		row.appendChild(frontDiv)

		let backDiv = document.createElement("div") as HTMLDivElement
		backDiv.classList.add("col-6","mt-0")
		let pushBack = document.createElement("button") as HTMLButtonElement
		pushBack.classList.add("w-100","btn","btn-primary")
		pushBack.innerHTML = "Push to back"
		backDiv.appendChild(pushBack)
		row.appendChild(backDiv)

		bringFront.addEventListener("click",ev=>{
			CanvasController.instance.bringComponentToFront(this.componentReference)
		})

		pushBack.addEventListener("click",ev=>{
			CanvasController.instance.moveComponentToBack(this.componentReference)
		})

		container.appendChild(row)
	}
	
}