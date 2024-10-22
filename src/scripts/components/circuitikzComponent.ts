import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, ComponentSaveObject, ComponentSymbol, InfoProperty, MainController, TextProperty } from "../internal";

/**
 * names cannot contain punctuation, parantheses and some other symbols
 */
const invalidNameRegEx = /[\t\r\n\v.,:;()-]/;

/**
 * extension of {@link ComponentSaveObject} to also include the circuitikz id and a given name for the component
 */
export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?:string
}

/**
 * A type encompassing all information needed for the label
 */
export type Label = {
	value: string
	rendering?: SVG.Element
	distance?: SVG.Number
}

/**
 * super class for all standard circuitikz components, for which all component variants have the same number of ports. (i.e. no mux/ic/variable switches...)
 */
export abstract class CircuitikzComponent extends CircuitComponent{
	public referenceSymbol: ComponentSymbol;
	/**
	 * which static symbol is used from the symbol database (i.e. src/data/symbols.svg)
	 */
	protected symbolUse: SVG.Use;

	/**
	 * What will be used as the reference name in the tikz code (e.g. "\node[] (name) at (0,0){};"")
	 */
	protected name: TextProperty;

	/**
	 * The reference to the symbol library component. Has metadata of the symbol
	 * @param symbol which static symbol from the symbols.svg library to use
	 */
	constructor(symbol:ComponentSymbol){
		super()
		this.displayName=symbol.displayName
		this.referenceSymbol = symbol
		
		// the tikz id of the component. e.g. "nmos" in "\node[nmos] at (0,0){};"
		let infoIDProperty = new InfoProperty(this)
		infoIDProperty.label = "ID"
		infoIDProperty.setValue(symbol.tikzName)
		this.editableProperties.push(infoIDProperty)

		// if options are used for the component, they will also be shown
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
				// no name is always valid
				this.name.changeInvalidStatus("")
				return
			}
			if (ev.value.match(invalidNameRegEx)) {
				// check if characters are valid
				this.name.changeInvalidStatus("Contains forbidden characters!")
				return 
			}
			for (const component of MainController.instance.circuitComponents) {
				// check if another component with the same name already exists
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

	/**
	 * Generate a label visualization via mathjax
	 * @param label the data for which to generate the label visualization
	 * @returns a Promise<void>
	 */
	public async generateLabelRender(label:Label):Promise<void>{
		// @ts-ignore
		window.MathJax.texReset();
		// @ts-ignore
		return window.MathJax.tex2svgPromise(label.value,{}).then((node: Element) =>{	
			// mathjax renders the text via an svg container. That container also contains definitions and SVG.Use elements. get that container
			let svgElement = new SVG.Svg(node.querySelector("svg"))

			// if a previous label was rendered, remove everything concerning that rendering
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

			// move the label definitions to the overall definitions of the canvas
			let backgroundDefs = CanvasController.instance.canvas.findOne("#backgroundDefs") as SVG.Defs
			let defs = svgElement.findOne("defs") as SVG.Defs
			for (const def of defs.children()) {
				backgroundDefs.put(def)
			}
			defs.remove()
			
			//1.545 magic number (how large 1em, i.e. font size, is in terms of ex) for the font used in MathJax. 
			//6.5 = normal font size for tikz??? This should be 10pt for the normalsize in latex? If measuring via 2 lines 1 cm apart(28.34pt), you need 6.5pt to match up with the tikz rendering!?
			let expt = (1/1.545)*6.5
			//convert width and height from ex to pt via expt and then to px
			let widthStr = svgElement.node.getAttribute("width")
			let width = new SVG.Number(new SVG.Number(widthStr).value*expt,"pt").convertToUnit("px");
			let heightStr = svgElement.node.getAttribute("height")
			let height = new SVG.Number(new SVG.Number(heightStr).value*expt,"pt").convertToUnit("px");
			let size = new SVG.Point(width.value,height.value)
			

			// remove unnecessary data
			for (const elementGroup of svgElement.find("use")) {
				elementGroup.node.removeAttribute("data-c")
			}
			let groupElements = svgElement.find("g") as SVG.List<SVG.G>
			for (const elementGroup of groupElements) {
				elementGroup.node.removeAttribute("data-mml-node")
			}
			// remove unnecessary svg groups
			for (const elementGroup of groupElements) {
				let children = elementGroup.children()
				if (children.length==1&&!elementGroup.node.hasAttributes()) {
					elementGroup.parent().put(children[0])
					elementGroup.remove()
				}
			}

			// the current rendering svg viewbox
			let svgViewBox = svgElement.viewbox()

			// scale such that px size is actually correct for rendering
			let scale = size.div(new SVG.Point(svgViewBox.w,svgViewBox.h))
			//move the rendering to local 0,0
			let translate = new SVG.Point(-svgViewBox.x,-svgViewBox.y).mul(scale)
			let m = new SVG.Matrix({
				scaleX:scale.x,
				scaleY:scale.y,
				translateX:translate.x,
				translateY:translate.y
			})
			// add all symbol components to a group
			let transformGroup = new SVG.G()
			for (const child of svgElement.children()) {
				transformGroup.add(child)
			}
			// apply the transformation --> the symbol is now at the origin with the correct size and no rotation
			transformGroup.transform(m)

			// remove the current label and substitute with a new group element
			label.rendering?.remove()
			let rendering = new SVG.G()
			rendering.addClass("pointerNone")
			rendering.add(transformGroup)
			// add the label rendering to the visualization element
			this.visualization.add(rendering)
			label.rendering = rendering
			this.update()
		})
	}

	/**
	 * Updates the position of the label when moving/rotating... Override this!
	 */
	public abstract updateLabelPosition():void
}