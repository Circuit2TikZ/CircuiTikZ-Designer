import { EditableProperty } from "../internal"

export class ButtonGridProperty extends EditableProperty<never> {
	private buttonsPerRow: number
	private labels: [string, string | [string, string]][]
	private callbacks: ((ev: Event) => void)[]
	private materialSymbols: boolean
	private tooltips: string[]

	public constructor(
		buttonsPerRow: 1 | 2 | 3 | 4 | 6 | 12,
		labels: [string, string | [string, string]][],
		callbacks: ((ev: Event) => void)[],
		materialSymbols = false,
		tooltips: string[] = []
	) {
		super()
		if (labels.length !== callbacks.length) {
			throw new Error("every button has to have a callback and a label")
		}
		this.buttonsPerRow = buttonsPerRow
		this.labels = labels
		this.callbacks = callbacks
		this.materialSymbols = materialSymbols
		this.tooltips = tooltips
	}

	public eq(first: never, second: never): boolean {
		return false
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()
		for (let index = 0; index < this.labels.length; index++) {
			const label = this.labels[index]
			const callback = this.callbacks[index]

			let col = document.createElement("div") as HTMLDivElement
			col.classList.add("col-" + Math.round(12 / this.buttonsPerRow).toFixed(0))
			let button = document.createElement("button") as HTMLButtonElement
			button.classList.add(
				"w-100",
				"btn",
				"btn-primary",
				"d-flex",
				"align-items-center",
				"justify-content-center",
				"gap-1"
			)
			if (this.tooltips[index]) {
				button.setAttribute("data-bs-title", this.tooltips[index])
				button.setAttribute("data-bs-toggle", "tooltip")
			}
			if (this.materialSymbols) {
				button.classList.add("material-symbols-outlined")
			}
			let labelSymbol = typeof label[1] == "string" ? label[1] : label[1][0]
			let labelSymbolClasses: string[]
			if (typeof label[1] == "string") {
				labelSymbol = label[1]
				labelSymbolClasses = []
			} else {
				labelSymbol = label[1][0]
				labelSymbolClasses = label[1][1].split(",")
			}
			if (labelSymbol) {
				let spanMat = document.createElement("span") as HTMLSpanElement
				if (labelSymbolClasses.length > 0) {
					spanMat.classList.add("material-symbols-outlined", ...labelSymbolClasses)
				} else {
					spanMat.classList.add("material-symbols-outlined")
				}
				spanMat.innerHTML = labelSymbol
				button.appendChild(spanMat)
			}
			if (label[0]) {
				let spanMat = document.createElement("span") as HTMLSpanElement
				spanMat.innerHTML = label[0]
				button.appendChild(spanMat)
			}
			button.addEventListener("click", callback)
			col.appendChild(button)
			row.appendChild(col)
		}
		return row
	}
	public updateHTML(): void {}
}
