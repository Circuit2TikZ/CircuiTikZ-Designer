import * as SVG from "@svgdotjs/svg.js";
import { MainController, PropertyController, CanvasController, CircuitComponent } from "../internal";

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
	public currentlySelectedComponents: CircuitComponent[] = []
	private selectionEnabled: boolean

	private constructor() {
		this.selectionStartPosition = new SVG.Point()
		this.selectionRectangle = CanvasController.instance.canvas.rect(0,0).move(0,0);
		this.selectionRectangle.attr("stroke-width","0.5pt")
		this.selectionRectangle.attr("stroke","black")
		this.selectionRectangle.attr("fill","none")
		this.selectionRectangle.attr("id","selectionRectangle")
		this.selectionEnabled = true
		this.currentlyDragging = false
		this.selectionMode = SelectionMode.RESET

		this.selectionStart = this.selectionStart.bind(this)
		this.selectionMove = this.selectionMove.bind(this)
		this.selectionEnd = this.selectionEnd.bind(this)
		
		CanvasController.instance.canvas.on("mousedown",this.selectionStart)
		CanvasController.instance.canvas.on("touchstart",this.selectionStart)

		CanvasController.instance.canvas.on("mousemove",this.selectionMove)
		CanvasController.instance.canvas.on("touchmove",this.selectionMove)

		CanvasController.instance.canvas.on("mouseup",this.selectionEnd)
		CanvasController.instance.canvas.on("touchend",this.selectionEnd)
	}

	private selectionStart(evt:MouseEvent|TouchEvent){
		if (!this.selectionEnabled) {
			return
		}
		if (evt instanceof MouseEvent&&evt.button!==0) {
			return
		}
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

		CanvasController.instance.canvas.put(this.selectionRectangle) // bring to front
		this.selectionRectangle.move(this.selectionStartPosition.x,this.selectionStartPosition.y);
	}

	private selectionMove(evt:MouseEvent|TouchEvent){
		if (!this.selectionEnabled||!this.currentlyDragging) {
			return
		}
		if (evt instanceof TouchEvent && evt.touches.length>1) {
			this.currentlyDragging=false
			this.selectionRectangle.size(0,0).move(0,0)
			this.viewSelection(true)
			return
		}
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

	private selectionEnd(evt:MouseEvent|TouchEvent){
		if (!this.selectionEnabled) {
			return
		}
		if (evt instanceof MouseEvent && evt.button!==0) {
			return
		}
		if (evt instanceof TouchEvent && evt.touches.length>0) {
			return
		}
		if (this.currentlyDragging) {
			this.updateSelectionWithRectangle();
			this.currentlyDragging=false;
			this.selectionRectangle.size(0,0)
		}

		let pt = CanvasController.eventToPoint(evt, false);
		if (pt.x==this.selectionStartPosition.x&&pt.y==this.selectionStartPosition.y) {
			// clicked on canvas		
			this.selectionRectangle.move(pt.x,pt.y).size(0,0)
			this.updateSelectionWithRectangle()
		}
		PropertyController.instance.update()
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

	private updateSelectionWithRectangle(){
		let selectionBox = this.selectionRectangle.bbox();
		let components = MainController.instance.circuitComponents.filter((comp)=>comp.isInsideSelectionRectangle(selectionBox))
		this.selectComponents(components,this.selectionMode)
	}

	private previewSelection(){
		let selectionBox = this.selectionRectangle.bbox();
		if (this.selectionMode==SelectionMode.RESET) {
			for (const component of MainController.instance.circuitComponents) {
				component.viewSelected(component.isInsideSelectionRectangle(selectionBox))
			}
		}else if(this.selectionMode==SelectionMode.ADD) {
			for (const component of MainController.instance.circuitComponents) {
				component.viewSelected(component.isSelected||component.isInsideSelectionRectangle(selectionBox))
			}
		}else if(this.selectionMode==SelectionMode.SUB) {
			for (const component of MainController.instance.circuitComponents) {
				component.viewSelected(component.isSelected&&!component.isInsideSelectionRectangle(selectionBox))
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
		for (const component of MainController.instance.circuitComponents) {
			component.isSelected=false
			component.viewSelected(false)
		}
	}

	public viewSelection(show=true){
		for (const component of MainController.instance.circuitComponents) {
			component.viewSelected(show&&component.isSelected)
		}
	}

	public selectComponents(components: CircuitComponent[], mode:SelectionMode){
		if (mode==SelectionMode.RESET) {
			for (const component of MainController.instance.circuitComponents) {
				component.isSelected = false
			}
			for (const component of components) {
				component.isSelected = true
			}
		}else if(mode==SelectionMode.ADD) {
			for (const component of components) {
				component.isSelected = true
			}
		}else if(mode==SelectionMode.SUB) {
			for (const component of components) {
				component.isSelected = false
			}
		}
		
		this.currentlySelectedComponents.splice(0)
		this.currentlySelectedComponents.push(...MainController.instance.circuitComponents.filter((comp)=>comp.isSelected))
		this.viewSelection();
		
		PropertyController.instance.update()
	}

	public selectAll(){
		for (const component of MainController.instance.circuitComponents) {
			component.isSelected = true
		}
		this.currentlySelectedComponents.splice(0)
		this.currentlySelectedComponents.push(...MainController.instance.circuitComponents)

		this.viewSelection();
	}

	public getOverallBoundingBox(): SVG.Box{
		let bbox:SVG.Box = null
		for (const component of this.currentlySelectedComponents) {
			if (component.isSelected) {
				if (bbox==null) {
					bbox = component.bbox
				}else{
					bbox = bbox.merge(component.bbox)
				}
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