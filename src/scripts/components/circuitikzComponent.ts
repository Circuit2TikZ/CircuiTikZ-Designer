import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, ComponentSaveObject, ComponentSymbol, InfoProperty, Label, LabelProperty, MainController, TextProperty } from "../internal";

const invalidNameRegEx = /[\t\r\n\v.,:;()-]/;

export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?:string
	label?:Label
}

export abstract class CircuitikzComponent extends CircuitComponent{
	public referenceSymbol: ComponentSymbol;
	protected symbolUse: SVG.Use;

	// change these out with EditableProperties
	protected label: LabelProperty;
	protected name: TextProperty;

	constructor(symbol:ComponentSymbol){
		super()
		this.displayName=symbol.displayName
		this.referenceSymbol = symbol
		
		let infoIDProperty = new InfoProperty(this)
		infoIDProperty.label = "ID"
		infoIDProperty.setValue(symbol.tikzName)
		this.editableProperties.push(infoIDProperty)

		let tikzOptions = Array.from(this.referenceSymbol._tikzOptions.keys()).join(", ")
		if (tikzOptions) {
			let infoOptionsProperty = new InfoProperty(this)
			infoOptionsProperty.label = "Options"
			infoOptionsProperty.setValue(tikzOptions)
			this.editableProperties.push(infoOptionsProperty)
		}

		this.name = new TextProperty(this)
		this.name.label = "Name"
		this.name.setValue("")
		this.name.addChangeListener((ev)=>{
			if (ev.value==="") {
				this.name.changeInvalidStatus("")
				return
			}
			if (ev.value.match(invalidNameRegEx)) {
				this.name.changeInvalidStatus("Contains forbidden characters!")
				return 
			}
			for (const component of MainController.instance.circuitComponents) {
				if (component instanceof CircuitikzComponent && component!=this) {
					if (ev.value!==""&&component.name.getValue()==ev.value) {
						this.name.setValue(ev.previousValue,false)
						this.name.changeInvalidStatus("Name is already taken!")
						return
					}
				}
			}
			this.name.changeInvalidStatus("")
		})
		this.editableProperties.push(this.name)

		this.label = new LabelProperty(this)
		this.label.label = "Label"
		this.label.setValue({value:""})
		this.label.addChangeListener((ev)=>{
			//TODO render text and position text
		})
		this.editableProperties.push(this.label)
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