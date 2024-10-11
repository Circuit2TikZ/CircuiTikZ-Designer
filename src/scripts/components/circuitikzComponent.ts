import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, ComponentSaveObject, ComponentSymbol, InfoProperty, Label, LabelProperty, MainController, TextProperty } from "../internal";

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
			if (ev.value.value) {
				if (!ev.previousValue||ev.previousValue.value!=ev.value.value) {
					//rerender
					this.generateLabelRender()
				}else{
					this.updateLabelPosition()
				}
			}
		})
		this.editableProperties.push(this.label)
	}

	public async generateLabelRender():Promise<any>{
		// @ts-ignore
		window.MathJax.texReset();
		// @ts-ignore
		return window.MathJax.tex2svgPromise(this.label.getValue().value,{}).then((node: Element) =>{
			let svgElement: SVGSVGElement = node.querySelector("svg")
			// slight padding of the label text
			let padding_ex = 0.2
			svgElement.setAttribute("style","vertical-align: top;padding: "+padding_ex+"ex;")

			// increase the width and height of the svg element by the padding
			let widthStr = svgElement.getAttribute("width")
			let width = Number.parseFloat(widthStr.slice(0,widthStr.length-2))+padding_ex*2
			let heightStr = svgElement.getAttribute("height")
			let height = Number.parseFloat(heightStr.slice(0,heightStr.length-2))+padding_ex*2

			width = 10*width/2 // change to pt to explicitly change the font size
			height = 10*height/2
			widthStr = width.toString()+"pt"
			heightStr = height.toString()+"pt"
			svgElement.setAttribute("width",widthStr)
			svgElement.setAttribute("height",heightStr)
			svgElement.setAttribute("overflow","visible")
			
			//also set the width and height for the svg container

			let currentLabel = this.label.getValue()
			currentLabel.rendering?.remove()
			let rendering = new SVG.ForeignObject()
			rendering.addClass("pointerNone")
			rendering.width(widthStr)
			rendering.height(heightStr)
			rendering.add(new SVG.Element(svgElement))
			CanvasController.instance.canvas.add(rendering)
			currentLabel.rendering = rendering
			this.updateLabelPosition()
		})
	}
	public abstract updateLabelPosition():void
}