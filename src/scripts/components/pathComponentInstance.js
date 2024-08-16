/**
 * @module pathComponentInstance
 */

import * as SVG from "@svgdotjs/svg.js";

import CanvasController from "../controllers/canvasController";
import PathComponentSymbol from "./pathComponentSymbol";
import SnapController from "../snapDrag/snapController";
import SnapCursorController from "../snapDrag/snapCursor";
import SnapPoint from "../snapDrag/snapPoint";
import { lineRectIntersection, pointInsideRect, selectedBoxWidth, selectedWireWidth } from "../utils/selectionHelper";
import MainController from "../controllers/mainController";

/**
 * Instance of a `PathComponentSymbol`.
 * @implements {import("./componentInstance").ComponentInstance}
 */
export default class PathComponentInstance extends SVG.G {
	/** @type {PathComponentSymbol} */
	symbol;
	/** @type {SVG.Use} */
	symbolUse;

	/** @type {boolean} */
	static #hasMouse = matchMedia("(pointer:fine)").matches;

	/** @type {SVG.PointArray} */
	#prePointArray;
	/** @type {SVG.PointArray} */
	#postPointArray;
	/** @type {SVG.Line} */
	#preLine;
	/** @type {SVG.Line} */
	#postLine;
	/** @type {0|1|2} */
	#pointsSet = 0;

	/** @type {SVG.Point} */
	#midAbs;
	/** @type {number} */
	#rotationAngle;
	/** @type {SnapPoint[]} */
	snappingPoints;

	/**@type {boolean} */
	#mirror = false;

	/**
	 * @type {?SVG.Rect}
	 */
	#selectionRectangle = null;

	/**
	 * @type {function():void}
	 */
	#finishedPlacingCallback  = ()=>{};

