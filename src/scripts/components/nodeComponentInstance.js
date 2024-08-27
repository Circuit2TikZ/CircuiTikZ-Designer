/**
 * @module nodeComponentInstance
 */

import * as SVG from "@svgdotjs/svg.js";
import { rectRectIntersection, selectionColor, selectedBoxWidth } from "../utils/selectionHelper";

import { NodeComponentSymbol,SnapPoint,NodeDragHandler,ContextMenu,MainController,CanvasController } from "../internal";
import hotkeys from "hotkeys-js";

/**
 * Instance of a `NodeComponentsSymbol`.
 * @implements {import("./componentInstance").ComponentInstance}
 */
export class NodeComponentInstance extends SVG.Use {
	/** @type {?ContextMenu} */
	static #contextMenu = null;

	/** @type {NodeComponentSymbol} */
	symbol;

	/** @type {NodeDragHandler} */
	#snapDragHandler;

	/** @type {SVG.Container} */
	container;

	/** @type {number} */
	#angleDeg = 0;
	/** @type {SVG.Point} */
	#midAbs = new SVG.Point();
	/** @type {SVG.Point} */
	#flip = new SVG.Point(1,1);
	/** @type {SVG.Box} */
	boundingBox = new SVG.Box();
	/** @type {SVG.Point} */
	relMid = new SVG.Point();
	/** @type {SnapPoint[]} */
	snappingPoints;
	/** @type {SVG.Point[]} */
	relSnappingPoints;

	/** the rectangle which is shown when the component is selected
	 * @type {?SVG.Rect}
	 */
	#selectionRectangle = null;

