import { CircuitComponent, MainController, Modes } from "../internal";

export type ChangeEvent<T> = {
	previousValue:T,
	value:T
}

export abstract class EditableProperty<T>{
	protected _value: T;

	public abstract getValue():T
	public abstract setValue(value:T, updateHTML?:boolean):void

	protected labelElement:HTMLElement
	protected _label:string
	public get label(): string{
		return this._label
	}
	public set label(value: string){
		this._label = value
		if (this.labelElement) {
			this.labelElement.innerHTML = value
		}
	}

	private changeListeners:{(event:ChangeEvent<T>):void}[]
	protected componentReference:CircuitComponent

	protected lastValue:T

	public constructor(componentReference:CircuitComponent, value?:T){
		// make sure to be in drag_pan mode when changing any value
		this.changeListeners = [(ev)=>{MainController.instance.switchMode(Modes.DRAG_PAN)}]
		this.componentReference = componentReference
		this.lastValue = null
		if (value!==undefined) {
			this.setValue(value,false)
		}
	}

	public abstract buildHTML(container:HTMLElement):void

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

	protected updateValue(newVal:T){
		if (newVal === this.lastValue) {
			return
		}
		this.setValue(newVal)
		let changeEvent:ChangeEvent<T> = {
			previousValue:this.lastValue,
			value:this._value
		}
		for (const element of this.changeListeners) {
			element(changeEvent)
		}
		this.lastValue = newVal
	}

}