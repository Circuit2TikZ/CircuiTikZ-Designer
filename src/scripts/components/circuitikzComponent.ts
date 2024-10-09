import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, ComponentSaveObject, ComponentSymbol, Label } from "../internal";

export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?:string
	label?:Label
}

export abstract class CircuitikzComponent extends CircuitComponent{
	public referenceSymbol: ComponentSymbol;
	protected symbolUse: SVG.Use;
	protected label: Label;
	protected name: string;

	constructor(symbol:ComponentSymbol){
		super()
		this.referenceSymbol = symbol
		this.label = {
			value:""
		}
		this.name=""
	}

	// public async generateLabelRender(label:string):Promise<any>{
	// 	MathJax.texReset();
	// 	return MathJax.tex2svgPromise(label,{}).then((/**@type {Element} */ node: Element) =>{
	// 		let svgElement: SVGSVGElement = node.querySelector("svg")
	// 		// slight padding of the label text
	// 		let padding_ex = 0.2
	// 		svgElement.setAttribute("style","vertical-align: top;padding: "+padding_ex+"ex;")

	// 		// increase the width and height of the svg element by the padding
	// 		let width = svgElement.getAttribute("width")
	// 		width = Number.parseFloat(width.split(0,width.length-2))+padding_ex*2
	// 		let height = svgElement.getAttribute("height")
	// 		height = Number.parseFloat(height.split(0,height.length-2))+padding_ex*2

	// 		width = 10*width/2 // change to pt to explicitly change the font size
	// 		height = 10*height/2
	// 		svgElement.setAttribute("width",width.toString()+"pt")
	// 		svgElement.setAttribute("height",height.toString()+"pt")
	// 		svgElement.setAttribute("overflow","visible")
			
	// 		//also set the width and height for the svg container
	// 		this.label.rendering = new SVG.ForeignObject()
	// 		this.label.rendering.addClass("pointerNone")
	// 		this.label.rendering.width(width)
	// 		this.label.rendering.height(height)
	// 		this.label.rendering.add(new SVG.Element(svgElement))
	// 		CanvasController.instance.canvas.add(this.label.rendering)
	// 		this.updateLabelPosition()
	// 	})
	// }
	// public abstract updateLabelPosition():void
}