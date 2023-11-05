/**
 * @module componentInstance
 */

import * as SVG from "@svgdotjs/svg.js";
import PathComponentSymbol from "./pathComponentSymbol";

export default class PathComponentInstance extends SVG.G {
	/** @type {PathComponentSymbol} */
	symbol;
	/** @type {SVG.Use} */
	symbolUse;

	/** @type {SVG.PointArray} */
	#prePointArray;
	/** @type {SVG.PointArray} */
	#postPointArray;
	/** @type {SVG.Line} */
	#preLine;
	/** @type {SVG.Line} */
	#postLine;
	/** @type {0|1|2} */
	#pointsSet = 0;

	/**
	 * Add a instance of an (path) symbol to an container.
	 *
	 * @param {PathComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container/canvas to add the symbol to
	 * @param {MouseEvent} [_event] - an optional (mouse/touch) event, which caused the element to be added
	 */
	constructor(symbol, container, _event) {
		super();
		this.hide(); // is shown AFTER first click/touch

		this.symbol = symbol;
		this.container = container;
		this.container.add(this);

		this.symbolUse = new SVG.Use();
		this.symbolUse.use(this.symbol);
		this.add(this.symbolUse);

		this.#prePointArray = new SVG.PointArray([
			[0, 0],
			[0, 0],
		]);
		this.#postPointArray = new SVG.PointArray([
			[0, 0],
			[0, 0],
		]);

		this.#preLine = this.line(this.#prePointArray);
		this.#preLine.fill("none").stroke("#000");
		this.#postLine = this.line(this.#postPointArray);
		this.#postLine.fill("none").stroke("#000");

		this.container.on("click", this.#clickListener, this);
	}

	/**
	 * Listener for the first and second click/touch. Used for initial adding of the component.
	 * @param {MouseEvent} event
	 */
	#clickListener(event) {
		let pt = this.#mouseEventToPoint(event);
		console.log(event, pt);

		if (this.#pointsSet === 0) {
			this.#prePointArray[0][0] = pt.x;
			this.#prePointArray[0][1] = pt.y;
			this.container.on("mousemove", this.#moveListener, this);
			this.#pointsSet = 1;
			this.show();
		} else {
			this.container.off("click", this.#clickListener);
			this.container.off("mousemove", this.#moveListener);
			this.#pointsSet = 2;
			this.#recalcPoints(pt);
		}
	}

	/**
	 * Redraw the component on mouse move. Used for initial adding of the component.
	 * @param {MouseEvent} event
	 */
	#moveListener(event) {
		let pt = this.#mouseEventToPoint(event);
		this.#recalcPoints(pt);
	}

	/**
	 * Recalculates the points after an movement
	 * @param {SVG.Point} endPoint
	 */
	#recalcPoints(endPoint) {
		this.#postPointArray[1][0] = endPoint.x;
		this.#postPointArray[1][1] = endPoint.y;

		const mid = new SVG.Point(
			(this.#prePointArray[0][0] + endPoint.x) / 2,
			(this.#prePointArray[0][1] + endPoint.y) / 2
		);
		const tl = mid.minus(this.symbol.mid);
		const angle = Math.atan2(this.#prePointArray[0][1] - endPoint.y, endPoint.x - this.#prePointArray[0][0]);
		const angleDeg = (angle * 180) / Math.PI;

		this.symbolUse.move(tl.x, tl.y);
		// clockwise rotation \__(°o°)__/
		this.symbolUse.transform({ rotate: -angleDeg, ox: mid.x, oy: mid.y });

		// recalc pins
		this.#prePointArray[1] = this.symbol.startPin.point
			.minus(this.symbol.mid)
			.rotate(angle, undefined, true)
			.plus(mid)
			.toArray();
		this.#postPointArray[0] = this.symbol.endPin.point
			.minus(this.symbol.mid)
			.rotate(angle, undefined, true)
			.plus(mid)
			.toArray();

		// update/draw lines
		this.#preLine.plot(this.#prePointArray);
		this.#postLine.plot(this.#postPointArray);
	}

	/**
	 * Converts a point from an event to the SVG coordinate system.
	 * @param {MouseEvent} event
	 * @returns {SVG.Point}
	 */
	#mouseEventToPoint(event) {
		const pt = new SVG.Point(event.clientX, event.clientY);
		return pt.transform(this.container.screenCTM().inverse());
	}

	/**
	 * Gets all anchors points, which make sense for snapping to the grid.
	 * Points are relative to the symbol position.
	 * Does not return the `textAnchor`.
	 *
	 * @returns {SVG.Point} all anchor points for snapping to the grid
	 */
	get snappingPoints() {
		// FIXME useless atm
		return this.symbol.snappingPoints;
	}
}
