import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, ComponentSaveObject, ComponentSymbol, InfoProperty, MainController, TextProperty } from "../internal";

const invalidNameRegEx = /[\t\r\n\v.,:;()-]/;

export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?:string
}

export type Label = {
	value: string
	rendering?: SVG.Element
	distance?: SVG.Number
}

export abstract class CircuitikzComponent extends CircuitComponent{
	public referenceSymbol: ComponentSymbol;
	protected symbolUse: SVG.Use;

	// change these out with EditableProperties
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
	}

	public async generateLabelRender(label:Label):Promise<any>{
		// @ts-ignore
		window.MathJax.texReset();
		// @ts-ignore
		return window.MathJax.tex2svgPromise(label.value,{}).then((node: Element) =>{			
			let svgElement = new SVG.Svg(node.querySelector("svg"))

			if (label.rendering) {
				let removeIDs = new Set<string>()
				for (const element of label.rendering.find("use")) {
					removeIDs.add(element.node.getAttribute("xlink:href"))
				}

				for (const id of removeIDs) {
					let element = CanvasController.instance.canvas.node.getElementById(id)
					if (element) {
						CanvasController.instance.canvas.node.removeChild(element)
					}
				}
			}

			let backgroundDefs = CanvasController.instance.canvas.findOne("#backgroundDefs") as SVG.Defs
			let defs = svgElement.findOne("defs") as SVG.Defs
			for (const def of defs.children()) {
				backgroundDefs.put(def)
			}
			defs.remove()
			
			// slight padding of the label text
			svgElement.node.setAttribute("style","vertical-align: top;")

			// increase the width and height of the svg element by the padding
			let expt = (1/1.545)*6.2 //1.545 magic number for the font used in MathJax; 6.2 = normal font size for tikz??? this should be 10pt but 10pt is far too big?? calculation wrong?
			let widthStr = svgElement.node.getAttribute("width") // in ex units --> convert to pt and then to px
			let width = new SVG.Number(new SVG.Number(widthStr).value*expt,"pt").convertToUnit("px");
			let heightStr = svgElement.node.getAttribute("height")
			let height = new SVG.Number(new SVG.Number(heightStr).value*expt,"pt").convertToUnit("px");
			let size = new SVG.Point(width.value,height.value)
			
			let svgViewBox = svgElement.viewbox()

			let scale = size.div(new SVG.Point(svgViewBox.w,svgViewBox.h))
			let translate = new SVG.Point(-svgViewBox.x,-svgViewBox.y).mul(scale)
			let m = new SVG.Matrix({
				scaleX:scale.x,
				scaleY:scale.y,
				translateX:translate.x,
				translateY:translate.y
			})

			for (const elementGroup of svgElement.find("use")) {
				elementGroup.node.removeAttribute("data-c")
			}

			let groupElements = svgElement.find("g") as SVG.List<SVG.G>
			for (const elementGroup of groupElements) {
				elementGroup.node.removeAttribute("data-mml-node")
			}
			for (const elementGroup of groupElements) {
				let children = elementGroup.children()
				if (children.length==1&&!elementGroup.node.hasAttributes()) {
					elementGroup.parent().put(children[0])
					elementGroup.remove()
				}
			}

			let transformGroup = new SVG.G()
			for (const child of svgElement.children()) {
				transformGroup.add(child)
			}
			transformGroup.transform(m)

			let currentLabel = label
			currentLabel.rendering?.remove()
			let rendering = new SVG.G()
			rendering.addClass("pointerNone")
			rendering.add(transformGroup)
			this.visualization.add(rendering)
			currentLabel.rendering = rendering
			this.updateTransform()
		})
	}
	public abstract updateLabelPosition():void
}