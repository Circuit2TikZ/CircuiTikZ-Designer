/**
 * @module canvasController
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.panzoom.js";
import { SnapController, ComponentInstance, Undo } from "../internal";

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
 * Controller for the SVG canvas. Enables/disables zooming and panning. Manages selections
 * @class
 */
export class CanvasController {
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
	 * The line marking the y axis
	 * @type {SVG.Line}
	 */
	yAxis;


	/** Distance between major grid lines
	 * @type {float}
	 */
	majorGridSizecm = 1;
	/** How many minor grid lines are drawn for every major grid line
	 * @type {int}
	 */
	majorGridSubdivisions = 4;
	gridVisible = true

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
	 * the last snapped to point on the canvas
	 */
	lastCanvasPoint = new SVG.Point(0,0)

	// the first index a component can be placed at while still being drawn above the background grid and axis
	#firstIndex = 5
	#defs

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
		this.#defs = SVG.SVG("#backgroundDefs");		

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

		canvas.on(["mousemove","touchmove"],(/**@type {MouseEvent}*/evt)=>{
			this.lastCanvasPoint = this.pointerEventToPoint(evt);
		})

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
				
		// shift whole canvas down such that the origin is in the bottom left corner
		let box = this.canvas.viewbox();
		box.y -= box.h
		// shift canvas up right to see the axes with the default view
		let moveAmount = Math.max(0.05*Math.min(box.w,box.h),10)
		box.x -= moveAmount
		box.y += moveAmount
		this.canvas.viewbox(box)
		this.canvas.zoom(2,new SVG.Point())

		let gridVisibleToggle = document.getElementById("gridVisible") as HTMLInputElement

		let storage = localStorage.getItem("circuit2tikz-designer-grid")
		if(storage) {
			let gridSettings = JSON.parse(storage)
			if (gridSettings) {
				if (gridSettings.majorGridSizecm&&gridSettings.majorGridSubdivisions) {
					this.changeGrid(gridSettings.majorGridSizecm,gridSettings.majorGridSubdivisions)
				}
				this.gridVisible = gridSettings.gridVisible
				if (!this.gridVisible) {
					this.paper.addClass("d-none")
				}
			}
		} else {
			localStorage.setItem("circuit2tikz-designer-grid",JSON.stringify({
				majorGridSizecm:this.majorGridSizecm,
				majorGridSubdivisions:this.majorGridSubdivisions,
				gridVisible:this.gridVisible
			}))
		}
		gridVisibleToggle.checked = this.gridVisible

		gridVisibleToggle.addEventListener("change",(ev)=>{
			this.gridVisible = gridVisibleToggle.checked
			if (this.gridVisible) {
				if (this.paper.hasClass("d-none")) {
					this.paper.removeClass("d-none")
				}
			}else{
				this.paper.addClass("d-none")
			}
			this.#saveSettings()
		})
	}

	#saveSettings(){
		localStorage.setItem("circuit2tikz-designer-grid",JSON.stringify({
			majorGridSizecm:this.majorGridSizecm,
			majorGridSubdivisions:this.majorGridSubdivisions,
			gridVisible:this.gridVisible
		}))
	}

	/**
	 * 
	 * @param {SVG.Element} component 
	 */
	bringComponentToFront(component){
		let index = this.canvas.children().findIndex(c=>c===component);
		this.canvas.put(component)
		if (index!==this.canvas.children().findIndex(c=>c===component)) {
			Undo.addState()
		}
	}

	/**
	 * 
	 * @param {SVG.Element} component 
	 */
	moveComponentToBack(component){
		let index = this.canvas.children().findIndex(c=>c===component);
		// does put actually work on childNodes instead of children? this would explain why we need 11 instead of 6...
		// this is super weird??
		// see this.canvas.node.childNodes		
		this.canvas.put(component,11)
		if (index!==this.canvas.children().findIndex(c=>c===component)) {
			Undo.addState()
		}
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
			panButton: 2,
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
	 * @param {boolean} snap if the pointer should check if snapping should be done
	 * @returns {SVG.Point}
	 */
	pointerEventToPoint(event, snap = true) {
		//                touchstart/-move             touchend             mouse*
		//               /----------------\    /-----------------------\    /---\
		const clientXY = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
		let pt = this.canvas.point(clientXY.clientX, clientXY.clientY);
		return event.shiftKey || event.detail.event?.shiftKey || !snap
				? pt
				: SnapController.controller.snapPoint(pt, [{ x: 0, y: 0 }]);
	}


	/** how the grid should be drawn
	 * @param {number} majorSizecm the distance between two major grid lines in cm
	 * @param {int} majorSubdivisions how many minor grid lines are drawn per major grid line (>=1)
	 */
	changeGrid(majorSizecm, majorSubdivisions){
		this.majorGridSubdivisions = majorSubdivisions;
		this.majorGridSizecm = majorSizecm;
		let minorGridDistance = majorSizecm/majorSubdivisions;
		const snapDistanceNum = new SVG.Number(minorGridDistance, "cm").toString();
		const snapDistancePx = new SVG.Number(minorGridDistance, "cm").convertToUnit("px").value;
		const majorDistanceNum = new SVG.Number(majorSizecm, "cm").toString();
		const majorDistancePx = new SVG.Number(majorSizecm, "cm").convertToUnit("px").value;

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

		this.#saveSettings()
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
