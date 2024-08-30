/**
 * @module pathComponentInstance
 */

import * as SVG from "@svgdotjs/svg.js";

import { CanvasController,PathComponentSymbol,SnapController,SnapCursorController,SnapPoint,MainController, Undo, PathDragHandler, NodeDragHandler } from "../internal";
import { lineRectIntersection, pointInsideRect, selectedBoxWidth, selectionColor } from "../utils/selectionHelper";

const invalidNameRegEx = /[\t\r\n\v.,:;()-]/;
/**
 * Instance of a `PathComponentSymbol`.
 * @implements {import("./componentInstance").ComponentInstance}
 */
export class PathComponentInstance extends SVG.G {
	/** @type {PathComponentSymbol} */
	symbol;
	/** @type {SVG.Use} */
	symbolUse;

	/** @type {string} */
	tikzName = ""

	/** @type {string} */
	#label = ""
	/** @type {SVG.Element} */
	#labelSVG

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
	/** @type {SVG.Point} */
	relMid;
	/** @type {number} */
	#rotationAngle;
	/** @type {SnapPoint[]} */
	snappingPoints;
	/** @type {SVG.Point[]} */
	relSnappingPoints = [];

	/**@type {boolean} */
	#mirror = false;
	/**@type {boolean} */
	#invert = false;

	/**
	 * @type {?SVG.Rect}
	 */
	#selectionRectangle = null;

	/** @type {NodeDragHandler} */
	#snapDragHandler;

