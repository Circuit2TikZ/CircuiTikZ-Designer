import * as SVG from "@svgdotjs/svg.js"
import {
	CircuitComponent,
	ComponentSaveObject,
	ComponentSymbol,
	InfoProperty,
	SectionHeaderProperty,
} from "../internal"

/**
 * extension of {@link ComponentSaveObject} to also include the circuitikz id and a given name for the component
 */
export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?: string
}

/**
 * super class for all standard circuitikz components, for which all component variants have the same number of ports. (i.e. no mux/ic/variable switches...)
 */
export abstract class CircuitikzComponent extends CircuitComponent {
	public referenceSymbol: ComponentSymbol
	/**
	 * which static symbol is used from the symbol database (i.e. src/data/symbols.svg)
	 */
	protected symbolUse: SVG.Use

	/**
	 * The reference to the symbol library component. Has metadata of the symbol
	 * @param symbol which static symbol from the symbols.svg library to use
	 */
	constructor(symbol: ComponentSymbol) {
		super()
		this.displayName = symbol.displayName
		this.referenceSymbol = symbol
	}

	protected addInfo() {
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Info").buildHTML())
		// the tikz id of the component. e.g. "nmos" in "\node[nmos] at (0,0){};"
		this.propertiesHTMLRows.push(new InfoProperty("ID", this.referenceSymbol.tikzName).buildHTML())

		// if options are used for the component, they will also be shown
		let tikzOptions = Array.from(this.referenceSymbol._tikzOptions.keys()).join(", ")
		if (tikzOptions && tikzOptions.length > 0) {
			this.propertiesHTMLRows.push(new InfoProperty("Options", tikzOptions).buildHTML())
		}
	}
}
