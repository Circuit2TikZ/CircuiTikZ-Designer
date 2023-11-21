/**
 * @module nodeComponentInstance
 */

import * as SVG from "@svgdotjs/svg.js";

import NodeComponentSymbol from "./componentSymbol";
import SnapPoint from "../snapDrag/snapPoint";
import svgSnapDragHandler from "../snapDrag/svgSnapDragHandler";
import ContextMenu from "../controllers/contextMenu";
import MainController from "../controllers/mainController";

/**
 * Instance of a `NodeComponentsSymbol`.
 * @implements {import("./componentInstance").ComponentInstance}
 */
export default class NodeComponentInstance extends SVG.Use {
	/** @type {?ContextMenu} */
	static #contextMenu = null;

	/** @type {NodeComponentSymbol} */
	symbol;

	/** @type {svgSnapDragHandler} */
	#snapDragHandler;

	/** @type {SVG.Container} */
	container;

	/** @type {SVG.Point} */
	#midAbs = new SVG.Point();
	/** @type {SVG.Point} */
	relMid = new SVG.Point();
	/** @type {number} */
	#boxWidth;
	/** @type {number} */
	#boxHeight;
	/** @type {number} */
	#angleDeg = 0;
	/** @type {SnapPoint[]} */
	snappingPoints;

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
	 * Creates a instance of a node-style component. Do not call this constructor directly. Use {@link createInstance}
	 * or {@link fromJson} instead.
	 *
	 * @param {NodeComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container to add the instance to
	 * @param {MouseEvent} [event] - the event which triggered the adding
	 */
	constructor(symbol, container, event) {
		super();

		this.symbol = symbol;
		this.container = container;
		this.point = container.point;
		this.use(this.symbol);
		this.container.add(this);

		this.#recalculateBoxDimensions();

		this.node.classList.add("draggable");
		this.on("dragstart", this.#dragStart, this, { passive: true });
		this.#snapDragHandler = svgSnapDragHandler.snapDrag(this, true);

		if (event && event instanceof MouseEvent) {
			//  && event.type.includes("mouse")
			// 1st: move symbol to curser pos
			let pt = new SVG.Point(event.clientX, event.clientY);
			pt = pt.transform(this.screenCTM().inverseO());
			this.move(pt.x, pt.y);

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

		this.snappingPoints = this.symbol._pins.map(
			(pin) => new SnapPoint(this, pin.name, this.#midAbs, pin, this.#angleDeg, true)
		);
		this.on("dragend", this.#dragEnd, this, { passive: true });

		// init context menus
		if (!NodeComponentInstance.#contextMenu) {
			NodeComponentInstance.#contextMenu = new ContextMenu([
				{
					result: "rotateLeft",
					text: "Rotate counterclockwise",
					iconText: "rotate_left",
				},
				{
					result: "rotateRight",
					text: "Rotate clockwise",
					iconText: "rotate_right",
				},
				{
					result: "remove",
					text: "Remove",
					iconText: "delete",
				},
			]);
		}

		this.on(
			"contextmenu",
			(/** @type {MouseEvent} */ evt) => {
				evt.preventDefault();
				let result = NodeComponentInstance.#contextMenu.openForResult(evt.clientX, evt.clientY);
				result
					.then((res) => {
						switch (res) {
							case "rotateLeft":
								this.rotate(90);
								return;
							case "rotateRight":
								this.rotate(-90);
								return;
							case "remove":
								MainController.controller.removeInstance(this);
								break;
							default:
								console.log("Not implemented: " + res);
						}
					})
					.catch(() => {});
			},
			this
		);
	}

	/**
	 * Re-enable the dragging feature of this instance.
	 */
	enableDragging() {
		this.#snapDragHandler.temporaryDisabled = false;
	}

	/**
	 * Temporary disable the dragging feature of this instance.
	 */
	disableDragging() {
		this.#snapDragHandler.temporaryDisabled = true;
	}

	/**
	 * Add a instance of an (path) symbol to an container.
	 *
	 * @param {NodeComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container/canvas to add the symbol to
	 * @param {MouseEvent} [event] - an optional (mouse/touch) event, which caused the element to be added
	 */
	static createInstance(symbol, container, event) {
		return new NodeComponentInstance(symbol, container, event);
	}

	/**
	 * Create a instance from the (saved) serialized text.
	 *
	 * @param {string} serialized - the saved text/instance
	 * @returns {NodeComponentInstance} the deserialized instance
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
	 *
	 * @returns {string}
	 */
	toTikzString() {
		const optionsString = this.symbol.serializeTikzOptions();
		return (
			"\\node[" +
			this.symbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(this.#angleDeg !== 0 ? `, rotate=${this.#angleDeg}` : "") +
			"] " +
			(this.nodeName ? "(" + this.nodeName + ") " : "") +
			"at " +
			this.#midAbs.toTikzString() +
			" {};"
		);
	}

	/**
	 * Moves the component by its mid point.
	 *
	 * @param {number} x - the new mid x coordinate
	 * @param {number} y - the new mid y coordinate
	 * @returns {this}
	 */
	move(x, y) {
		this.#midAbs.x = x;
		this.#midAbs.y = y;

		// don't call recalculateRelSnappingPoints here; #dragEnd does call this method instead

		if (this.#angleDeg === 0) {
			super.move(x - this.symbol.relMid.x, y - this.symbol.relMid.y);
		} else {
			super.attr("transform", `translate(${x}, ${y}) rotate(${-this.#angleDeg})`);
		}
		return this;
	}

	/**
	 * Rotate the instance counter clockwise around its {@link #midAbs} point.
	 *
	 * @param {number} angleDeg - the angle to add to the current rotation (initially 0)
	 */
	rotate(angleDeg) {
		this.#angleDeg += angleDeg;
		while (this.#angleDeg > 180) this.#angleDeg -= 360;
		while (this.#angleDeg <= -180) this.#angleDeg += 360;

		// recalculate box width & height
		this.#recalculateBoxDimensions();
		this.#recalculateRelSnappingPoints();

		if (this.#angleDeg === 0) {
			super.attr("transform", null);
			super.move(this.#midAbs.x - this.symbol.relMid.x, this.#midAbs.y - this.symbol.relMid.y);
		} else {
			super.attr("transform", `translate(${this.#midAbs.x}, ${this.#midAbs.y}) rotate(${-this.#angleDeg})`);
			super.move(-this.symbol.relMid.x, -this.symbol.relMid.y);
		}
	}

	/**
	 * Internal helper to recalculate the view box/bounding box (BBox) dimensions (with, height) and the vector
	 * ({@link relMid}) between the top left corner of the BBox and {@link #midAbs}.
	 *
	 * Call this, if the angle/rotation changed.
	 */
	#recalculateBoxDimensions() {
		switch (this.#angleDeg) {
			case 0:
			case 180:
				this.#boxWidth = this.symbol.viewBox.width;
				this.#boxHeight = this.symbol.viewBox.height;
				break;
			case 90:
			case -90:
				this.#boxWidth = this.symbol.viewBox.height;
				this.#boxHeight = this.symbol.viewBox.width;
				break;
			default:
				throw Exception("Not implemented");
		}

		switch (this.#angleDeg) {
			case 0:
				this.relMid.x = this.symbol.relMid.x;
				this.relMid.y = this.symbol.relMid.y;
				break;
			case 90:
				this.relMid.x = this.symbol.relMid.y;
				this.relMid.y = -this.symbol.relMid.x + this.#boxHeight;
				break;
			case 180:
				this.relMid.x = -this.symbol.relMid.x + this.#boxWidth;
				this.relMid.y = -this.symbol.relMid.y + this.#boxHeight;
				break;
			case -90:
				this.relMid.x = -this.symbol.relMid.y + this.#boxWidth;
				this.relMid.y = this.symbol.relMid.x;
				break;
		}
	}

	/**
	 * Recalculate the snapping points, which are used by other symbols.
	 */
	#recalculateRelSnappingPoints() {
		for (const snapPoint of this.snappingPoints) snapPoint.recalculate(null, this.#angleDeg);
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
	 * Get the bounding box. Uses the viewBox, if set. The Svg.js and DOM functions return nonsense on rotated elements.
	 *
	 * @returns {SVG.Box}
	 */
	bbox() {
		if (this.#angleDeg === 0) return new SVG.Box(this.x(), this.y(), this.symbol.viewBox.w, this.symbol.viewBox.h);

		return new SVG.Box(
			this.#midAbs.x - this.relMid.x,
			this.#midAbs.y - this.relMid.y,
			this.#boxWidth,
			this.#boxHeight
		);
	}

	//- listener -------------------------------------------------------------------------------------------------------

	/**
	 * Listener for the "dragstart" event. Changes the cursor symbol using the class "dragging".
	 */
	#dragStart() {
		this.node.classList.add("dragging");
		this.container.node.classList.add("dragging");
	}

	/**
	 * Listener for the "dragend" event. Undo the cursor change from {@link "#dragStart"}.
	 */
	#dragEnd() {
		this.node.classList.remove("dragging");
		this.container.node.classList.remove("dragging");
		this.#recalculateRelSnappingPoints();
	}
}