	circleRadius = 20
	startCircle;
	endCircle;

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
			stroke: MainController.controller.darkMode?"#fff":"#000",
			"stroke-width": "0.4pt",
		});
		this.#postLine = this.line(this.#postPointArray);
		this.#postLine.attr({
			fill: "none",
			stroke: MainController.controller.darkMode?"#fff":"#000",
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

		this.symbolUse.node.classList.add("draggable");
		this.#snapDragHandler = NodeDragHandler.snapDrag(this, true);
		
		this.startCircle = this.circle(this.circleRadius).fill("transparent").id("start")
		this.startCircle.draggable(true)
		this.startCircle.node.classList.add("draggable","pathPoint")
		this.add(this.startCircle)
		
		this.endCircle = this.circle(this.circleRadius).fill("transparent").id("start")
		this.endCircle.draggable(true)
		this.endCircle.node.classList.add("draggable","pathPoint")
		this.add(this.endCircle)

		PathDragHandler.snapDrag(this, true, true);
		PathDragHandler.snapDrag(this, false, true);

	}

	updateTheme(){
		if (!this.#selectionRectangle) {
			this.#preLine.stroke(MainController.controller.darkMode?"#fff":"#000")
			this.#postLine.stroke(MainController.controller.darkMode?"#fff":"#000")
		}
	}

	/**
	 * @returns {FormEntry[]}
	 */
	getFormEntries(){
		let formEntries = []

		let nameCallback = (/** @type {string}*/name)=>{
			if (name==="") {
				this.tikzName = name
				return ""
			}

			if (name.match(invalidNameRegEx)) {
				return "Contains forbidden characters!"
			}
			
			for (const instance of MainController.controller.instances) {
				if (instance!=this) {
					if (instance.tikzName==name) {
						return "Name is already taken!"
					}
				}
			}
			this.tikzName = name
			return "";
		}

		let nameEntry = {
			originalObject:this,
			propertyName:"Name",
			inputType:"string",
			currentValue:this.tikzName,
			changeCallback:nameCallback
		}

		let mirrorEntry = {
			originalObject:this,
			propertyName:"Mirror",
			inputType:"boolean",
			currentValue:this.#mirror,
			changeCallback:(mirror)=>{
				this.#mirror = mirror
				this.#recalcPointsEnd(this.getEndPoint())
			}
		}

		let invertEntry = {
			originalObject:this,
			propertyName:"Invert",
			inputType:"boolean",
			currentValue:this.#invert,
			changeCallback:(invert)=>{
				this.#invert = invert
				this.#recalcPointsEnd(this.getEndPoint())
			}
		}

		let labelEntry = {
			originalObject:this,
			propertyName:"Label",
			inputType:"mathJax",
			currentValue:this.#label,
			changeCallback:(label,button)=>{
				this.#label = label
				button.disabled = true;

				if (this.#labelSVG) {
					this.#labelSVG.remove()
				}

				if (label!=="") {
					
					MathJax.texReset();
					MathJax.tex2svgPromise(label).then((/**@type {Element} */ node) =>{
						/**@type {Element} */
						let svgElement = node.querySelector("svg")
						padding_ex = 0.4
						svgElement.setAttribute("style","vertical-align: top;padding: "+padding_ex+"ex;")

						let width = svgElement.getAttribute("width")
						width = Number.parseFloat(width.split(0,width.length-2))+padding_ex*2
						let height = svgElement.getAttribute("height")
						height = Number.parseFloat(height.split(0,height.length-2))+padding_ex*2

						width = width + "ex"
						height = height + "ex"
						svgElement.setAttribute("width",width)
						svgElement.setAttribute("height",height)
						
						this.#labelSVG = new SVG.ForeignObject()
						this.#labelSVG.width(width)
						this.#labelSVG.height(height)
						this.#labelSVG.add(svgElement)
						this.container.add(this.#labelSVG)
						this.#updateLabelPos()

					}).catch(function (err) {
						console.log(err);
										
						this.appendChild(document.createElement('pre')).appendChild(document.createTextNode(err.message));
					}).then(function () {
						button.disabled = false;
					});
				}
			}
		}

		formEntries.push(nameEntry)
		formEntries.push(labelEntry)
		formEntries.push(mirrorEntry)
		formEntries.push(invertEntry)
		return formEntries
	}

	#updateLabelPos(){
		//TODO transform to correct position and rotation (break point is 70 deg for parallel with x axis or parallel with path)
		// mirror on invert don't affect the side of the label
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
									   .transform({ 
													rotate: -this.#rotationAngle, 
													ox: this.#midAbs.x, 
													oy: this.#midAbs.y, 
													scaleY: this.#mirror?-1:1, 
													scaleX: this.#invert?-1:1 });
			this.#selectionRectangle.attr({
				"stroke-width": selectedBoxWidth,
				"stroke": selectionColor,
				"stroke-dasharray":"3,3",
				"fill": "none"
			});
			this.#preLine.attr({
				"stroke":selectionColor,
			});
			this.#postLine.attr({
				"stroke":selectionColor,
			});
		}
	}

	hideBoundingBox(){
		this.#selectionRectangle?.remove();
		this.#selectionRectangle = null
		this.#preLine.attr({
			"stroke":MainController.controller.darkMode?"#fff":"#000",
		});
		this.#postLine.attr({
			"stroke":MainController.controller.darkMode?"#fff":"#000",
		});
	}

	/**
	 * Create a instance from the (saved) serialized text.
	 *
	 * @param {object} serialized - the saved instance
	 * @returns {PathComponentInstance} the deserialized instance
	 */
	static fromJson(serialized) {
		let symbol = MainController.controller.symbols.find((value,index,symbols)=>value.node.id==serialized.id)
		/**@type {PathComponentInstance} */
		let pathComponent = symbol.addInstanceToContainer(CanvasController.controller.canvas,null,()=>{})
		pathComponent.firstClick(new SVG.Point(serialized.start))
		pathComponent.#mirror = serialized.mirror
		pathComponent.#invert = serialized.invert
		pathComponent.secondClick(new SVG.Point(serialized.end),false)
		pathComponent.tikzName = serialized.tikzName

		MainController.controller.addInstance(pathComponent);
		return pathComponent
	}

	/**
	 * Serialize the component in an object
	 *
	 * @returns {object} the serialized instance
	 */
	toJson() {
		//TODO add additional options!?
		let data = {
			id:this.symbol.node.id,
			tikzName:this.tikzName,
			start:{x:this.#prePointArray[0][0],y:this.#prePointArray[0][1]},
			end:{x:this.#postPointArray[1][0],y:this.#postPointArray[1][1]},
			mirror:this.#mirror,
			invert:this.#invert
		}

		return data
	}

	/**
	 * Stringifies the component in TikZ syntax.
	 * @returns {string}
	 */
	toTikzString() {
		return (
			"\\draw " +
			this.snappingPoints[0].toTikzString() +
			" to[" +
			this.symbol.tikzName +
			(this.tikzName===""?"":", name="+this.tikzName) +
			(this.#mirror?", mirror":"") +
			(this.#invert?", invert":"") +
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
		NodeDragHandler.snapDrag(this,false)
		PathDragHandler.snapDrag(this,false)
		PathDragHandler.snapDrag(this,false)
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
			
			this.secondClick(point,false);
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
			this.#recalcPointsEnd(snappedPoint);
			
			CanvasController.controller.activatePanning();
			SnapController.controller.hideSnapPoints();

			if (runCB) {
				this.#finishedPlacingCallback()
				Undo.addState()
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
			this.#recalcPointsEnd(endPoint)
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
		this.#recalcPointsEnd(endPoint);
	}

	flip(horizontal){
		let direction = horizontal?1:0

		// every flip makes the mirroring change state
		this.#mirror ^= true
		
		let start = this.getStartPoint()
		let end = this.getEndPoint()
		let diffstart = this.#midAbs.minus(start)
		let diffend = this.#midAbs.minus(end)
		this.#prePointArray[0][direction] += 2*(horizontal?diffstart.y:diffstart.x)
		this.#postPointArray[1][direction] += 2*(horizontal?diffend.y:diffend.x)

		this.#recalcPointsEnd(new SVG.Point(this.#postPointArray[1][0],this.#postPointArray[1][1]))
	}

	/**
	 * 
	 * @param {SVG.Point} position 
	 */
	moveStartTo(position){
		this.#prePointArray[0][0] = position.x
		this.#prePointArray[0][1] = position.y

		this.#recalcPointsEnd(this.getEndPoint())
	}

	/**
	 * 
	 * @param {SVG.Point} position 
	 */
	moveEndTo(position){
		this.#recalcPointsEnd(position)
	}

	/**
	 * Recalculates the points after an movement
	 * @param {SVG.Point} endPoint
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
			scaleY: this.#mirror?-1:1,
			scaleX: this.#invert?-1:1
		});

		// recalc pins
		this.#prePointArray[1] = this.symbol.startPin.point.rotate(angle, undefined, true).plus(this.#midAbs).toArray();
		this.#postPointArray[0] = this.symbol.endPin.point.rotate(angle, undefined, true).plus(this.#midAbs).toArray();

		// update/draw lines
		this.#preLine.plot(this.#prePointArray);
		this.#postLine.plot(this.#postPointArray);

		// recalculate bounding box
		if (this.#selectionRectangle){
			// only if it was shown before
			this.hideBoundingBox()
			this.showBoundingBox()
		}

		this.startCircle.move(this.#prePointArray[0][0]-this.circleRadius/2,this.#prePointArray[0][1]-this.circleRadius/2)
		this.endCircle.move(this.#postPointArray[1][0]-this.circleRadius/2,this.#postPointArray[1][1]-this.circleRadius/2)

		let bbox = this.bbox()
		this.relMid = this.getAnchorPoint().minus(new SVG.Point(bbox.x,bbox.y))

		// recalculate snapping points
		let flipVector = new SVG.Point(1,this.#mirror?-1:1)
		let ref = this.getAnchorPoint()
		this.relSnappingPoints = []
		for (const sp of this.snappingPoints){
			sp.recalculate(null, angle, flipVector);
			this.relSnappingPoints.push(sp.minus(ref))
		}
	}
}
