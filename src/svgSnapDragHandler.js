/**
 * @module svgSnapDragHandler
 */

import * as SVG from "@svgdotjs/svg.js/dist/svg.esm";
import "@svgdotjs/svg.draggable.js/dist/svg.draggable.esm";

/**
 * @typedef {object} DragHandler
 * @property {SVG.Shape} el
 * @property {SVG.Box} box
 * @property {SVG.Point} lastClick
 *
 * @property {function(Event): void} drag
 * @property {function(Event): void} startDrag
 * @property {function(Event): void} endDrag
 * @property {function (number, number): SVG.Element} move
 */

/**
 * @typedef {object} DragMoveEventDetail
 * @property {SVG.Box} box
 * @property {MouseEvent} event
 * @property {DragHandler} handler - the instance of the svg.draggable.js handler
 * @see CustomEvent
 */

/**
 * @typedef {CustomEvent<DragMoveEventDetail>} DragMoveEvent
 */

export default class svgSnapDragHandler {
	/** @type {SVG.Element} */
	element;

	/**
	 * Do use {@link svgSnapDragHandler.snapDrag} for enabling and disabling of the handler.
	 *
	 * @private
	 * @hideconstructor
	 * @see svgSnapDragHandler.snapDrag - use this instead
	 * @param {SVG.Element} element - the element to enable snap-dragging
	 * @param {function(boolean): void} element.draggable
	 */
	constructor(element) {
		this.element = element;
		this.element.remember("_snapDragHandler", this);
		this.element.draggable(true);

		this.element.on("dragmove.namespace", this.#dragMove, this);
	}

	/**
	 * Activate, deactivate or query the svgSnapDragHandler of an element.
	 *
	 * @static
	 * @public
	 * @param {SVG.Element} element - the element to modify/query
	 * @param {boolean} [enable] - `true` --> activate, `false` --> deactivate, `undefined` --> query
	 * @returns {svgSnapDragHandler|null} the handler, if activated
	 */
	static snapDrag(element, enable) {
		/** @type {svgSnapDragHandler|null} */
		let snapDragHandler = element.remember("_snapDragHandler") ?? (enable ? new svgSnapDragHandler(element) : null);
		if (enable === false && snapDragHandler) {
			// enable === false --> not undefined
			snapDragHandler.removeHandler();
			return null;
		}
		return snapDragHandler;
	}

	/**
	 * Remove the handler and deactivate `draggable` feature.
	 */
	removeHandler() {
		this.element.off("dragmove.namespace", this.dragMove);
		this.draggable(false);
		this.element.forget("_snapDragHandler");
	}

	/**
	 * Handler for the dragging event.
	 *
	 * @private
	 *
	 * @param {DragMoveEvent} event
	 */
	#dragMove(event) {
		if (event.detail.event?.shiftKey) return; // do not snap to grid if shift is pressed
		event.preventDefault();

		/** @type {SVG.Number} */
		const gridSpacing = new SVG.Number(0.25, "cm").convertToUnit("px");
		const xMin = Math.floor(event.detail.box.x / gridSpacing) * gridSpacing;
		const yMin = Math.floor(event.detail.box.y / gridSpacing) * gridSpacing;
		const xMax = Math.ceil((event.detail.box.x + event.detail.box.width) / gridSpacing) * gridSpacing;
		const yMax = Math.ceil((event.detail.box.y + event.detail.box.height) / gridSpacing) * gridSpacing;

		/** @type {SVG.Point[]} */
		let gridSnapPoints = [];

		for (let x = xMin; x <= xMax; x += gridSpacing) {
			for (let y = yMin; y <= yMax; y += gridSpacing) {
				gridSnapPoints.push(new SVG.Point(x, y));
			}
		}

		/** @type {SVG.Point[]} */
		const snapPoints = this.element.snappingPoints ? this.element.snappingPoints : [new SVG.Point(0, 0)];

		/**
		 * @typedef {object} minDistStruct
		 * @prop {number} dist
		 * @prop {SVG.Point} vector
		 */

		const topLeftDraggedCorner = new SVG.Point(event.detail.box.x, event.detail.box.y);

		/** @type {SVG.Point} */
		const result = snapPoints.reduce(
			/**
			 * @param {minDistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
			 * @param {SVG.Point} relSnapPoint - snap point / anchor relative to box
			 * @returns {minDistStruct}
			 */
			(prevVal, relSnapPoint) => {
				// Coordinate near grid
				const absSnapPoint = topLeftDraggedCorner.plus(relSnapPoint);

				return gridSnapPoints.reduce(
					/**
					 * @param {minDistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
					 * @param {SVG.Point} gridPoint - possible point to snap to (grid)
					 * @returns {minDistStruct}
					 */
					(prevVal, gridPoint) => {
						const vector = gridPoint.minus(absSnapPoint);
						const squaredDistance = vector.absSquared();
						if (squaredDistance > prevVal.dist) return prevVal;
						else return { dist: squaredDistance, vector: vector };
					},
					prevVal
				);
			},
			/** @type {minDistStruct} */ { dist: Number.MAX_VALUE, vector: null }
		).vector;

		const destination = topLeftDraggedCorner.plus(result);

		event.detail.handler.move(destination.x, destination.y);
	}
}
