/**
 * @module pathComponentInstance
 */

import * as SVG from "@svgdotjs/svg.js";

import CanvasController from "../controllers/canvasController";
import PathComponentSymbol from "./pathComponentSymbol";
import SnapController from "../snapDrag/snapController";
import SnapCursorController from "../snapDrag/snapCursor";
import SnapPoint from "../snapDrag/snapPoint";

/**
 * Instance of a `PathComponentSymbol`.
 * @implements {import("./componentInstance").ComponentInstance}
 */
export default class PathComponentInstance extends SVG.G {
	/** @type {PathComponentSymbol} */
	symbol;
	/** @type {SVG.Use} */
	symbolUse;

	/** @type {boolean} */
	static #hasMouse = matchMedia("(pointer:fine)").matches;

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

	/** @type {SVG.Point} */
	#midAbs;
	/** @type {SnapPoint[]} */
	snappingPoints;

	/**
	 * Add a instance of an (path) symbol to an container.
	 *
	 * @param {PathComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container/canvas to add the symbol to
	 */
	constructor(symbol, container) {
		super();
		this.hide(); // is shown AFTER first click/touch

		this.symbol = symbol;
		this.container = container;
		this.point = container.point;
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
		this.#preLine.attr({
			fill: "none",
			stroke: "#000",
			"stroke-width": "0.4pt",
		});
		this.#postLine = this.line(this.#postPointArray);
		this.#postLine.attr({
			fill: "none",
			stroke: "#000",
			"stroke-width": "0.4pt",
		});

		this.container.node.classList.add("selectPoint");
		SnapCursorController.controller.visible = PathComponentInstance.#hasMouse;
		SnapController.controller.showSnapPoints();
		CanvasController.controller.deactivatePanning();
		this.container.on(["mousemove", "touchmove"], this.#moveListener, this);
		this.container.on(["click", "touchstart", "touchend"], this.#clickListener, this);

		// add snap points for other components
		this.#midAbs = new SVG.Point(0, 0);
		this.snappingPoints = [
			new SnapPoint(this, null, this.#prePointArray[0], [0, 0], 0),
			new SnapPoint(this, null, this.#postPointArray[1], [0, 0], 0),
			...this.symbol._pins.map((pin) => new SnapPoint(this, pin.name, this.#midAbs, pin, 0)),
		];
	}

	/**
	 * Add a instance of an (path) symbol to an container.
	 *
	 * @param {PathComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container/canvas to add the symbol to
	 * @param {MouseEvent} [_event] - an optional (mouse/touch) event, which caused the element to be added
	 */
	static createInstance(symbol, container, _event) {
		return new PathComponentInstance(symbol, container);
	}

	/**
	 * Create a instance from the (saved) serialized text.
	 *
	 * @param {string} serialized - the saved text/instance
	 * @returns {PathComponentInstance} the deserialized instance
	 */
	static fromJson(serialized) {
		// todo: implement
	}

	/**
	 * Serializes the instance for saving
	 *
	 * @returns {string} the serialized instance
	 */
	toJson() {
		// todo: implement
	}

	/**
	 * Stringifies the component in TikZ syntax.
	 * @returns {string}
	 */
	toTikzString() {
		return (
			"\\draw " +
			this.snappingPoints[0].toTikzString() +
			" to[" +
			this.symbol.tikzName +
			"] " +
			this.snappingPoints[1].toTikzString() +
			";"
		);
	}

	/**
	 * Removes the instance. Frees the snapping points and removes the node from its container.
	 *
	 * @returns {this}
	 */
	remove() {
		for (const point of this.snappingPoints) point.removeInstance();
		super.remove();
		return this;
	}

	/**
	 * Listener for the first and second click/touch. Used for initial adding of the component.
	 * @param {MouseEvent|TouchEvent} event
	 */
	#clickListener(event) {
		const isTouchEvent = window.TouchEvent && event instanceof TouchEvent && event.changedTouches.length === 1;
		const isTouchEnd = isTouchEvent && event.touches.length === 0;
		const isTouchStart =
			isTouchEvent &&
			event.touches.length === 1 &&
			event.touches[0].identifier === event.changedTouches[0].identifier;
		if (isTouchEvent && !isTouchStart && !isTouchEnd) return; // invalid; maybe more then one finger on screen

		const pt = CanvasController.controller.pointerEventToPoint(event);
		const snappedPoint =
			event.shiftKey || event.detail.event?.shiftKey
				? pt
				: SnapController.controller.snapPoint(pt, [{ x: 0, y: 0 }]);

		if (this.#pointsSet === 0 && (!isTouchEvent || isTouchStart)) {
			this.#prePointArray[0][0] = snappedPoint.x;
			this.#prePointArray[0][1] = snappedPoint.y;
			this.#pointsSet = 1;
			this.show();
			SnapCursorController.controller.visible = false;
		} else if (!isTouchEvent || isTouchEnd) {
			this.container.off(["click", "touchstart", "touchend"], this.#clickListener);
			this.container.off(["mousemove", "touchmove"], this.#moveListener);
			this.container.node.classList.remove("selectPoint");
			this.#pointsSet = 2;
			const angle = this.#recalcPointsEnd(snappedPoint);
			for (const sp of this.snappingPoints) sp.recalculate(null, angle);

			event.preventDefault();
			CanvasController.controller.activatePanning();
			SnapController.controller.hideSnapPoints();
		}
	}

	/**
	 * Redraw the component on mouse move. Used for initial adding of the component.
	 * @param {MouseEvent|TouchEvent} event
	 */
	#moveListener(event) {
		let pt = CanvasController.controller.pointerEventToPoint(event);
		const snappedPoint =
			event.shiftKey || event.detail.event?.shiftKey
				? pt
				: SnapController.controller.snapPoint(pt, [{ x: 0, y: 0 }]);
		if (this.#pointsSet === 0 && PathComponentInstance.#hasMouse) {
			SnapCursorController.controller.move(snappedPoint);
		} else if (this.#pointsSet === 1) this.#recalcPointsEnd(snappedPoint);
	}

	/**
	 * Recalculates the points after an movement
	 * @param {SVG.Point} endPoint
	 * @returns {number} the angle in radians
	 */
	#recalcPointsEnd(endPoint) {
		this.#postPointArray[1][0] = endPoint.x;
		this.#postPointArray[1][1] = endPoint.y;

		this.#midAbs.x = (this.#prePointArray[0][0] + endPoint.x) / 2;
		this.#midAbs.y = (this.#prePointArray[0][1] + endPoint.y) / 2;

		const tl = this.#midAbs.minus(this.symbol.relMid);
		const angle = Math.atan2(this.#prePointArray[0][1] - endPoint.y, endPoint.x - this.#prePointArray[0][0]);
		const angleDeg = (angle * 180) / Math.PI;

		this.symbolUse.move(tl.x, tl.y);
		// clockwise rotation \__(°o°)__/
		this.symbolUse.transform({ rotate: -angleDeg, ox: this.#midAbs.x, oy: this.#midAbs.y });

		// recalc pins
		this.#prePointArray[1] = this.symbol.startPin.point.rotate(angle, undefined, true).plus(this.#midAbs).toArray();
		this.#postPointArray[0] = this.symbol.endPin.point.rotate(angle, undefined, true).plus(this.#midAbs).toArray();

		// update/draw lines
		this.#preLine.plot(this.#prePointArray);
		this.#postLine.plot(this.#postPointArray);

		return angle;
	}
}
