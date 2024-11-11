import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, ComponentSaveObject, ComponentSymbol, InfoProperty, invalidNameRegEx, MainController, SectionHeaderProperty, TextProperty } from "../internal";

/**
 * extension of {@link ComponentSaveObject} to also include the circuitikz id and a given name for the component
 */
export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?:string
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
	public name: TextProperty;

	/**
	 * The reference to the symbol library component. Has metadata of the symbol
	 * @param symbol which static symbol from the symbols.svg library to use
	 */
	constructor(symbol:ComponentSymbol){
		super()
		this.displayName=symbol.displayName
		this.referenceSymbol = symbol
		
		this.name = new TextProperty("Name","")
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
					if (ev.value!==""&&component.name.value==ev.value) {
						this.name.updateValue(ev.previousValue,false)
						this.name.changeInvalidStatus("Name is already taken!")
						return
					}
				}
			}
			this.name.changeInvalidStatus("")
		})
		this.propertiesHTMLRows.push(this.name.buildHTML())
	}

	protected addInfo(){
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Info").buildHTML())
		// the tikz id of the component. e.g. "nmos" in "\node[nmos] at (0,0){};"
		this.propertiesHTMLRows.push(new InfoProperty("ID",this.referenceSymbol.tikzName).buildHTML())

		// if options are used for the component, they will also be shown
		let tikzOptions = Array.from(this.referenceSymbol._tikzOptions.keys()).join(", ")
		if (tikzOptions&&tikzOptions.length>0) {
			this.propertiesHTMLRows.push(new InfoProperty("Options",tikzOptions).buildHTML())
		}
	}
}