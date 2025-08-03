import { MainController, Modes } from "../internal"

type ChangeEvent<T> = {
	previousValue: T
	value: T
}

export abstract class EditableProperty<T> {
	private tooltip: string
	protected element: HTMLElement

	private _value: T
	public get value(): T {
		return this._value
	}
	public set value(newVal: T) {
		this._value = newVal
		if (!this.element) {
			this.element = this.buildHTML()
		}
		this.updateHTML()
	}

	private changeListeners: { (event: ChangeEvent<T>): void }[]

	public constructor(initialValue?: T, tooltip: string = "") {
		// make sure to be in drag_pan mode when changing any value
		this.changeListeners = [
			(ev) => {
				MainController.instance.switchMode(Modes.DRAG_PAN)
			},
		]
		if (initialValue !== undefined) {
			this._value = initialValue
		}
		this.tooltip = tooltip
	}

	/**
	 * Evaluate if two values of type T are equal
	 */
	public abstract eq(first: T, second: T): boolean

	/**
	 *
	 * @param enable
	 */
	public enable(enable = true): void {
		if (this.element) {
			for (const element of this.element.getElementsByClassName("disableable")) {
				if (enable) {
					element.classList.remove("disabled")
				} else {
					element.classList.add("disabled")
				}
			}
		}
	}

	public getHTMLElement(): HTMLElement {
		if (!this.element) {
			this.element = this.buildHTML()

			if (this.tooltip && this.element) {
				this.element.setAttribute("data-bs-title", this.tooltip)
				this.element.setAttribute("data-bs-toggle", "tooltip")
			}
		}
		return this.element
	}

	/**
	 * Override/use this
	 */
	protected abstract buildHTML(): HTMLElement
	protected getRow(): HTMLDivElement {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row", "g-2", "my-2")
		return row
	}
	public abstract updateHTML(): void

	public addChangeListener(changeListener: (ev: ChangeEvent<T>) => void) {
		this.changeListeners.push(changeListener)
	}
	public removeChangeListener(changeListener: (ev: ChangeEvent<T>) => void): boolean {
		let idx = this.changeListeners.findIndex((val) => val == changeListener)
		if (idx >= 0) {
			this.changeListeners.splice(idx, 1)
			return true
		}
		return false
	}

	public updateValue(newVal: T, updateHTML = false, notifyEventListeners = true) {
		if (this.eq(newVal, this.value)) {
			return
		}
		let lastValue = this.value
		this._value = newVal
		let changeEvent: ChangeEvent<T> = {
			previousValue: lastValue,
			value: this._value,
		}
		if (updateHTML) {
			if (!this.element) {
				this.element = this.buildHTML()
			}
			this.updateHTML()
		}
		if (notifyEventListeners) {
			for (const element of this.changeListeners) {
				element(changeEvent)
			}
		}
	}
}
