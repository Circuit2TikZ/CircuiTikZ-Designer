/**
 * @module svgSnapDragHandler
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";

import {SnapController, Undo, PathComponentInstance} from "../internal";

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

export class PathDragHandler {
	/** @type {SVG.Element} */
	element;
	/** @type {PathComponentInstance} */
	parentElement;
	/** @type {SVG.Point} */
	relMid;
	/** @type {boolean} */
	moveStart;

	/** @type {DragHandler} */
	#dragHandler;

	/** @type {boolean} */
	#isTemporaryDisabled = false;

	#currentlyDragging = false

	/**
	 * Do not call directly. Use {@link PathDragHandler.snapDrag} for enabling and disabling of the handler instead.
	 *
	 * @private
	 * @hideconstructor
	 * @see PathDragHandler.snapDrag - use this instead
	 * @param {PathComponentInstance} element - the element to enable snap-dragging
	 * @param {boolean} moveStart
	 * @param {function(boolean): void} element.draggable
	 */
	constructor(element, moveStart) {
		this.parentElement = element;
		this.moveStart = moveStart
		if (moveStart) {
			this.element = this.parentElement.startCircle;
		}else{
			this.element = this.parentElement.endCircle;
		}
		let circleBbox = this.element.bbox()
		/** @type {SVG.Point} */
		this.relMid = new SVG.Point(circleBbox.w/2,circleBbox.h/2);
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
	 * @param {PathComponentInstance} parentElement
	 * @param {boolean} moveStart - the element to modify/query
	 * @param {boolean} [enable] - `true` --> activate, `false` --> deactivate, `undefined` --> query
	 * @returns {PathDragHandler|null} the handler, if activated
	 */
	static snapDrag(parentElement, moveStart, enable) {
		/** @type {SVG.Shape} */
		let dragElement;
		if (moveStart) {
			dragElement = parentElement.startCircle
		}else{
			dragElement = parentElement.endCircle
		}

		/** @type {PathDragHandler|null} */
		let snapDragHandler = dragElement.remember("_snapDragHandler") ?? (enable ? new PathDragHandler(parentElement,moveStart) : null);
		if (enable === false && snapDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			snapDragHandler.#dragEnd(null,false)
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
		this.#currentlyDragging = true;
		this.element.node.classList.add("dragging");
		this.element.parent().node.classList.add("dragging");		

		SnapController.controller.showSnapPoints();
	}

	/**
	 * Handler for the dragging event. Alters the default behavior to enable snapping to grid and to other components.
	 *
	 * @private
	 * @param {DragEvent} event - the dragging event.
	 */
	#dragMove(event) {
		event.preventDefault();
		
		const draggedPoint = new SVG.Point(event.detail.box.x + this.relMid.x, event.detail.box.y + this.relMid.y);

		/** @type {SVG.Point[]} */
		const snapPoints =
			this.element.relSnappingPoints && this.element.relSnappingPoints.length > 0
				? this.element.relSnappingPoints
				: [new SVG.Point(0, 0)];

		let destination = event.detail.event?.shiftKey
			? draggedPoint
			: SnapController.controller.snapPoint(draggedPoint, snapPoints);

		if (this.moveStart) {
			this.parentElement.moveStartTo(destination)
		}else{
			this.parentElement.moveEndTo(destination)
		}
	}

	/**
	 * Listener for the "dragend" event. Undo the cursor change from {@link "#dragStart"}.
	 * @param {DragEvent} event
	 */
	#dragEnd(event, trackState=true) {
		if (!this.#currentlyDragging) {
			return
		}

		this.#currentlyDragging = false;
		this.element.node.classList.remove("dragging");
		this.element.parent().node.classList.remove("dragging");

		SnapController.controller.hideSnapPoints();

		if (trackState) {
			Undo.addState()
		}
	}
}