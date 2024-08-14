/**
 * @module svgSnapDragHandler
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";

import SnapController from "./snapController";
import NodeComponentInstance from "../components/nodeComponentInstance";
import SelectionController from "../controllers/selectionController";

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
 * @property {MouseEvent|TouchEvent} event
 * @property {DragHandler} handler - the instance of the svg.draggable.js handler
 * @see CustomEvent
 */

/**
 * @typedef {CustomEvent<DragMoveEventDetail>} DragEvent
 */

/**
 * Handler/controller enabling components to be draggable and snap to the grid and to other components.
 * @class
 */
export default class svgSnapDragHandler {
	/** @type {NodeComponentInstance} */
	element;

	/** @type {DragHandler} */
	#dragHandler;

	/** @type {boolean} */
	#isTemporaryDisabled = false;
	/** @type {boolean} */
	#maybeContextmenu = false; // fixes contextmenu action on touchscreens

	/**
	 * Do not call directly. Use {@link svgSnapDragHandler.snapDrag} for enabling and disabling of the handler instead.
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
		this.#dragHandler = this.element.remember("_draggable");

		this.element.on("dragstart", this.#dragStart, this, { passive: true });
		this.element.on("dragmove.namespace", this.#dragMove, this);
		this.element.on("dragend", this.#dragEnd, this, { passive: true });
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
			snapDragHandler.#dragEnd()
			snapDragHandler.removeHandler();
			return null;
		}
		return snapDragHandler;
	}

	/**
	 * Remove the handler and deactivate `draggable` feature.
	 */
	removeHandler() {
		this.element.off("dragstart", this.#dragStart);
		this.element.off("dragmove.namespace", this.#dragMove);
		this.element.off("dragend", this.#dragEnd);
		this.element.draggable(false);
		this.element.forget("_snapDragHandler");
		this.element.forget("_draggable");
	}

	/**
	 * Temporary disables or reenables the drag feature.
	 *
	 * @param {boolean} b - set to `true` to disable
	 */
	set temporaryDisabled(b) {
		if (this.#isTemporaryDisabled !== b) this.#dragHandler.init(!(this.#isTemporaryDisabled = b));
	}

	/**
	 * Get the drag state.
	 *
	 * @returns {boolean} `true` means disabled
	 */
	get temporaryDisabled() {
		return this.#isTemporaryDisabled;
	}

	//- listener -------------------------------------------------------------------------------------------------------

	/**
	 * Listener for the "dragstart" event. Changes the cursor symbol using the class "dragging".
	 * @param {DragEvent} event
	 */
	#dragStart(event) {
		this.element.node.classList.add("dragging");
		this.element.parent().node.classList.add("dragging");

		SnapController.controller.showSnapPoints();

		// is TouchEvent?
		this.#maybeContextmenu = window.TouchEvent && event.detail?.event instanceof TouchEvent;
	}

	/**
	 * Handler for the dragging event. Alters the default behavior to enable snapping to grid and to other components.
	 *
	 * @private
	 * @param {DragEvent} event - the dragging event.
	 */
	#dragMove(event) {
		this.#maybeContextmenu = false; // no contextmenu after any move
		event.preventDefault();

		//TODO add selection relSnappingPoints

		/** @type {SVG.Point} */
		const relMid = this.element.relMid || this.element.symbol?.relMid || new SVG.Point(0, 0);

		const draggedPoint = new SVG.Point(event.detail.box.x + relMid.x, event.detail.box.y + relMid.y);

		/** @type {SVG.Point[]} */
		const snapPoints =
			this.element.relSnappingPoints && this.element.relSnappingPoints.length > 0
				? this.element.relSnappingPoints
				: [new SVG.Point(0, 0)];

		let destination = event.detail.event?.shiftKey
			? draggedPoint
			: SnapController.controller.snapPoint(draggedPoint, snapPoints);

		// console.log(event)
		if (SelectionController.controller.hasSelection()){
			SelectionController.controller.moveSelectionRel(destination.minus(this.element.getAnchorPoint()))
			for (const element of SelectionController.controller.currentlySelectedComponents) {
				if (element instanceof NodeComponentInstance) {
					element.recalculateSnappingPoints()
				}
			}
		}else{
			this.element.moveTo(destination)
		}
		// event.detail.handler.move(destination.x, destination.y);
	}

	/**
	 * Listener for the "dragend" event. Undo the cursor change from {@link "#dragStart"}.
	 * @param {DragEvent} event
	 */
	#dragEnd(event) {
		this.element.node.classList.remove("dragging");
		this.element.parent().node.classList.remove("dragging");

		SnapController.controller.hideSnapPoints();

		if (this.#maybeContextmenu && event.detail?.event instanceof TouchEvent) {
			const clientXY = event.detail.event.touches?.[0] ?? event.detail.event.changedTouches?.[0];
			const contextMenuEvent = new PointerEvent("contextmenu", {
				clientX: clientXY.clientX,
				clientY: clientXY.clientY,
			});
			Promise.resolve().then(() => this.element.node.dispatchEvent(contextMenuEvent));
		} else if (this.element.recalculateSnappingPoints) this.element.recalculateSnappingPoints();
	}
}
