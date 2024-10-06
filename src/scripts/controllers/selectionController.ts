/**
 * @module selectionController
 */

import * as SVG from "@svgdotjs/svg.js";
import { Line, NodeComponentInstance, ComponentInstance, MainController, PropertyController, CanvasController, CircuitComponent } from "../internal";

/** @typedef {import("../controllers/canvasController").default} CanvasController */

/**
 * Controller holding selection information and handling selecting/deselecting
 * @class
 */
export class SelectionController {
	private static _instance: SelectionController;

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
	private selectionMode: number
	private circuitComponents: CircuitComponent[] = [];
	private lines: Line[] = [];
	private selectionStartPosition: SVG.Point
	private selectionRectangle: SVG.Rect
	private currentlyDragging: boolean
	currentlySelectedComponents: CircuitComponent[]
	private selectionEnabled: boolean


	private constructor() {
		this.circuitComponents = MainController.instance.circuitComponents;
		this.selectionStartPosition = new SVG.Point()
		this.selectionRectangle = CanvasController.instance.canvas.rect(0,0).move(0,0);
		this.selectionRectangle.attr("stroke-width","0.5pt")
		this.selectionRectangle.attr("stroke","black")
		this.selectionRectangle.attr("fill","none")
		this.selectionRectangle.attr("id","selectionRectangle")
		this.selectionEnabled = true
		this.currentlySelectedComponents = []
		this.currentlyDragging = false
		this.selectionMode = SelectionController.SelectionMode.RESET

		//TODO selection only enables when state of program is drag pan
		
		CanvasController.instance.canvas.on("mousedown",(/**@type {MouseEvent}*/evt: MouseEvent)=>{
			if (evt.button===2&&this.currentlyDragging) {
				// currently dragging a selection rectangle but right mouse button clicked -> cancel selection rectangle
				this.currentlyDragging = false;
				this.selectionRectangle.attr("width",0);
				this.selectionRectangle.attr("height",0);
			}

			if (evt.button===0&&this.selectionEnabled) {
				let shift = evt.shiftKey||evt.detail.shiftKey
				let ctrl = evt.ctrlKey||(MainController.instance.isMac&&evt.metaKey)||evt.detail.ctrlKey||(MainController.instance.isMac&&evt.detail.metaKey)
				if (shift) {
					if (ctrl) {
						this.selectionMode = SelectionController.SelectionMode.RESET
					}else{
						this.selectionMode = SelectionController.SelectionMode.ADD;
					}
				}else{
					if (ctrl) {
						this.selectionMode = SelectionController.SelectionMode.SUB;
					}else{
						this.selectionMode = SelectionController.SelectionMode.RESET
					}
				}
				
				this.currentlyDragging=true;
				this.selectionStartPosition = CanvasController.eventToPoint(evt, false);

				this.selectionRectangle.move(this.selectionStartPosition.x,this.selectionStartPosition.y);
			}
		})
		CanvasController.instance.canvas.on("mousemove",(/**@type {MouseEvent}*/evt: MouseEvent)=>{
			if (this.currentlyDragging) {
				let pt = CanvasController.eventToPoint(evt, false);
				let dx = pt.x-this.selectionStartPosition.x;
				let dy = pt.y-this.selectionStartPosition.y;
				let moveX = this.selectionStartPosition.x;
				let moveY = this.selectionStartPosition.y;
				if (dx<0) {
					moveX += dx
					dx = -dx
				}
				if (dy<0) {
					moveY += dy
					dy = -dy
				}
				this.selectionRectangle.move(moveX,moveY)
				this.selectionRectangle.attr("width",dx);
				this.selectionRectangle.attr("height",dy);

				this.#showSelection();
			}

		})
		CanvasController.instance.canvas.on("mouseup",(/**@type {MouseEvent}*/evt: MouseEvent)=>{
			if (evt.button===0) {
				if (this.currentlyDragging) {
					this.#updateSelection();
					this.currentlyDragging=false;
					this.selectionRectangle.attr("width",0);
					this.selectionRectangle.attr("height",0);
				}

				let pt = CanvasController.eventToPoint(evt, false);
				if (pt.x==this.selectionStartPosition.x&&pt.y==this.selectionStartPosition.y) {
					// clicked on canvas
					this.deactivateSelection();
					this.activateSelection();
				}
				PropertyController.instance.update()
			}
		})
	}

	public static get instance(): SelectionController {
		if (!SelectionController._instance) {
			SelectionController._instance=new SelectionController()
		}
		return SelectionController._instance;
	}

	updateTheme(){
		this.selectionRectangle.stroke(MainController.instance.darkMode?"#fff":"#000")
	}