	/**
	 * Add a instance of an (path) symbol to an container.
	 *
	 * @param {PathComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container/canvas to add the symbol to
 	 * @param {function():void} finishedPlacingCallback callback getting called when the element has been placed
	 */
	constructor(symbol, container, finishedPlacingCallback) {
		super();
		this.hide(); // is shown AFTER first click/touch
		this.#finishedPlacingCallback = finishedPlacingCallback;

		this.symbol = symbol;
		this.container = container;
		this.point = container.point;
		this.container.add(this);

		this.symbolUse = new SVG.Use();
		this.symbolUse.use(this.symbol);
		this.add(this.symbolUse);

		this.#prePointArray = new SVG.PointArray([
			[0, 0],
			[0, 0],
		]);
		this.#postPointArray = new SVG.PointArray([
			[0, 0],
			[0, 0],
		]);

		this.#preLine = this.line(this.#prePointArray);
		this.#preLine.attr({
			fill: "none",
			stroke: "#000",
			"stroke-width": "0.4pt",
		});
		this.#postLine = this.line(this.#postPointArray);
		this.#postLine.attr({
			fill: "none",
			stroke: "#000",
			"stroke-width": "0.4pt",
		});

		this.container.node.classList.add("selectPoint");
		SnapCursorController.controller.visible = PathComponentInstance.#hasMouse;
		SnapController.controller.showSnapPoints();
		CanvasController.controller.deactivatePanning();
		this.container.on(["mousemove", "touchmove"], this.#moveListener, this);
		this.container.on(["click", "touchstart", "touchend"], this.#clickListener, this);
		this.cancelPlacement = this.cancelPlacement.bind(this);
		document.addEventListener("keydown", this.cancelPlacement)
		// this.container.on("keydown", this.#cancelPlacement, this)

		// add snap points for other components
		this.#midAbs = new SVG.Point(0, 0);
		this.snappingPoints = [
			new SnapPoint(this, null, this.#prePointArray[0], [0, 0], 0),
			new SnapPoint(this, null, this.#postPointArray[1], [0, 0], 0),
			...this.symbol._pins.map((pin) => new SnapPoint(this, pin.name, this.#midAbs, pin, 0)),
		];
	}

	/**
	 * Add a instance of an (path) symbol to an container.
	 *
	 * @param {PathComponentSymbol} symbol - the symbol to use
	 * @param {SVG.Container} container - the container/canvas to add the symbol to
	 * @param {MouseEvent} [_event] - an optional (mouse/touch) event, which caused the element to be added
	 * @param {function():void} finishedPlacingCallback callback getting called when the element has been placed
	 */
	static createInstance(symbol, container, _event, finishedPlacingCallback) {
		return new PathComponentInstance(symbol, container, finishedPlacingCallback);
	}

	isInsideSelectionRectangle(selectionRectangle){
		if (this.#pointsSet<2) {
			return false;
		}
		// if 1 of the 2 lines hanging of the symbol intersect the selection rect -> should select
		if (lineRectIntersection(this.#preLine,selectionRectangle)
			||(lineRectIntersection(this.#postLine,selectionRectangle))) {
			return true;
		}

		// get bounding box of the center symbol in the rotated frame but without rotation
		let bbox = this.symbolUse.bbox();
		// get the corner points of the bounding box and rotate each of them to their proper positions
		let transform = { rotate: -this.#rotationAngle, ox: this.#midAbs.x, oy: this.#midAbs.y };
		let boxPoints = [
			new SVG.Point(bbox.x,bbox.y).transform(transform),
			new SVG.Point(bbox.x2,bbox.y).transform(transform),
			new SVG.Point(bbox.x2,bbox.y2).transform(transform),
			new SVG.Point(bbox.x,bbox.y2).transform(transform)
		];
		
		// if all of these points are inside the selection rect -> should select
		if (boxPoints.map((value)=>pointInsideRect(value,selectionRectangle)).every((value)=>value)) {
			return true;
		}

		//TODO technically, the function will return false if the complete selection rectangle is inside the component bounding box. Should the component be selected in this case? And if yes, is it even important to look at this edge case?

		// if at least one line defined by 2 of the 4 corner points intersects the selection rect -> should select
		for (let index = 0; index < boxPoints.length; index++) {
			const p1 = boxPoints[index];
			const p2 = boxPoints[(index+1)%boxPoints.length];
			if (lineRectIntersection([[p1.x,p1.y],[p2.x,p2.y]],selectionRectangle)) {
				return true;
			}
		}

		// no intersection between the selection rect and the component
		return false;
	}
	
	showBoundingBox(){
		if (!this.#selectionRectangle) {
			let box = this.symbolUse.bbox();
			this.#selectionRectangle = this.container.rect(box.w,box.h).move(box.x,box.y)
									   .transform({ rotate: -this.#rotationAngle, ox: this.#midAbs.x, oy: this.#midAbs.y });
			this.#selectionRectangle.attr({
				"stroke-width": selectedBoxWidth,
				"stroke": "grey",
				"fill": "none"
			});
			this.#preLine.attr({
				"stroke-width": selectedWireWidth,
			});
			this.#postLine.attr({
				"stroke-width": selectedWireWidth,
			});
		}
	}

	hideBoundingBox(){
		this.#selectionRectangle?.remove();
		this.#selectionRectangle = null
		this.#preLine.attr({
			"stroke-width": "0.4pt",
		});
		this.#postLine.attr({
			"stroke-width": "0.4pt",
		});
	}

	/**
	 * Create a instance from the (saved) serialized text.
	 *
	 * @param {object} serialized - the saved instance
	 * @returns {PathComponentInstance} the deserialized instance
	 */
	static fromJson(serialized) {
		// todo: implement
	}

	/**
	 * Serialize the component in an object
	 *
	 * @returns {object} the serialized instance
	 */
	toJson() {
		
	}

	/**
	 * Stringifies the component in TikZ syntax.
	 * @returns {string}
	 */
	toTikzString() {
		//TODO properly calculate flip
		return (
			"\\draw " +
			this.snappingPoints[0].toTikzString() +
			" to[" +
			this.symbol.tikzName +
			(this.#mirror?", mirror":"") +
			"] " +
			this.snappingPoints[1].toTikzString() +
			";"
		);
	}

	/**
	 * Removes the instance. Frees the snapping points and removes the node from its container.
	 *
	 * @returns {this}
	 */
	remove() {
		for (const point of this.snappingPoints) point.removeInstance();
		this.hideBoundingBox();
		super.remove();
		return this;
	}

	/**
	 * Listener for the first and second click/touch. Used for initial adding of the component.
	 * @param {MouseEvent|TouchEvent} event
	 */
	#clickListener(event) {
		if (!this) {
			// the component has already been deleted
			return;
		}
		const isTouchEvent = window.TouchEvent && event instanceof TouchEvent && event.changedTouches.length === 1;
		const isTouchEnd = isTouchEvent && event.touches.length === 0;
		const isTouchStart =
		isTouchEvent &&
		event.touches.length === 1 &&
		event.touches[0].identifier === event.changedTouches[0].identifier;
		if (isTouchEvent && !isTouchStart && !isTouchEnd) return; // invalid; maybe more then one finger on screen
		
		const snappedPoint = CanvasController.controller.pointerEventToPoint(event);
		
		if (this.#pointsSet===0 && (!isTouchEvent || isTouchStart)) {
			// first click / touch
			this.firstClick(snappedPoint);
		} else if ((!isTouchEvent || isTouchEnd)) {
			// second click / touch
			event.preventDefault();
			this.secondClick(snappedPoint);
		}
	}

	cancelPlacement(/**@type {KeyboardEvent} */event){
		if (this.#pointsSet<2 && event.key=="Escape") {
			let point = new SVG.Point();
			if (this.#pointsSet===0) {
				this.firstClick(point);
			}
			this.secondClick(point);
			MainController.controller.removeInstance(this)
		}
	}
	
	firstClick(snappedPoint){
		if (this.#pointsSet===0) {
			this.#prePointArray[0][0] = snappedPoint.x;
			this.#prePointArray[0][1] = snappedPoint.y;
			this.#pointsSet = 1;
			this.show();
			SnapCursorController.controller.visible = false;
		}
	}
	
	secondClick(snappedPoint, runCB = true){
		// second click / touch
		if (this.#pointsSet>0) {
			this.container.off(["click", "touchstart", "touchend"], this.#clickListener);
			this.container.off(["mousemove", "touchmove"], this.#moveListener);
			document.removeEventListener("keydown", this.cancelPlacement)
			this.container.node.classList.remove("selectPoint");
			this.#pointsSet = 2;
			CanvasController.controller.placingComponent=null;
			const angle = this.#recalcPointsEnd(snappedPoint);
			
			for (const sp of this.snappingPoints) sp.recalculate(null, angle, new SVG.Point(1,this.#mirror?-1:1));
			
			CanvasController.controller.activatePanning();
			SnapController.controller.hideSnapPoints();
			if (runCB) {
				this.#finishedPlacingCallback()
			}
		}
	}

	getPointsSet(){
		return this.#pointsSet;
	}

	getStartPoint(){
		return new SVG.Point(this.#prePointArray[0][0],this.#prePointArray[0][1]);
	}

	getEndPoint(){
		return new SVG.Point(this.#postPointArray[1][0],this.#postPointArray[1][1]);
	}

	/**
	 * Redraw the component on mouse move. Used for initial adding of the component.
	 * @param {MouseEvent|TouchEvent} event
	 */
	#moveListener(event) {
		const snappedPoint = CanvasController.controller.pointerEventToPoint(event);
		this.moveTo(snappedPoint)
	}

	/**
	 * Moves the component delta units.
	 *
	 * @param {SVG.Point} delta - the relative movement
	 * @returns {ComponentInstance}
	 */
	moveRel(delta){
		this.moveTo(this.#midAbs.plus(delta))
	}

	/**
	 * Moves the component by its anchor point to the new point.
	 *
	 * @param {SVG.Point} position - the new anchor position
	 * @returns {PathComponentInstance}
	 */
	moveTo(position){
		if (this.#pointsSet === 0 && PathComponentInstance.#hasMouse) {
			SnapCursorController.controller.moveTo(position);
		} else if (this.#pointsSet === 1) {
			this.#recalcPointsEnd(position);
		} else{
			let diff = position.minus(this.getAnchorPoint())
			let startPoint = diff.plus(this.getStartPoint())
			let endPoint = diff.plus(this.getEndPoint())
			this.#prePointArray[0][0] = startPoint.x
			this.#prePointArray[0][1] = startPoint.y
			let angle = this.#recalcPointsEnd(endPoint)
			if (this.#selectionRectangle) {
				this.hideBoundingBox()
				this.showBoundingBox()
			}
			for (const sp of this.snappingPoints) sp.recalculate(null, angle, new SVG.Point(1,this.#mirror?-1:1));
		}
	}

	getAnchorPoint(){
		return this.#midAbs
	}

	rotate(angleDeg){
		// rotate start point around midabs
		let startPoint = this.getStartPoint().rotate(angleDeg,this.getAnchorPoint())
		this.#prePointArray[0][0] = startPoint.x
		this.#prePointArray[0][1] = startPoint.y

		// rotate end point around midabs
		let endPoint = this.getEndPoint().rotate(angleDeg,this.getAnchorPoint())

		// recalculate other points
		const angle = this.#recalcPointsEnd(endPoint);
		for (const sp of this.snappingPoints) sp.recalculate(null, angle, new SVG.Point(1,this.#mirror?-1:1));

		// recalculate bounding box
		if (this.#selectionRectangle){
			// only if it was shown before
			this.hideBoundingBox()
			this.showBoundingBox()
		}
	}

	flip(horizontal){
		// TODO change tikz code generation
		let direction = horizontal?1:0

		// every flip makes the mirroring change state
		this.#mirror ^= true
		
		let start = this.getStartPoint()
		let end = this.getEndPoint()
		let diffstart = this.#midAbs.minus(start)
		let diffend = this.#midAbs.minus(end)
		this.#prePointArray[0][direction] += 2*(horizontal?diffstart.y:diffstart.x)
		this.#postPointArray[1][direction] += 2*(horizontal?diffend.y:diffend.x)

		const angle = this.#recalcPointsEnd(new SVG.Point(this.#postPointArray[1][0],this.#postPointArray[1][1]))
		for (const sp of this.snappingPoints) sp.recalculate(null, angle, new SVG.Point(1,this.#mirror?-1:1));
	}

	/**
	 * Recalculates the points after an movement
	 * @param {SVG.Point} endPoint
	 * @returns {number} the angle in radians
	 */
	#recalcPointsEnd(endPoint) {
		this.#postPointArray[1][0] = endPoint.x;
		this.#postPointArray[1][1] = endPoint.y;

		this.#midAbs.x = (this.#prePointArray[0][0] + endPoint.x) / 2;
		this.#midAbs.y = (this.#prePointArray[0][1] + endPoint.y) / 2;

		const tl = this.#midAbs.minus(this.symbol.relMid);
		const angle = Math.atan2(this.#prePointArray[0][1] - endPoint.y, endPoint.x - this.#prePointArray[0][0]);
		this.#rotationAngle = (angle * 180) / Math.PI;

		this.symbolUse.move(tl.x, tl.y);
		// clockwise rotation \__(°o°)__/
		this.symbolUse.transform({
			rotate: -this.#rotationAngle, 
			ox: this.#midAbs.x, 
			oy: this.#midAbs.y,
			scaleY: this.#mirror?-1:1
		});

		// recalc pins
		this.#prePointArray[1] = this.symbol.startPin.point.rotate(angle, undefined, true).plus(this.#midAbs).toArray();
		this.#postPointArray[0] = this.symbol.endPin.point.rotate(angle, undefined, true).plus(this.#midAbs).toArray();

		// update/draw lines
		this.#preLine.plot(this.#prePointArray);
		this.#postLine.plot(this.#postPointArray);

		return angle;
	}
}
