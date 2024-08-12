/**
 * @module selectionController
 */

import * as SVG from "@svgdotjs/svg.js";
import Line from "../lines/line";
import NodeComponentInstance from "../components/nodeComponentInstance";

/** @typedef {import("../controllers/canvasController").default} CanvasController */

/**
 * Controller holding selection information and handling selecting/deselecting
 * @class
 */
export default class SelectionController {
	/**
	 * Static variable holding the instance.
	 * @type {SelectionController}
	 */
	static controller;

	/**
	 * canvasController reference
	 * @type {CanvasController}
	 */
	canvasController;


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


	constructor(mainController) {
		this.canvasController = mainController.canvasController;
		this.#instances = mainController.instances;
		this.#lines = mainController.lines;
		this.#selectionStartPosition = new SVG.Point()
		this.#selectionRectangle = this.canvasController.canvas.rect(0,0).move(0,0);
		this.#selectionRectangle.attr("stroke-width",1)
		this.#selectionRectangle.attr("stroke","grey")
		this.#selectionRectangle.attr("fill","none")
		this.#selectionEnabled = true
		this.currentlySelectedComponents = []
		this.currentlySelectedLines = []
		this.#currentlyDragging = false
		this.#selectionMode = SelectionController.SelectionMode.RESET
		
		this.canvasController.canvas.on("mousedown",(/**@type {MouseEvent}*/evt)=>{
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
						this.#selectionMode = SelectionController.SelectionMode.RESET
					}else{
						this.#selectionMode = SelectionController.SelectionMode.ADD;
					}
				}else{
					if (ctrl) {
						this.#selectionMode = SelectionController.SelectionMode.SUB;
					}else{
						this.#selectionMode = SelectionController.SelectionMode.RESET
					}
				}
				
				this.#currentlyDragging=true;
				this.#selectionStartPosition = this.canvasController.pointerEventToPoint(evt, false);

				this.#selectionRectangle.move(this.#selectionStartPosition.x,this.#selectionStartPosition.y);
			}
		})
		this.canvasController.canvas.on("mousemove",(/**@type {MouseEvent}*/evt)=>{
			if (this.#currentlyDragging) {
				let pt = this.canvasController.pointerEventToPoint(evt, false);
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
		this.canvasController.canvas.on("mouseup",(/**@type {MouseEvent}*/evt)=>{
			if (evt.button===0) {
				if (this.#currentlyDragging) {
					this.#updateSelection();
					this.#currentlyDragging=false;
					this.#selectionRectangle.attr("width",0);
					this.#selectionRectangle.attr("height",0);
				}

				let pt = this.canvasController.pointerEventToPoint(evt, false);
				if (pt.x==this.#selectionStartPosition.x&&pt.y==this.#selectionStartPosition.y) {
					// clicked on canvas
					this.deactivateSelection();
					this.activateSelection();
				}
			}
		})
		SelectionController.controller = this;
	}

	#showSelection(){
		let selectionBox = this.#selectionRectangle.bbox();
		for (const instance of this.#instances) {
			let cond=false;
			if (this.#selectionMode==SelectionController.SelectionMode.RESET) {
				cond = instance.isInsideSelectionRectangle(selectionBox)
			}else if (this.#selectionMode==SelectionController.SelectionMode.ADD) {
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
			if (this.#selectionMode==SelectionController.SelectionMode.RESET) {
				cond = line.isInsideSelectionRectangle(selectionBox)
			}else if (this.#selectionMode==SelectionController.SelectionMode.ADD) {
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
			if (this.#selectionMode==SelectionController.SelectionMode.RESET) {
				if (instance.isInsideSelectionRectangle(selectionBox)) {
					if (!this.currentlySelectedComponents.includes(instance)) {
						this.currentlySelectedComponents.push(instance)
					}
				}else{
					let idx = this.currentlySelectedComponents.indexOf(instance)
					if (idx>-1) {
						this.currentlySelectedComponents.splice(idx,1)
					}
				}
			}else if(this.#selectionMode==SelectionController.SelectionMode.ADD){
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
			if (this.#selectionMode==SelectionController.SelectionMode.RESET) {
				if (line.isInsideSelectionRectangle(selectionBox)) {
					if (!this.currentlySelectedLines.includes(line)) {
						this.currentlySelectedLines.push(line)
					}
				}else{
					let idx = this.currentlySelectedLines.indexOf(line)
					if (idx>-1) {
						this.currentlySelectedLines.splice(idx,1)
					}
				}
			}else if (this.#selectionMode==SelectionController.SelectionMode.ADD) {
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

	activateSelection(){
		this.#selectionEnabled = true;
	}

	deactivateSelection(){
		this.#selectionEnabled = false;
		this.#selectionRectangle.attr("width",0);
		this.#selectionRectangle.attr("height",0);
		this.#selectionMode = SelectionController.SelectionMode.RESET;
		this.currentlySelectedLines = []
		this.currentlySelectedComponents = []
		this.#showSelection();
		this.#updateSelection();
	}

	/**
	 * 
	 * @returns {SVG.Box}
	 */
	#getOverallBoundingBox(){
		let bbox = null
		for (const line of this.currentlySelectedLines) {
			if (bbox==null) {
				bbox = line.bbox()
			}else{
				bbox = bbox.merge(line.bbox())
			}
		}

		for (const component of this.currentlySelectedComponents) {
			if (bbox==null) {
				bbox = component.bbox()
			}else{
				bbox = bbox.merge(component.bbox())
			}
		}
		return bbox
	}

	/**
	 * 
	 * @param {Number} angleDeg rotation in degrees (only 90 degree multiples, also negative)
	 */
	rotateSelection(angleDeg){
		//get overall center
		if (!this.hasSelection()) {
			return
		}
		
		let overallBBox = this.#getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)
		
		//rotate all components/lines individually around their center
		//get individual center and rotate that around overall center
		//move individual components/lines to new rotated center
		for (const line of this.currentlySelectedLines) {
			let center = new SVG.Point(line.bbox().cx,line.bbox().cy)
			line.rotate(angleDeg);
			let move = center.rotate(angleDeg,overallCenter,false).minus(center)
			line.move(new SVG.Point(move.x,move.y))
		}

		for (const component of this.currentlySelectedComponents) {
			let center = component.getAnchorPoint()
			component.rotate(angleDeg);
			let move = center.rotate(angleDeg,overallCenter,false)
			component.move(move.x,move.y)
			if (component instanceof NodeComponentInstance) {
				component.recalculateSnappingPoints();
			}
		}
	}

	/**
	 * 
	 * @param {boolean} horizontal if flipping horizontally or vertically
	 */
	flipSelection(horizontal){
		// TODO
		//get overall center
		if (!this.hasSelection()) {
			return
		}
		
		let overallBBox = this.#getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)

		//flip all components/lines individually at their center
		//get individual center and flip that at overall center
		//move individual components/lines to new flipped center
	}

	/**
	 * 
	 * @param {Number} x distance in x direction
	 * @param {Number} y distance in y direction
	 */
	moveSelection(x,y){
		// TODO
		//get individual centers 
		//move all components/lines by x,y
	}

	/**
	 * checks if anything is selected
	 * @returns true or false
	 */
	hasSelection(){
		return this.currentlySelectedComponents.length>0 || this.currentlySelectedLines.length>0
	}
}