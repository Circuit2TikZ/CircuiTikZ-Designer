/**
 * @module componentInstance
 */

import { getNamedTag, getNamedTags } from "../utils/xmlHelper";
import * as SVG from "@svgdotjs/svg.js";
import svgSnapDragHandler from "../snapDrag/svgSnapDragHandler";
import ComponentSymbol from "./componentSymbol";

export default class componentInstance extends SVG.Use {
	/** @type {ComponentSymbol} */
	symbol;

	/** @type {svgSnapDragHandler} */
	#snapDragHandler;

	/**
	 * @typedef {object} DragHandler
	 * @property {SVG.Element} el
	 * @property {SVG.Box} box
	 * @property {SVG.Point} lastClick
	 * @property {(ev: MouseEvent) => void} startDrag
	 * @property {(ev: MouseEvent) => void} drag
	 * @property {(ev: MouseEvent) => void} endDrag
	 */

	/**
	 * @param {ComponentSymbol} symbol
	 * @param {SVG.Container} container
	 * @param {MouseEvent} [event]
	 */
	constructor(symbol, container, event) {
		super();

		this.symbol = symbol;
		this.container = container;
		this.use(this.symbol);
		this.container.add(this);

		this.#snapDragHandler = svgSnapDragHandler.snapDrag(this, true);

		if (event) {
			//  && event.type.includes("mouse")
			// 1st: move symbol to curser pos
			let pt = new SVG.Point(event.clientX, event.clientY);
			pt = pt.transform(this.screenCTM().inverse());
			// pt = cursor point in svg coords
			// --> offset to center symbol around cursor
			/** @type {SVG.Box} */
			//let boundingBox = use.bbox();
			//pt.x = pt.x - boundingBox.cx + boundingBox.x; // or -box.width / 2; .cx is mid relative to x
			//pt.y = pt.y - boundingBox.cy + boundingBox.y;
			//this.use.move(this.symbol.mid.x.times(-1).plus(pt.x), this.symbol.mid.y.times(-1).plus(pt.y));

			this.move(pt.x - this.symbol.mid.x, pt.y - this.symbol.mid.y);

			// 2nd: start dragging
			/** @type {DragHandler} */
			let dh = this.remember("_draggable");

			dh.startDrag(event);
			const endEventName = event.type.includes("mouse") ? "mouseup" : "touchend";
			const endEventNameScoped = endEventName + ".drag";
			SVG.off(window, endEventNameScoped, dh.endDrag);

			let timeout = null;
			const addDragEndHandler = (/** @type {MouseEvent|undefined} */ event) => {
				if (event?.stopImmediatePropagation) event.stopImmediatePropagation();
				window.clearTimeout(timeout);
				window.removeEventListener(endEventName, addDragEndHandler);
				SVG.on(window, endEventNameScoped, dh.endDrag, dh, { passive: false });
			};

			timeout = window.setTimeout(addDragEndHandler, 200);
			window.addEventListener(endEventName, addDragEndHandler, { passive: false });
		}
	}

	/**
	 * Gets all anchors points, which make sense for snapping to the grid.
	 * Points are relative to the symbol position.
	 * Does not return the `textAnchor`.
	 *
	 * @returns {SVG.Point} all anchor points for snapping to the grid
	 */
	get snappingPoints() {
		return this.symbol.snappingPoints;
	}
}
