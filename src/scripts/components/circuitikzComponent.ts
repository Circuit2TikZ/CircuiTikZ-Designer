import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, ComponentSymbol, Label } from "../internal";

export abstract class CircuitikzComponent extends CircuitComponent{
	public referenceSymbol: ComponentSymbol;
	private symbolUse: SVG.Use;
	private label: Label;
	private name: string;

	constructor(symbol:ComponentSymbol){
		super()
		this.referenceSymbol = symbol
	}
}