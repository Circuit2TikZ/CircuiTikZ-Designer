/**
 * @module canvasController
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.panzoom.js";

/**
 * @typedef {object} PanningEventDetail
 * @property {SVG.Box} box
 * @property {MouseEvent} event
 */

/**
 * @typedef {object} WheelZoomEventDetail
 * @property {number} level
 * @property {SVG.Point} focus
 */

/**
 * @typedef {object} PinchZoomEventDetail
 * @property {SVG.Box} box
 * @property {SVG.Point} focus
 */

/**
 * Controller for the SVG canvas. Enables/disables zooming and panning.
 * @class
 */
export default class CanvasController {
	/**
	 * Static variable holding the instance.
	 * @type {CanvasController}
	 */
	static controller;
	/**
	 * The (root) SVG Element. All lines and components are children of this element.
	 * @type {SVG.Svg}
	 */
	canvas;
	/**
	 * The background (grid)
	 * @type {SVG.Rect}
	 */
	paper;
	/**
	 * The line marking the x axis
	 * @type {SVG.Line}
	 */
	xAxis;
	/**
	 * The line marking the < axis
	 * @type {SVG.Line}
	 */
	yAxis;

	/**
	 * Needed for window size changes to reconstruct the old zoom level.
	 * @type {?DOMRect}
	 */
	#canvasBounds = null;

	/** @type {?SVG.Matrix} */
	#invScreenCTM = null;

	/**
	 * Create the canvas controller.
	 * @param {SVG.Svg} canvas - the (wrapped) svg element
	 */
	constructor(canvas) {
		CanvasController.controller = this;
		this.canvas = canvas;
		this.paper = SVG.SVG("#grid");
		this.xAxis = SVG.SVG("#xAxis");
		this.yAxis = SVG.SVG("#yAxis");

		// init viewBox
		this.#onResizeCanvas();

		// observe page size change
		new ResizeObserver(this.#onResizeCanvas.bind(this)).observe(this.canvas.node);

		// init pan & zoom
		this.activatePanning();

		// Drag picture with mouse
		canvas.on("panning", this.#movePaper, this, { passive: false });

		// Mouse wheel OR pinch zoom
		// Wheel zoom is fired before the actual change and has no detail.box and is thus ignored. It will be handled by wheel.panZoom.
		canvas.on("zoom", this.#movePaper, this, { passive: true });

		// Modify point, viewbox and zoom functions to cache the inverse screen CTM (document -> viewport coords)
		/**
		 * @param {number|SVG.Point|[number, number]|{ x: number, y: number }} [x]
		 * @param {number} [y]
		 * @returns {SVG.Point}
		 */
		this.canvas.point = (x, y) => {
			if (!this.#invScreenCTM) this.#invScreenCTM = this.canvas.screenCTM().inverseO();
			return new SVG.Point(x, y).transformO(this.#invScreenCTM);
		};

		const oldViewBoxFunction = this.canvas.viewbox;
		this.canvas.viewbox = (...args) => {
			if (arguments.length > 0) this.#invScreenCTM = null;
			return oldViewBoxFunction.apply(this.canvas, args);
		};

		const oldZoomFunction = this.canvas.zoom;
		this.canvas.zoom = (...args) => {
			if (arguments.length > 0) this.#invScreenCTM = null;
			return oldZoomFunction.apply(this.canvas, args);
		};
	}

	/**
	 * Deactivate the mouse and touch panning feature temporary.
	 *
	 * Removes listeners from the canvas.
	 */
	deactivatePanning() {
		// this listener must be inserted after the normal panZoom listeners --> unregister first
		this.canvas.off("wheel.panZoom", this.#movePaper);
		// re-init pan & zoom
		this.canvas.panZoom({
			panning: false, // still enabled for two finger & wheel zoom panning
			pinchZoom: true,
			wheelZoom: true,
			panButton: 99, // deactivates panning using any mouse button
			oneFingerPan: false,
			zoomMin: 0.25,
			zoomMax: 10, // dbg; default 5
		});

		// Listens for same event as svg.panzoom.js, but is added thereafter. Thus this gets called after panzoom is
		// done moving the picture.
		// @param {WheelEvent} evt
		this.canvas.on("wheel.panZoom", this.#movePaper, this, { passive: true });
	}

	/**
	 * Activate the mouse and touch panning  feature. The initial state is active. Call this function only, if you
	 * previously called {@link deactivatePanning}.
	 *
	 * Adds listeners to the canvas.
	 */
	activatePanning() {
		// this listener must be inserted after the normal panZoom listeners --> unregister first
		this.canvas.off("wheel.panZoom", this.#movePaper);
		// init pan & zoom
		this.canvas.panZoom({
			panning: true,
			pinchZoom: true,
			wheelZoom: true,
			// panButton: 0,
			oneFingerPan: true,
			zoomMin: 0.25,
			zoomMax: 10,
		});

		// Listens for same event as svg.panzoom.js, but is added thereafter. Thus this gets called after panzoom is
		// done moving the picture.
		// @param {WheelEvent} evt
		this.canvas.on("wheel.panZoom", this.#movePaper, this, { passive: true });
	}

	/**
	 * Converts a point from an event to the SVG coordinate system.
	 *
	 * @param {PointerEvent|MouseEvent|Touch} event
	 * @returns {SVG.Point}
	 */
	pointerEventToPoint(event) {
		//                touchstart/-move             touchend             mouse*
		//               /----------------\    /-----------------------\    /---\
		const clientXY = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
		return this.canvas.point(clientXY.clientX, clientXY.clientY);
	}

	/**
	 * Called if the window/page is resized.
	 *
	 * Corrects the canvas viewBox. Also calls `#movePaper` to fix the axis.
	 */
	#onResizeCanvas() {
		const newCanvasBounds = this.canvas.node.getBoundingClientRect();
		/** @type {SVG.Box} */
		const oldViewbox = this.canvas.viewbox() || { x: 0, y: 0 };
		const zoom = !this.#canvasBounds
			? 1
			: Math.max(
					0.25,
					Math.min(
						10,
						this.#canvasBounds.width / oldViewbox.width,
						this.#canvasBounds.height / oldViewbox.height
					)
				);

		const newViewbox = new SVG.Box(
			oldViewbox.x,
			oldViewbox.y,
			newCanvasBounds.width / zoom,
			newCanvasBounds.height / zoom
		);
		this.canvas.viewbox(newViewbox);
		this.#movePaper(newViewbox); // fixes axis

		this.#canvasBounds = newCanvasBounds;
	}

	/**
	 * Move paper/grid and axis on zoom/pan.
	 *
	 * @param {CustomEvent<PanningEventDetail|WheelZoomEventDetail|PinchZoomEventDetail>|SVG.Box} [evt] - the event of svg.panzoom.js or an box if called manually
	 */
	#movePaper(evt) {
		/** @type {SVG.Box} */
		if (evt?.detail && ! evt.detail.box) return; // is wheel zoom --> fired before actual zoom
		const box = evt?.detail?.box ?? (evt && typeof evt.x2 === "number" ? evt : this.canvas.viewbox());

		this.paper.move(box.x, box.y);
		this.xAxis.attr({ x1: box.x, x2: box.x2 });
		this.yAxis.attr({ y1: box.y, y2: box.y2 });
	}
}