	#showSelection(){
		let selectionBox = this.selectionRectangle.bbox();
		for (const instance of this.circuitComponents) {
			let cond=false;
			if (this.selectionMode==SelectionController.SelectionMode.RESET) {
				cond = instance.isInsideSelectionRectangle(selectionBox)
			}else if (this.selectionMode==SelectionController.SelectionMode.ADD) {
				cond = instance.isInsideSelectionRectangle(selectionBox)||this.currentlySelectedComponents.includes(instance)
			}else{
				cond = !instance.isInsideSelectionRectangle(selectionBox)&&this.currentlySelectedComponents.includes(instance)
			}
			instance.showSelected(cond)
		}
	}

	#updateSelection(){
		let selectionBox = this.selectionRectangle.bbox();
		for (const instance of this.circuitComponents) {
			if (this.selectionMode==SelectionController.SelectionMode.RESET) {
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
			}else if(this.selectionMode==SelectionController.SelectionMode.ADD){
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
	}

	activateSelection(){
		this.selectionEnabled = true;
	}

	deactivateSelection(){
		this.selectionEnabled = false;
		this.selectionRectangle.attr("width",0);
		this.selectionRectangle.attr("height",0);
		this.selectionMode = SelectionController.SelectionMode.RESET;
		this.currentlySelectedComponents = []
		this.#showSelection();
		this.#updateSelection();
	}

	showSelection(){
		for (const component of this.currentlySelectedComponents) {
			component.showSelected(true)
		}
	}

	hideSelection(){
		for (const component of this.currentlySelectedComponents) {
			component.showSelected(false)
		}
	}

	selectComponents(components, mode){
		this.hideSelection();

		if (mode === SelectionController.SelectionMode.RESET) {
			this.currentlySelectedComponents=components
		}else if(mode === SelectionController.SelectionMode.ADD){
			this.currentlySelectedComponents = this.currentlySelectedComponents.concat(components)
			this.currentlySelectedComponents = [...new Set(this.currentlySelectedComponents)]
		}else{
			for (const component of components) {
				let idx = this.currentlySelectedComponents.findIndex((value)=>value===component)
				if(idx>=0){
					this.currentlySelectedComponents.splice(idx,1)
				}
			}
		}
		
		this.showSelection();
		
		PropertyController.instance.update()
	}

	selectAll(){
		this.currentlySelectedComponents = []
		for (const instance of this.circuitComponents) {
			this.currentlySelectedComponents.push(instance)
		}

		this.showSelection();
	}

	isComponentSelected(component: CircuitComponent){
		return this.currentlySelectedComponents.includes(component)
	}

	/**
	 * 
	 * @returns {SVG.Box}
	 */
	getOverallBoundingBox(): SVG.Box{
		let bbox:SVG.Box = null
		for (const component of this.currentlySelectedComponents) {
			if (bbox==null) {
				bbox = component.bbox
			}else{
				bbox = bbox.merge(component.bbox)
			}
		}
		return bbox
	}

	/**
	 * 
	 * @param {Number} angleDeg rotation in degrees (only 90 degree multiples, also negative)
	 */
	rotateSelection(angleDeg: number){
		//get overall center
		if (!this.hasSelection()) {
			return
		}
		
		let overallBBox = this.getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)
		
		//rotate all components/lines individually around their center
		//get individual center and rotate that around overall center
		//move individual components/lines to new rotated center
		for (const line of this.currentlySelectedLines) {
			let center = new SVG.Point(line.bbox().cx,line.bbox().cy)
			line.rotate(angleDeg);
			let move = center.rotate(angleDeg,overallCenter,false).minus(center)
			line.moveRel(move)
		}
		
		for (const component of this.currentlySelectedComponents) {
			/**@type {SVG.Point} */
			let center: SVG.Point = component.getAnchorPoint()
			component.rotate(angleDeg);
			let move = center.rotate(angleDeg,overallCenter,false)

			component.moveTo(move)
			if (component instanceof NodeComponentInstance) {
				component.recalculateSnappingPoints();
			}
		}
	}

	/**
	 * 
	 * @param {boolean} horizontal if flipping horizontally or vertically
	 */
	flipSelection(horizontal: boolean){
		//get overall center
		
		if (!this.hasSelection()) {
			return
		}
		
		let overallBBox = this.getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)
		let flipX = horizontal?0:-2;
		let flipY = horizontal?-2:0;

		//flip all components/lines individually at their center
		//get individual center and flip that at overall center
		//move individual components/lines to new flipped center

		for (const component of this.currentlySelectedComponents) {
			/**@type {SVG.Point} */
			let center: SVG.Point = component.getAnchorPoint()
			let diffToCenter = center.minus(overallCenter);
			component.flip(horizontal)
			component.moveRel(new SVG.Point(diffToCenter.x*flipX,diffToCenter.y*flipY))

			if (component instanceof NodeComponentInstance) {
				component.recalculateSnappingPoints();
			}
		}
	}

	/**
	 * move the selection by delta
	 * @param {SVG.Point} delta the amount to move the selection by
	 */
	moveSelectionRel(delta: SVG.Point){
		for (const element of this.currentlySelectedComponents) {
			element.moveRel(delta)
		}
	}

	/**
	 * move the center of the selection to the new position
	 * @param {SVG.Point} position the new position
	 */
	moveSelectionTo(position: SVG.Point){
		let overallBBox = this.getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)
		this.moveSelectionRel(position.minus(overallCenter))
	}

	removeSelection(){
		for (const component of this.currentlySelectedComponents) {
			MainController.instance.removeComponent(component)
		}

		this.currentlySelectedComponents=[]
		PropertyController.instance.update()
	}

	/**
	 * checks if anything is selected
	 * @returns true or false
	 */
	hasSelection(){
		return this.currentlySelectedComponents.length>0
	}
}