/**
 * @module CanvasController
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

export default class CanvasController {
	/** @type {SVG.Svg} */
	canvas;
	/** @type {SVG.Rect} */
	paper;
	/** @type {SVG.Line} */
	xAxis;
	/** @type {SVG.Line} */
	yAxis;

	/**
	 *
	 * @param {SVG.Svg} canvas - the (wrapped) svg element
	 */
	constructor(canvas) {
		this.canvas = canvas;
		this.paper = SVG.SVG("#grid");
		this.xAxis = SVG.SVG("#xAxis");
		this.yAxis = SVG.SVG("#yAxis");

		// init viewBox
		this.#resizeCanvas(); // <-- init viewbox

		// observe size change
		new ResizeObserver(this.#resizeCanvas.bind(this)).observe(this.canvas.node);

		// init pan & zoom
		this.canvas.panZoom({
			panning: true,
			pinchZoom: true,
			wheelZoom: true,
			// panButton: 0,
			oneFingerPan: true,
			zoomMin: 0.25,
			zoomMax: 10, // dbg; default 5
		});

		// Drag picture with mouse
		canvas.on("panning", this.#movePaper, this);

		// Mouse wheel OR pinch zoom
		// Wheel zoom has no detail & detail.box and is thus ignored. It will be handled by wheel.panZoom.
		canvas.on("zoom", this.#movePaper, this);

		// Listens for same event as svg.panzoom.js, but is added thereafter. Thus this gets called after panzoom is
		// done moving the picture.
		// @param {WheelEvent} evt
		canvas.on("wheel.panZoom", () => this.#movePaper({ detail: { box: this.canvas.viewbox() } }), this, {
			passive: false,
		});
	}

	#resizeCanvas() {
		const canvasBounds = this.canvas.node.getBoundingClientRect();
		/** @type {SVG.Box} */
		const oldViewbox = this.canvas.viewbox() || { x: 0, y: 0 };
		this.canvas.viewbox(oldViewbox.x, oldViewbox.y, canvasBounds.width, canvasBounds.height);
	}

	/**
	 * Move paper/grid and axis on zoom/pan.
	 *
	 * @param {CustomEvent<PanningEventDetail|WheelZoomEventDetail|PinchZoomEventDetail>} evt - the event of svg.panzoom.js
	 */
	#movePaper(evt) {
		if (evt.detail?.box) {
			this.paper.move(evt.detail.box.x, evt.detail.box.y);
			this.xAxis.attr("x1", evt.detail.box.x);
			this.xAxis.attr("x2", evt.detail.box.x2);
			this.yAxis.attr("y1", evt.detail.box.y);
			this.yAxis.attr("y2", evt.detail.box.y2);
		}
	}
}
