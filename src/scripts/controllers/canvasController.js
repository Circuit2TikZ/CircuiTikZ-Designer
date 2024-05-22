/**
 * @module canvasController
 */

import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.panzoom.js";
import SnapController from "../snapDrag/snapController";
import ComponentInstance from "../components/componentInstance";
import Line from "../lines/line";

/** @typedef {import("../controllers/mainController").default} MainController */

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
	 * The line marking the y axis
	 * @type {SVG.Line}
	 */
	yAxis;


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
	 * the last snapped to point on the canvas
	 */
	lastCanvasPoint = new SVG.Point(0,0)

	//information about the selection
	/**
	 * if selection should add or subtract
	 * @readonly
	 * @enum {number}
	 */
	static SelectionMode = {
		RESET:1,
		ADD:2,
		SUB:3,
	};
	/** @type {SelectionMode} */
	#selectionMode
	/** @type {ComponentInstance[]} */
	#instances = [];
	/** @type {Line[]} */
	#lines = [];
	/** @type {SVG.Point} */
	#selectionStartPosition
	/** @type {SVG.Rect} */
	#selectionRectangle
	/** @type {boolean} */
	#currentlyDragging
	/** @type {ComponentInstance[]} */
	currentlySelectedComponents
	/** @type {Line[]} */
	currentlySelectedLines
	/** @type {boolean} */
	#selectionEnabled

	/**
	 * Create the canvas controller.
	 * @param {SVG.Svg} canvas - the (wrapped) svg element
	 * @param {MainController} mainController
	 */
	constructor(canvas, mainController) {
		CanvasController.controller = this;
		this.canvas = canvas;
		this.#instances = mainController.instances;
		this.#lines = mainController.lines;
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

		canvas.on(["mousemove","touchmove"],(/**@type {MouseEvent}*/evt)=>{
			this.lastCanvasPoint = this.pointerEventToPoint(evt);
		})

		this.#initSelection();
	
		// init context menus
		// if (!CanvasController.#contextMenu) {
		// 	let gridContextEntries = [];
		// 	const gridSpacings = [0.2,0.25,0.5,1,2];
		// 	gridSpacings.forEach(element => {
		// 		gridContextEntries.push({
		// 			result: element.toString(),
		// 			text: `Grid ${element} cm`,
		// 			iconText:"",
		// 		})
		// 	});
	
		// 	const gridMul = [1,2,4,5,8,10];
		// 	gridMul.forEach(element => {
		// 		gridContextEntries.push({
		// 			result: (-element).toString(),
		// 			text: `Grid ratio: ${element}`,
		// 			iconText:"",
		// 		})
		// 	});
		// 	CanvasController.#contextMenu = new ContextMenu(gridContextEntries);
		// }

		// canvas.on('contextmenu', (evt)=>{
		// 	evt.preventDefault();
		// 	let result = CanvasController.#contextMenu.openForResult(evt.clientX, evt.clientY)
		// 	result.then((res) => {
		// 		let gridNum = parseFloat(res);
		// 		if (gridNum>0) {
		// 			// large spacing
		// 			this.changeGrid(gridNum, this.minorToMajorGridPoints);
		// 		}else if (gridNum<0) {
		// 			// grid line ratio
		// 			this.changeGrid(this.majorGridDistance, -gridNum);
		// 		}
		// 	})
		// 	.catch(() => {}); // closed without clicking on item
		// 	evt.stopPropagation();
		// });

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

	#initSelection(){
		this.#selectionStartPosition = new SVG.Point()
		this.#selectionRectangle = this.canvas.rect(0,0).move(0,0);
		this.#selectionRectangle.attr("stroke-width",1)
		this.#selectionRectangle.attr("stroke","grey")
		this.#selectionRectangle.attr("fill","none")
		this.#selectionEnabled = true
		this.currentlySelectedComponents = []
		this.currentlySelectedLines = []
		this.#currentlyDragging = false
		this.#selectionMode = CanvasController.SelectionMode.RESET
		
		this.canvas.on("mousedown",(/**@type {MouseEvent}*/evt)=>{
			if (evt.button===2&&this.#currentlyDragging) {
				// currently dragging a selection rectangle but right mouse button clicked -> cancel selection rectangle
				this.#currentlyDragging = false;
				this.#selectionRectangle.attr("width",0);
				this.#selectionRectangle.attr("height",0);
			}

			if (evt.button===0&&this.#selectionEnabled) {
				let shift = evt.shiftKey||evt.detail.shiftKey
				let ctrl = evt.ctrlKey||evt.detail.ctrlKey
				if (shift) {
					if (ctrl) {
						this.resetSelection();
						this.#selectionMode = CanvasController.SelectionMode.RESET
					}else{
						this.#selectionMode = CanvasController.SelectionMode.ADD;
					}
				}else{
					if (ctrl) {
						this.#selectionMode = CanvasController.SelectionMode.SUB;
					}else{
						this.resetSelection();
						this.#selectionMode = CanvasController.SelectionMode.RESET
					}
				}
				
				this.#currentlyDragging=true;
				this.#selectionStartPosition = CanvasController.controller.pointerEventToPoint(evt, false);

				this.#selectionRectangle.move(this.#selectionStartPosition.x,this.#selectionStartPosition.y);
			}
		})
		this.canvas.on("mousemove",(/**@type {MouseEvent}*/evt)=>{
			if (this.#currentlyDragging) {
				let pt = CanvasController.controller.pointerEventToPoint(evt, false);
				let dx = pt.x-this.#selectionStartPosition.x;
				let dy = pt.y-this.#selectionStartPosition.y;
				let moveX = this.#selectionStartPosition.x;
				let moveY = this.#selectionStartPosition.y;
				if (dx<0) {
					moveX += dx
					dx = -dx
				}
				if (dy<0) {
					moveY += dy
					dy = -dy
				}
				this.#selectionRectangle.move(moveX,moveY)
				this.#selectionRectangle.attr("width",dx);
				this.#selectionRectangle.attr("height",dy);

				this.#showSelection();
			}

		})
		this.canvas.on("mouseup",(/**@type {MouseEvent}*/evt)=>{
			if (evt.button===0) {
				if (this.#currentlyDragging) {
					this.#updateSelection();
					this.#currentlyDragging=false;
					this.#selectionRectangle.attr("width",0);
					this.#selectionRectangle.attr("height",0);
				}

				let pt = CanvasController.controller.pointerEventToPoint(evt, false);
				if (pt.x==this.#selectionStartPosition.x&&pt.y==this.#selectionStartPosition.y) {
					// clicked on canvas
					// TODO
				}
			}
		})
	}

	#showSelection(){
		let selectionBox = this.#selectionRectangle.bbox();
		for (const instance of this.#instances) {
			let cond=false;
			if (this.#selectionMode==CanvasController.SelectionMode.RESET) {
				cond = instance.isInsideSelectionRectangle(selectionBox)
			}else if (this.#selectionMode==CanvasController.SelectionMode.ADD) {
				cond = instance.isInsideSelectionRectangle(selectionBox)||this.currentlySelectedComponents.includes(instance)
			}else{
				cond = !instance.isInsideSelectionRectangle(selectionBox)&&this.currentlySelectedComponents.includes(instance)
			}
			if (cond) {
				instance.showBoundingBox()
			}else{
				instance.hideBoundingBox()
			}
		}

		for (const line of this.#lines) {
			let cond=false;
			if (this.#selectionMode==CanvasController.SelectionMode.RESET) {
				cond = line.isInsideSelectionRectangle(selectionBox)
			}else if (this.#selectionMode==CanvasController.SelectionMode.ADD) {
				cond = line.isInsideSelectionRectangle(selectionBox)||this.currentlySelectedLines.includes(line)
			}else{
				cond = !line.isInsideSelectionRectangle(selectionBox)&&this.currentlySelectedLines.includes(line)
			}
			if (cond) {
				line.showBoundingBox()
			}else{
				line.hideBoundingBox()
			}
		}
	}

	#updateSelection(){
		let selectionBox = this.#selectionRectangle.bbox();
		for (const instance of this.#instances) {
			if (this.#selectionMode==CanvasController.SelectionMode.RESET || this.#selectionMode==CanvasController.SelectionMode.ADD) {
				if (instance.isInsideSelectionRectangle(selectionBox)) {
					if (!this.currentlySelectedComponents.includes(instance)) {
						this.currentlySelectedComponents.push(instance)
					}
				}
			}else{
				if (instance.isInsideSelectionRectangle(selectionBox)) {
					let idx = this.currentlySelectedComponents.indexOf(instance)
					if (idx>-1) {
						this.currentlySelectedComponents.splice(idx,1)
					}
				}
			}
		}

		for (const line of this.#lines) {
			if (this.#selectionMode==CanvasController.SelectionMode.RESET || this.#selectionMode==CanvasController.SelectionMode.ADD) {
				if (line.isInsideSelectionRectangle(selectionBox)) {
					if (!this.currentlySelectedLines.includes(line)) {
						this.currentlySelectedLines.push(line)
					}
				}
			}else{
				if (line.isInsideSelectionRectangle(selectionBox)) {
					let idx = this.currentlySelectedLines.indexOf(line)
					if (idx>-1) {
						this.currentlySelectedLines.splice(idx,1)
					}
				}
			}
		}
	}

	resetSelection(){
		this.currentlySelected = []
	}

	activateSelection(){
		this.#selectionEnabled = true;
	}

	deactivateSelection(){
		this.#selectionEnabled = false;
		this.#selectionRectangle.attr("width",0);
		this.#selectionRectangle.attr("height",0);
		this.#selectionMode = CanvasController.SelectionMode.RESET;
		this.#showSelection();
		this.#updateSelection();
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