	/**
	 * @type {function():void}
	 */
	#finishedPlacingCallback  = ()=>{};

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
	 * @param {MouseEvent|TouchEvent} [event] - the event which triggered the adding
 	 * @param {function():void} finishedPlacingCallback callback getting called when the element has been placed
	 */
	constructor(symbol, container, event, finishedPlacingCallback) {
		super();
		this.#finishedPlacingCallback = finishedPlacingCallback;

		this.symbol = symbol;
		this.container = container;
		this.point = container.point;
		this.use(this.symbol);
		this.container.add(this);

		this.#recalculateRelSnappingPoints();
		this.#updateTransform()

		this.node.classList.add("draggable");
		this.#snapDragHandler = NodeDragHandler.snapDrag(this, true);

		if (event) {
			//  && event.type.includes("mouse")
			// 1st: move symbol to curser pos
			let clientPoint = event instanceof MouseEvent ? event : event?.touches[0] || { clientX: 0, clientY: 0 };
			let pt = new SVG.Point(clientPoint.clientX, clientPoint.clientY);
			pt = pt.transform(this.screenCTM().inverseO());
			this.moveTo(pt);

			// 2nd: start dragging
			/** @type {DragHandler} */
			let dh = this.remember("_draggable");

			dh.startDrag(event);

			// Prevent immediate dragend --> 10ms delay before recognizing dragend
			const endEventName = event.type.includes("mouse") ? "mouseup" : "touchend";
			const endEventNameScoped = endEventName + ".drag";

			const dragEndFunction = (/** @type {MouseEvent} */evt)=>{
				dh.endDrag(evt);
				CanvasController.controller.placingComponent=null;
				this.#finishedPlacingCallback();
				hotkeys.unbind("esc",dragCancelFunction)				
			}

			const dragCancelFunction = (/** @type {KeyboardEvent} */evt)=>{
				dragEndFunction(evt)
				MainController.controller.removeInstance(this);	
			}

			hotkeys("esc",dragCancelFunction)

			SVG.off(window, endEventNameScoped);
			SVG.on(window, endEventNameScoped, dragEndFunction, dh, { passive: false });
		}

		this.snappingPoints = this.symbol._pins.map(
			(pin) => new SnapPoint(this, pin.name, this.#midAbs, pin, this.#angleDeg, true)
		);

		// init context menus
		// if (!NodeComponentInstance.#contextMenu) {
		// 	NodeComponentInstance.#contextMenu = new ContextMenu([
		// 		{
		// 			result: "rotateLeft",
		// 			text: "Rotate counterclockwise",
		// 			iconText: "rotate_left",
		// 		},
		// 		{
		// 			result: "rotateRight",
		// 			text: "Rotate clockwise",
		// 			iconText: "rotate_right",
		// 		},
		// 		{
		// 			result: "remove",
		// 			text: "Remove",
		// 			iconText: "delete",
		// 		},
		// 	]);
		// }

		// this.on(
		// 	"contextmenu",
		// 	(/** @type {PointerEvent} */ evt) => {
		// 		evt.preventDefault();
		// 		let result = NodeComponentInstance.#contextMenu.openForResult(evt.clientX, evt.clientY);
		// 		result
		// 			.then((res) => {
		// 				switch (res) {
		// 					case "rotateLeft":
		// 						this.rotate(90);
		// 						return;
		// 					case "rotateRight":
		// 						this.rotate(-90);
		// 						return;
		// 					case "remove":
		// 						MainController.controller.removeInstance(this);
		// 						break;
		// 					default:
		// 						console.log("Not implemented: " + res);
		// 				}
		// 			})
		// 			.catch(() => {}); // closed without clicking on item
		// 			evt.stopPropagation();
		// 	},
		// 	this
		// );
		this.updateTheme()
	}

	updateTheme(){
		let theme = MainController.controller.darkMode
		
	}

	isInsideSelectionRectangle(selectionRectangle){
		return rectRectIntersection(selectionRectangle,this.bbox());
	}

	showBoundingBox(){
		if (!this.#selectionRectangle) {
			let box = this.bbox();
			this.#selectionRectangle = this.container.rect(box.w,box.h).move(box.x,box.y)
			this.#selectionRectangle.attr({
				"stroke-width":selectedBoxWidth,
				"stroke":selectionColor,
				"stroke-dasharray":"3,3",
				"fill":"none"
			});
			this.stroke("#f00")
		}
	}

	hideBoundingBox(){
		this.#selectionRectangle?.remove();
		this.stroke("#000")
		this.#selectionRectangle = null
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
	 * @param {function():void} finishedPlacingCallback callback getting called when the element has been placed
	 */
	static createInstance(symbol, container, event, finishedPlacingCallback) {
		return new NodeComponentInstance(symbol, container, event, finishedPlacingCallback);
	}

	/**
	 * Create an instance from the (saved) serialized text.
	 *
	 * @param {object} serialized - the saved instance
	 * @returns {NodeComponentInstance} the deserialized instance
	 */
	static fromJson(serialized) {
		let symbol = MainController.controller.symbols.find((value,index,symbols)=>value.node.id==serialized.id)
		/**@type {NodeComponentInstance} */
		let nodeComponent = symbol.addInstanceToContainer(CanvasController.controller.canvas,null,()=>{})
		nodeComponent.moveTo(new SVG.Point(serialized.position))
		nodeComponent.#angleDeg = serialized.rotation
		nodeComponent.#flip= new SVG.Point(serialized.flip)
		nodeComponent.nodeName = serialized.nodeName
		nodeComponent.#updateTransform()
		nodeComponent.#recalculateRelSnappingPoints()
		nodeComponent.recalculateSnappingPoints()

		MainController.controller.addInstance(nodeComponent);
		return nodeComponent;
	}

	/**
	 * Serializes the instance for saving
	 *
	 * @returns {object} the serialized instance
	 */
	toJson() {
		//TODO add additional options!?
		//necessary information: symbol_id,name,position,rotation,flip
		let data = {
			id:this.symbol.node.id,
			name:this.nodeName,
			position:this.getAnchorPoint().clone(),
			rotation:this.#angleDeg,
			flip:this.#flip.clone()
		}

		return data
	}

	/**
	 * Stringifies the component in TikZ syntax.
	 *
	 * @returns {string}
	 */
	toTikzString() {
		//don't change the order of flip and angleDeg!!! otherwise tikz render and UI are not the same
		const optionsString = this.symbol.serializeTikzOptions();
		return (
			"\\node[" +
			this.symbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(this.#angleDeg !== 0 ? `, rotate=${this.#angleDeg}` : "") +
			(this.#flip.x < 0 ? `, xscale=-1` : "") +
			(this.#flip.y < 0 ? `, yscale=-1` : "") +
			"] " +
			(this.nodeName ? "(" + this.nodeName + ") " : "") +
			"at " +
			this.#midAbs.toTikzString() +
			" {};"
		);
	}
	
	/**
	 * Moves the component delta units.
	 *
	 * @param {SVG.Point} delta - the relative movement
	 * @returns {ComponentInstance}
	 */
	moveRel(delta){
		return this.moveTo(this.#midAbs.plus(delta))
	}

	/**
	 * Moves the component by its anchor point to the new point.
	 *
	 * @param {SVG.Point} position - the new anchor position
	 * @returns {NodeComponentInstance}
	 */
	moveTo(pos){
		return this.move(pos.x,pos.y)
	}

	move(x, y) {
		// don't call recalculateSnappingPoints here; #dragEnd does call this method instead
		this.#midAbs.x = x;
		this.#midAbs.y = y;
		this.#updateTransform()
		super.move(x - this.symbol.relMid.x, y - this.symbol.relMid.y);

		return this;
	}

	getAnchorPoint(){
		return this.#midAbs
	}

	#recalculateSelectionRect(){
		if (this.#selectionRectangle) {
			let box = this.bbox();
			this.#selectionRectangle.move(box.x,box.y);
			this.#selectionRectangle.attr("width",box.w);
			this.#selectionRectangle.attr("height",box.h);
		}
	}

	/**
	 * Rotate the instance counter clockwise around its {@link #midAbs} point.
	 *
	 * @param {number} angleDeg - the angle to add to the current rotation (initially 0)
	 */
	rotate(angleDeg) {
		this.#angleDeg += angleDeg;
		this.#simplifyAngleDeg()
		
		this.#updateTransform()

		this.#recalculateRelSnappingPoints();
		this.recalculateSnappingPoints()
	}

	/**
	 * calculate the current transformation matrix for this component incorporating rotation and flipping
	 * @returns {SVG.Matrix}
	 */
	#getTransformMatrix(){
		return new SVG.Matrix({
			rotate:-this.#angleDeg,
			origin:[this.#midAbs.x,this.#midAbs.y],
			scaleX:this.#flip.x,
			scaleY:this.#flip.y
		})
	}

	#updateTransform(){
		// if flip has different x and y signs and 180 degrees turn, simplify to flip only
		if (this.#angleDeg==180&&this.#flip.x*this.#flip.y<0) {
			this.#flip.x*=-1;
			this.#flip.y*=-1;
			this.#angleDeg=0;
		}

		// transformation matrix incorporating rotation and flipping
		let m = this.#getTransformMatrix()
		this.transform(m)
		
		// default bounding box
		this.boundingBox = new SVG.Box(
			this.#midAbs.x - this.symbol.relMid.x,
			this.#midAbs.y - this.symbol.relMid.y,
			this.symbol.viewBox.width,
			this.symbol.viewBox.height
		);
		// transform to proper location
		this.boundingBox = this.boundingBox.transform(m)

		// set relMid for external use
		this.relMid = this.#midAbs.minus(new SVG.Point(this.boundingBox.x,this.boundingBox.y))

		this.#recalculateSelectionRect();
	}

	#simplifyAngleDeg(){
		while (this.#angleDeg > 180) this.#angleDeg -= 360;
		while (this.#angleDeg <= -180) this.#angleDeg += 360;
	}
	
	/**
	 * Flip the component horizontally or vertically
	*
	* @param {boolean} horizontal along which axis to flip
	* @returns {ComponentInstance}
	*/
	flip(horizontal){
		if (this.#angleDeg%180==0) {
			if (horizontal) {
				this.#flip.y*=-1;
			}else{
				this.#flip.x*=-1;
			}
		}else{
			if (horizontal) {
				this.#flip.x*=-1;
			}else{
				this.#flip.y*=-1;
			}
		}

		// double flipping equals rotation by 180 deg
		if (this.#flip.x<0&&this.#flip.y<0) {
			this.#flip = new SVG.Point(1,1);
			this.#angleDeg+=180;
			this.#simplifyAngleDeg()
		}		
		
		this.#updateTransform()

		this.#recalculateRelSnappingPoints()
		this.recalculateSnappingPoints()
	}

	/**
	 * Recalculate the snapping points, which are used to snap this symbol to the grid.
	 */
	#recalculateRelSnappingPoints() {
		let m = new SVG.Matrix({
			rotate:-this.#angleDeg,
			scaleX:this.#flip.x,
			scaleY:this.#flip.y
		})
		this.relSnappingPoints = this.symbol._pins.concat(this.symbol._additionalAnchors).map((anchor) => anchor.point.transform(m));
	}

	/**
	 * Recalculate the snapping points, which are used by other symbols.
	 */
	recalculateSnappingPoints() {
		for (const snapPoint of this.snappingPoints) snapPoint.recalculate(null, this.#angleDeg, this.#flip);
	}

	/**
	 * Removes the instance. Frees the snapping points and removes the node from its container.
	 *
	 * @returns {this}
	 */
	remove() {
		this.#snapDragHandler = NodeDragHandler.snapDrag(this, false);
		for (const point of this.snappingPoints) point.removeInstance();
		this.hideBoundingBox();
		super.remove();
		return this;
	}

	/**
	 * Get the bounding box. Uses the viewBox, if set. The Svg.js and DOM functions return nonsense on rotated elements.
	 *
	 * @returns {SVG.Box}
	 */
	bbox() {
		return this.boundingBox;
	}
}
