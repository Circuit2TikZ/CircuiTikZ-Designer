/**
 * @module nodeDragHandler
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";

import {SnapController, NodeComponentInstance, SelectionController, Undo, MainController} from "../internal";

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
export class NodeDragHandler {
	/** @type {NodeComponentInstance} */
	element;

	/** @type {DragHandler} */
	#dragHandler;

	/** @type {boolean} */
	#isTemporaryDisabled = false;
	/** @type {boolean} */
	#maybeContextmenu = false; // fixes contextmenu action on touchscreens

	#startedDragging = false
	#didDrag = false

	/**
	 * Do not call directly. Use {@link NodeDragHandler.snapDrag} for enabling and disabling of the handler instead.
	 *
	 * @private
	 * @hideconstructor
	 * @see NodeDragHandler.snapDrag - use this instead
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
	 * @returns {NodeDragHandler|null} the handler, if activated
	 */
	static snapDrag(element, enable) {
		
		/** @type {NodeDragHandler|null} */
		let snapDragHandler = element.remember("_snapDragHandler") ?? (enable ? new NodeDragHandler(element) : null);
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
		this.#startedDragging = true;
		this.element.node.classList.add("dragging");
		this.element.parent().node.classList.add("dragging");

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

		if (!this.#didDrag) {
			// only show snapping points if actually moving
			SnapController.controller.showSnapPoints();
		}

		this.#didDrag = true;
		event.preventDefault();

		/** @type {SVG.Point} */
		const relMid = this.element.relMid || this.element.symbol?.relMid || new SVG.Point(0, 0);

		const draggedPoint = new SVG.Point(event.detail.box.x + relMid.x, event.detail.box.y + relMid.y);

		/** @type {SVG.Point[]} */
		const snapPoints =
			this.element.relSnappingPoints && this.element.relSnappingPoints.length > 0
				? this.element.relSnappingPoints
				: [new SVG.Point(0, 0)];

		let componentInSelection = SelectionController.controller.currentlySelectedComponents.includes(this.element)
		if (componentInSelection) {
			const componentAnchor = this.element.getAnchorPoint()
			for (const component of SelectionController.controller.currentlySelectedComponents) {
				if(component!=this.element){
					for (const snappingPoint of component.snappingPoints) {
						snapPoints.push(snappingPoint.relToComponentAnchor().plus(component.getAnchorPoint()).minus(componentAnchor))
					}
				}
			}
	
			for (const line of SelectionController.controller.currentlySelectedLines) {
				for(const endPoint of line.getEndPoints()){
					snapPoints.push(endPoint.minus(componentAnchor))
				}
			}
		}

		let destination = event.detail.event?.shiftKey
			? draggedPoint
			: SnapController.controller.snapPoint(draggedPoint, snapPoints);

		if (componentInSelection){
			SelectionController.controller.moveSelectionRel(destination.minus(this.element.getAnchorPoint()))
			for (const element of SelectionController.controller.currentlySelectedComponents) {
				if (element instanceof NodeComponentInstance) {
					element.recalculateSnappingPoints()
				}
			}
		}else{
			this.element.moveTo(destination)
		}
	}

	/**
	 * Listener for the "dragend" event. Undo the cursor change from {@link "#dragStart"}.
	 * @param {DragEvent} event
	 */
	#dragEnd(event, trackState=true) {
		if (!this.#startedDragging) {
			return
		}

		if (!this.#didDrag) {
			// didn't move at all -> essentially clicked the component --> select the component instead
			let ctrlCommand = event.detail.event.ctrlKey||(MainController.controller.isMac&&event.detail.event.metaKey)
			let selectionMode = event.detail.event.shiftKey?SelectionController.SelectionMode.ADD:ctrlCommand?SelectionController.SelectionMode.SUB:SelectionController.SelectionMode.RESET;

			SelectionController.controller.selectComponents([this.element], selectionMode)
			trackState = false;			
		}

		this.#didDrag = false;
		this.#startedDragging = false;
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

		if (trackState) {
			Undo.addState()
		}
	}
}
