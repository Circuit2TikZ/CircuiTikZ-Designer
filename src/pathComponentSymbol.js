/**
 * @module pathComponentSymbol
 */

import ComponentSymbol from "./componentSymbol";
import PathComponentInstance from "./pathComponentInstance";

/** @typedef {import("./componentSymbol").TikZAnchor} TikZAnchor */

export default class PathComponentSymbol extends ComponentSymbol {
	/** @type {TikZAnchor} */
	startPin;
	/** @type {TikZAnchor} */
	endPin;

	/**
	 *
	 * @param {SVGSymbolElement} symbolElement
	 * @param {SymbolBaseInformation} [baseInformation]
	 * @throws {Error} if the XML structure lacks the required metadata
	 */
	constructor(symbolElement, baseInformation) {
		// parse information in componentInformation attributes, if not done already
		if (!baseInformation) baseInformation = ComponentSymbol.getBaseInformation(symbolElement);

		super(symbolElement, baseInformation);

		this._pins = this._pins.filter((pin) => {
			if (pin.name === "START") this.startPin = pin;
			else if (pin.name === "END") this.endPin = pin;
			else return true;
			return false;
		});
	}

	/**
	 * @param {SVG.Container} container
	 * @param {MouseEvent} event
	 */
	addInstanceToContainer(container, event) {
		return new PathComponentInstance(this, container, event);
	}
}
