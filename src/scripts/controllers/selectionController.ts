/**
 * @module selectionController
 */

import * as SVG from "@svgdotjs/svg.js";
import { NodeComponentInstance, MainController, PropertyController, CanvasController, CircuitComponent } from "../internal";

export enum SelectionMode {
	RESET,
	ADD,
	SUB
}

/**
 * Controller holding selection information and handling selecting/deselecting
 * @class
 */
export class SelectionController {
	private static _instance: SelectionController;

	private selectionMode: number
	private selectionStartPosition: SVG.Point
	private selectionRectangle: SVG.Rect
	private currentlyDragging: boolean
	public currentlySelectedComponents: CircuitComponent[]
	private selectionEnabled: boolean

	private constructor() {
		this.selectionStartPosition = new SVG.Point()
		this.selectionRectangle = CanvasController.instance.canvas.rect(0,0).move(0,0);
		this.selectionRectangle.attr("stroke-width","0.5pt")
		this.selectionRectangle.attr("stroke","black")
		this.selectionRectangle.attr("fill","none")
		this.selectionRectangle.attr("id","selectionRectangle")
		this.selectionEnabled = true
		this.currentlySelectedComponents = []
		this.currentlyDragging = false
		this.selectionMode = SelectionMode.RESET

		//TODO selection only enables when state of program is drag pan
		
		CanvasController.instance.canvas.on("mousedown",(evt: MouseEvent)=>{

			if (evt.button===0&&this.selectionEnabled) {
				let shift = evt.shiftKey//||evt.detail.shiftKey
				let ctrl = evt.ctrlKey||(MainController.instance.isMac&&evt.metaKey)||(MainController.instance.isMac&&evt.metaKey)
				if (shift) {
					if (ctrl) {
						this.selectionMode = SelectionMode.RESET
					}else{
						this.selectionMode = SelectionMode.ADD;
					}
				}else{
					if (ctrl) {
						this.selectionMode = SelectionMode.SUB;
					}else{
						this.selectionMode = SelectionMode.RESET
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

				this.previewSelection();
			}

		})
		CanvasController.instance.canvas.on("mouseup",(/**@type {MouseEvent}*/evt: MouseEvent)=>{
			if (evt.button===0) {
				if (this.currentlyDragging) {
					this.updateSelection();
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

	public updateTheme(){
		this.selectionRectangle.stroke(MainController.instance.darkMode?"#fff":"#000")
	}

	private previewSelection(){
		let selectionBox = this.selectionRectangle.bbox();
		for (const component of MainController.instance.circuitComponents) {
			let cond=false;
			if (this.selectionMode==SelectionMode.RESET) {
				cond = component.isInsideSelectionRectangle(selectionBox)
			}else if (this.selectionMode==SelectionMode.ADD) {
				cond = component.isInsideSelectionRectangle(selectionBox)||this.currentlySelectedComponents.includes(component)
			}else{
				cond = !component.isInsideSelectionRectangle(selectionBox)&&this.currentlySelectedComponents.includes(component)
			}
			component.viewSelected(cond)
		}
	}

	private updateSelection(){
		let selectionBox = this.selectionRectangle.bbox();
		for (const component of MainController.instance.circuitComponents) {
			if (this.selectionMode==SelectionMode.RESET) {
				if (component.isInsideSelectionRectangle(selectionBox)) {
					if (!this.currentlySelectedComponents.includes(component)) {
						this.currentlySelectedComponents.push(component)
					}
				}else{
					let idx = this.currentlySelectedComponents.indexOf(component)
					if (idx>-1) {
						this.currentlySelectedComponents.splice(idx,1)
					}
				}
			}else if(this.selectionMode==SelectionMode.ADD){
				if (component.isInsideSelectionRectangle(selectionBox)) {
					if (!this.currentlySelectedComponents.includes(component)) {
						this.currentlySelectedComponents.push(component)
					}
				}
			}else{
				if (component.isInsideSelectionRectangle(selectionBox)) {
					let idx = this.currentlySelectedComponents.indexOf(component)
					if (idx>-1) {
						this.currentlySelectedComponents.splice(idx,1)
					}
				}
			}
		}
	}

	public activateSelection(){
		this.selectionEnabled = true;
	}

	public deactivateSelection(){
		this.selectionEnabled = false;
		this.selectionRectangle.attr("width",0);
		this.selectionRectangle.attr("height",0);
		this.selectionMode = SelectionMode.RESET;
		this.currentlySelectedComponents = []
		this.previewSelection();
		this.updateSelection();
	}

	public showSelection(){
		for (const component of this.currentlySelectedComponents) {
			component.viewSelected(true)
		}
	}

	public hideSelection(){
		for (const component of this.currentlySelectedComponents) {
			component.viewSelected(false)
		}
	}

	public selectComponents(components: CircuitComponent[], mode:SelectionMode){
		this.hideSelection();

		if (mode === SelectionMode.RESET) {
			this.currentlySelectedComponents=components
		}else if(mode === SelectionMode.ADD){
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

	public selectAll(){
		this.currentlySelectedComponents = []
		for (const instance of MainController.instance.circuitComponents) {
			this.currentlySelectedComponents.push(instance)
		}

		this.showSelection();
	}

	public isComponentSelected(component: CircuitComponent){
		return this.currentlySelectedComponents.includes(component)
	}

	/**
	 * 
	 * @returns {SVG.Box}
	 */
	public getOverallBoundingBox(): SVG.Box{
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
	public rotateSelection(angleDeg: number){
		//get overall center
		if (!this.hasSelection()) {
			return
		}
		
		let overallBBox = this.getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)
		
		//rotate all components/lines individually around their center
		//get individual center and rotate that around overall center
		//move individual components/lines to new rotated center		
		
		for (const component of this.currentlySelectedComponents) {
			component.rotate(angleDeg);
			let move = component.position.rotate(angleDeg,overallCenter,false)
			component.moveTo(move)
			component.recalculateSnappingPoints()
		}
	}

	/**
	 * 
	 * @param {boolean} horizontal if flipping horizontally or vertically
	 */
	public flipSelection(horizontal: boolean){
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
			let diffToCenter = component.position.sub(overallCenter);
			component.flip(horizontal)
			component.moveRel(new SVG.Point(diffToCenter.x*flipX,diffToCenter.y*flipY))
			component.recalculateSnappingPoints()
		}
	}

	/**
	 * move the selection by delta
	 * @param {SVG.Point} delta the amount to move the selection by
	 */
	public moveSelectionRel(delta: SVG.Point){
		for (const element of this.currentlySelectedComponents) {
			element.moveRel(delta)
		}
	}

	/**
	 * move the center of the selection to the new position
	 * @param position the new position
	 */
	public moveSelectionTo(position: SVG.Point){
		let overallBBox = this.getOverallBoundingBox()
		let overallCenter = new SVG.Point(overallBBox.cx,overallBBox.cy)
		this.moveSelectionRel(position.sub(overallCenter))
	}

	public removeSelection(){
		for (const component of this.currentlySelectedComponents) {
			MainController.instance.removeComponent(component)
		}

		this.currentlySelectedComponents=[]
		PropertyController.instance.update()
	}

	/**
	 * checks if anything is selected
	 */
	public hasSelection(){
		return this.currentlySelectedComponents.length>0
	}
}