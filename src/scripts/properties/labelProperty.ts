import { EditableProperty, Label } from "../internal"

export class LabelProperty extends EditableProperty<Label>{

	protected buildHTML(): void {

	}

	public get value(): Label {
		return this._value
	}
	public set value(value: Label) {
		//TODO update dom with value

	}
}