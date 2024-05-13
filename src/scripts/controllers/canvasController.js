/**
 * @module canvasController
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.panzoom.js";
import ContextMenu from "../controllers/contextMenu";
import MainController from "./mainController";

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

	/** Context menu for changing the grid
	 * @type {ContextMenu}
	 */
	static #contextMenu = null;

	/** Distance between major grid lines
	 * @type {float}
	 */
	majorGridDistance = 1;
	/** How many minor grid lines are drawn for every major grid line
	 * @type {int}
	 */
	minorToMajorGridPoints = 4;

	/**
	 * Needed for window size changes to reconstruct the old zoom level.
	 * @type {?DOMRect}
	 */
	#canvasBounds = null;

	/** @type {?SVG.Matrix} */
	#invScreenCTM = null;

	/** zoom parameters; small zoomFactor for more granular control
	 * @type {float}
	 */
	zoomFactor = 0.1;
	/**@type {float} */
	zoomMin = 0.25;
	/**@type {float} */
	zoomMax = 10;

	/** essentially a flag to know if and which component is currently being placed. useful for shortcut behaviour
	 * @type {?ComponentInstance}
	 */
	placingComponent = null;

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

	
		// init context menus
		if (!CanvasController.#contextMenu) {
			let gridContextEntries = [];
			const gridSpacings = [0.2,0.25,0.5,1,2];
			gridSpacings.forEach(element => {
				gridContextEntries.push({
					result: element.toString(),
					text: `Grid ${element} cm`,
					iconText:"",
				})
			});
	
			const gridMul = [1,2,4,5,8,10];
			gridMul.forEach(element => {
				gridContextEntries.push({
					result: (-element).toString(),
					text: `Grid ratio: ${element}`,
					iconText:"",
				})
			});
			CanvasController.#contextMenu = new ContextMenu(gridContextEntries);
		}

		canvas.on('contextmenu', (evt)=>{
			evt.preventDefault();
			let result = CanvasController.#contextMenu.openForResult(evt.clientX, evt.clientY)
			result.then((res) => {
				let gridNum = parseFloat(res);
				if (gridNum>0) {
					// large spacing
					this.changeGrid(gridNum, this.minorToMajorGridPoints);
				}else if (gridNum<0) {
					// grid line ratio
					this.changeGrid(this.majorGridDistance, -gridNum);
				}
			})
			.catch(() => {}); // closed without clicking on item
			evt.stopPropagation();
		});

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
			zoomFactor: this.zoomFactor,
			zoomMin: this.zoomMin,
			zoomMax: this.zoomMax, // dbg; default 5
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
			zoomFactor: this.zoomFactor,
			zoomMin: this.zoomMin,
			zoomMax: this.zoomMax,
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


	/** how the grid should be drawn
	 * @param {number} minorGridDistance the distance between two major grid lines in cm
	 * @param {int} minorToMajorGridPoints how many minor grid lines are drawn per major grid line (>=1)
	 */
	changeGrid(majorGridDistance, minorToMajorGridPoints){
		minorToMajorGridPoints = minorToMajorGridPoints>0?minorToMajorGridPoints:1;
		this.minorToMajorGridPoints = minorToMajorGridPoints;
		this.majorGridDistance = majorGridDistance;
		let minorGridDistance = majorGridDistance/minorToMajorGridPoints;
		const snapDistanceNum = new SVG.Number(minorGridDistance, "cm").toString();
		const snapDistancePx = new SVG.Number(minorGridDistance, "cm").convertToUnit("px").value;
		const majorDistanceNum = new SVG.Number(majorGridDistance, "cm").toString();
		const majorDistancePx = new SVG.Number(majorGridDistance, "cm").convertToUnit("px").value;

		// change small grid
		const minorGrid = document.getElementById("smallGridPattern");
		minorGrid.setAttribute("width", snapDistanceNum);
		minorGrid.setAttribute("height", snapDistanceNum);
		minorGrid.children[0]?.setAttribute("d",`M ${snapDistancePx} 0 L 0 0 0 ${snapDistancePx}`);

		// change large grid
		const majorGrid = document.getElementById("gridPattern");
		majorGrid.setAttribute("width", majorDistanceNum);
		majorGrid.setAttribute("height", majorDistanceNum);
		majorGrid.children[0]?.setAttribute("width",majorDistanceNum);
		majorGrid.children[0]?.setAttribute("height",majorDistanceNum);
		majorGrid.children[1]?.setAttribute("d",`M ${majorDistancePx} 0 L 0 0 0 ${majorDistancePx}`);
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
