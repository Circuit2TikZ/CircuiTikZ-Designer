import { MainController, Modes } from "../internal";

type ChangeEvent<T>={
	previousValue:T,
	value:T
}

export abstract class EditableProperty<T>{
	private _value: T;
	public get value(): T {
		return this._value;
	}
	public set value(newVal:T){
		this._value=newVal
	}

	private changeListeners:{(event:ChangeEvent<T>):void}[]

	public constructor(initialValue?:T){
		// make sure to be in drag_pan mode when changing any value
		this.changeListeners = [(ev)=>{MainController.instance.switchMode(Modes.DRAG_PAN)}]
		if (initialValue!==undefined) {
			this._value = initialValue
		}
	}
	public abstract eq(first:T,second:T):boolean

	/**
	 * Override/use this
	*/
	public abstract buildHTML():HTMLElement
	protected getRow():HTMLDivElement{
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row","g-2", "my-2")
		return row
	}
	public abstract updateHTML():void

	public addChangeListener(changeListener:(ev:ChangeEvent<T>)=>void){
		this.changeListeners.push(changeListener)
	}
	public removeChangeListener(changeListener:(ev:ChangeEvent<T>)=>void):boolean{
		let idx = this.changeListeners.findIndex((val)=>val==changeListener)
		if (idx>=0) {
			this.changeListeners.splice(idx,1)
			return true
		}
		return false
	}

	public updateValue(newVal:T,updateHTML=false){
		if (this.eq(newVal, this.value)) {
			return
		}
		let lastValue = this.value
		this._value = newVal
		let changeEvent:ChangeEvent<T> = {
			previousValue:lastValue,
			value:this._value
		}
		if (updateHTML) {
			this.updateHTML()
		}
		for (const element of this.changeListeners) {
			element(changeEvent)
		}
	}

}
