import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, EditableProperty, Undo } from "../internal"

export class SliderProperty extends EditableProperty<SVG.Number> {
	public eq(first: SVG.Number, second: SVG.Number): boolean {
		return first.eq(second)
	}

	private min: number
	private max: number
	private step: number

	private label: string
	private sliderInput: HTMLInputElement
	private numberInput: HTMLInputElement
	private unitLabel: HTMLLabelElement

	private fractionDigits: number
	private integerDigits: number
	private restrictToRange: boolean

	public constructor(
		label: string,
		min: number,
		max: number,
		step: number,
		initalValue?: SVG.Number,
		restrictToRange: boolean = false,
		tooltip = ""
	) {
		super(initalValue, tooltip)
		this.label = label
		this.min = min
		this.max = max
		this.step = step
		this.restrictToRange = restrictToRange

		if (step > 0) {
			this.fractionDigits = 0
			let stepTemp = step
			while (stepTemp < 1) {
				stepTemp *= 10
				this.fractionDigits += 1
			}
		}

		this.integerDigits = 1
		let maxDigits = Math.max(Math.abs(min), Math.abs(max))
		while (maxDigits > 1) {
			this.integerDigits += 1
			maxDigits /= 10
		}
	}

	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "my-0", "input-group")

		let distanceLabel = document.createElement("label") as HTMLLabelElement
		distanceLabel.classList.add("input-group-text", "fs-6")
		distanceLabel.innerHTML = this.label
		distanceLabel.setAttribute("for", "labelDistanceSlider")
		col.appendChild(distanceLabel)

		this.sliderInput = document.createElement("input") as HTMLInputElement
		this.sliderInput.classList.add("form-range", "w-25", "flex-grow-1", "h-100", "px-2", "border")
		this.sliderInput.id = "labelDistanceSlider"
		this.sliderInput.type = "range"
		this.sliderInput.min = this.min.toString()
		this.sliderInput.max = this.max.toString()
		this.sliderInput.step = this.step.toString()
		this.sliderInput.value = this.value.value.toString()
		col.appendChild(this.sliderInput)

		this.numberInput = document.createElement("input") as HTMLInputElement
		this.numberInput.classList.add("form-control", "fs-6")
		this.numberInput.type = "number"
		this.numberInput.value = this.value.value.toString()
		this.numberInput.min = this.min.toString()
		this.numberInput.max = this.max.toString()
		this.numberInput.step = this.step.toString()
		col.appendChild(this.numberInput)

		let sliderChanged = () => {
			this.updateValue(new SVG.Number(Number.parseFloat(this.sliderInput.value), this.value.unit))
			this.updateNumberInput()
		}
		let numberChanged = () => {
			let newValue = Number.parseFloat(this.numberInput.value)

			if (!isNaN(newValue)) {
				if (this.restrictToRange) {
					newValue = newValue < this.min ? this.min : newValue
					newValue = newValue > this.max ? this.max : newValue
				}
				this.updateValue(new SVG.Number(newValue, this.value.unit))
				this.updateSliderInput()
			}
		}

		this.numberInput.addEventListener("input", numberChanged)
		this.numberInput.addEventListener("focusout", () => {
			this.updateNumberInput()
			Undo.addState()
		})
		this.numberInput.addEventListener("mousedown", (ev) => {
			CanvasController.instance.draggingFromInput = this.numberInput
		})

		this.sliderInput.addEventListener("input", sliderChanged)
		this.sliderInput.addEventListener("change", () => {
			Undo.addState()
		})

		if (this.value.unit) {
			this.unitLabel = distanceLabel.cloneNode(true) as HTMLLabelElement
			this.unitLabel.innerText = this.value.unit
			col.appendChild(this.unitLabel)
		}

		this.updateNumberInput()
		this.updateSliderInput()

		row.appendChild(col)
		return row
	}

	private updateNumberInput() {
		this.numberInput.value = this.value.value.toString()
		if (this.unitLabel) {
			this.unitLabel.innerText = this.value.unit
		}
	}

	private updateSliderInput() {
		this.sliderInput.value = this.value.value.toString()
		if (this.unitLabel) {
			this.unitLabel.innerText = this.value.unit
		}
	}

	public updateHTML(): void {
		if (this.sliderInput) {
			this.updateSliderInput()
			this.updateNumberInput()
		}
	}
}
