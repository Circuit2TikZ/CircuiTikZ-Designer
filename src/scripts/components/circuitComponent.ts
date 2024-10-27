import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";
import { EditableProperty, MainController, SnapPoint, ZOrderProperty, SnappingInfo, ButtonGridProperty, CanvasController, SectionHeaderProperty } from "../internal";
import { rectRectIntersection } from "../utils/selectionHelper";

/**
 * the root object for saving components as json. Extend this for custom components
 */
export type ComponentSaveObject = {
	type: string
	selected?:boolean
}

/**
 * Every component in the circuit should be deriving from this class.
 */
export abstract class CircuitComponent{
	/**
	 * the position of the circuit component
	 */
	public position: SVG.Point;
	/**
	 * The vector from the upper left corner of the component visualization to the reference position of the component
	 */
	public relPosition: SVG.Point;
	/**
	 * the current rotation angle in degrees
	 */
	public rotationDeg: number;

	/**
	 * all properties, which should be able to be edited in the properties window have to be included here
	 */
	public propertiesHTMLRows: HTMLElement[]=[]

	/**
	 * the name of the component (e.g. "Resistor", "Wire" or "Transformer")
	 */
	public displayName:string

	/**
	 * If the component is currently selected by the selection controller
	 */
	private _isSelected: boolean = false;
	public get isSelected(): boolean {
		return this._isSelected;
	}
	public set isSelected(value: boolean) {
		this._isSelected = value;
	}

	/**
	 * the cached bounding box of the component. Useful for example for the selection controller
	 */
	protected _bbox: SVG.Box;
	/**
	 * getter for the cached bounding box
	 */
	public get bbox(): SVG.Box {
		return this._bbox;
	}

	/**
	 * the SVG.js Element which represents the visualization/graphics of the component on the canvas. Should probably always be a group containing more svg components
	 */
	public visualization: SVG.Element;

	/**
	 * A List of all the Snapping points of this component
	 */
	public snappingPoints: SnapPoint[];

	/**
	 * The default constructor giving basic functionality. Never call this directly (only via super() in the constructor of the derived class).
	 */
	public constructor(){
		this.position = new SVG.Point()
		this.relPosition = new SVG.Point()
		//every time a component is initialized, it should be added to the component list for housekeeping
		MainController.instance.addComponent(this)

		this.displayName="Circuit Component"
		this.addZOrdering()
		this.addPositioning()
	}
	
	protected addZOrdering(){
		// all components should receive the possiblity to change their draw order/z order/depth
		let ordering = new ButtonGridProperty(2,[["To Foreground",""],["To Background",""],["Move Forward",""],["Move Backward",""]],[
			(ev)=>CanvasController.instance.componentToForeground(this),
			(ev)=>CanvasController.instance.componentToBackground(this),
			(ev)=>CanvasController.instance.moveComponentForward(this),
			(ev)=>CanvasController.instance.moveComponentBackward(this)
		])
		this.propertiesHTMLRows.push(ordering.buildHTML())
	}

	protected addPositioning(){
		let positioning = new ButtonGridProperty(2,[["Rotate CW","rotate_right"],["Rotate CCW","rotate_left"],["Flip X",["flip","rotateText"]],["Flip Y","flip"]],[
			(ev)=>this.rotate(-90),
			(ev)=>this.rotate(90),
			(ev)=>this.flip(true),
			(ev)=>this.flip(false)
		])
		this.propertiesHTMLRows.push(positioning.buildHTML())
	}

	/**
	 * Used by the snap controller to figure out which of the snapping points should be taken into account for snapping and if their should be additional snapping points, which are not normally part of the component (for example the center point of a node component, which should be snappable when moving this component but not snappable when being snapped to this component)
	 */
	public abstract getSnappingInfo():SnappingInfo

	/**
	 * Set this component draggable or not
	 * @param drag if dragging should be enabled
	 */
	public abstract draggable(drag: boolean):void

	/**
	 * Move the component to the specified position
	 * @param position where the circuitComponent.position should now be
	 */
	public abstract moveTo(position:SVG.Point):void
	/**
	 * Move the component by the specified delta, i.e. the new position = old position + delta
	 * @param delta by how much the component should be moved
	 */
	public moveRel(delta:SVG.Point):void{
		this.moveTo(this.position.add(delta))
	}
	/**
	 * Rotate the component by the specified angle
	 * @param angleDeg angle in degrees
	 */
	public abstract rotate(angleDeg:number):void
	/**
	 * Flip the component along the horizontal or vertical axis
	 * @param horizontal if the component should be flipped at the horizontal or vertical axis
	 */
	public abstract flip(horizontal:boolean):void

	/**
	 * Update the component, it's visualization, snapping points, selection visuals and transform matrix/position
	 */
	protected abstract update():void

	/**
	 * update the graphics corresponding to the component selection visualization
	 */
	protected abstract recalculateSelectionVisuals():void

	/**
	 * Show or hide the selection visualization of the component. This has to be distinct from the actual selection state due to how the selection controller works
	 * @param show if the component should appear selected or not
	 */
	public abstract viewSelected(show:boolean):void

	/**
	 * Checks if the component is inside the selection visualization. The default implementation is a rect-rect intersection check between the selection rectangle and the component bounding box. Override this for a more sophisticated check
	 * @param selectionRectangle where the current selection is requested
	 * @returns true if the selection rectangle encompases (a part of) the component
	 */
	public isInsideSelectionRectangle(selectionRectangle:SVG.Box):boolean{
		return rectRectIntersection(this.bbox, selectionRectangle)
	}
	/**
	 * update the visuals to comply with dark/light mode
	 */
	public updateTheme(){}

	/**
	 * helper method to always be between -180 and 180 degrees. TODO could be optimized to not use while loops but a closed form solution
	 */
	public simplifyRotationAngle(){
		while (this.rotationDeg > 180) this.rotationDeg -= 360;
		while (this.rotationDeg <= -180) this.rotationDeg += 360;
	}

	/**
	 * Converts the Component into a ComponentSaveObject or a derived type therof. This should encompass all information necessary to reproduce this component via {@link fromJson}
	 */
	public abstract toJson(): ComponentSaveObject
	/**
	 * convert this component into a draw command for CircuiTikz
	 */
	public abstract toTikzString():string
	/**
	 * Convert a ComponentSaveObject to a component. Calling CircuitComponent.fromJson(A.{@link toJson}()) should essentially produce an exact copy of the component "A". Override this in your subclass!
	 * @param saveObject An object of a derived type of ComponentSaveOject, which encompasses all information necessary to initalize this component type
	 */
	public static fromJson(saveObject:ComponentSaveObject): CircuitComponent{
		throw new Error("fromJson not implemented on "+ (typeof this)+". Implement in derived class");
	}

	/**
	 * Obtain the transformation matrix which transforms an object from the component reference to the world reference
	 * @returns the transformation matrix
	 */
	public getTransformMatrix(): SVG.Matrix{
		return new SVG.Matrix(this.visualization.transform())
	}

	/**
	 * The transformation matrix applied to the snapping points might be different than the transformation matrix of the component. Override this!
	 * @returns the snapping point transformation matrix
	 */
	public getSnapPointTransformMatrix(): SVG.Matrix{
		return new SVG.Matrix(this.visualization.transform())
	}

	/**
	 * Update the position of all snapping points associated with this component.
	 * @param matrix which matrix to use. probably the one returned by {@link getSnapPointTransformMatrix}
	 */
	public recalculateSnappingPoints(matrix?:SVG.Matrix){
		for (const snappingPoint of this.snappingPoints) {
			snappingPoint.recalculate(matrix)
		}
	}
	
	/**
	 * create a copy from the provided CircuitComponent but ready for component placement
	 */
	public abstract copyForPlacement(): CircuitComponent

	/**
	 * remove the component from the program
	 */
	public abstract remove():void

	// component placement code
	/**
	 * if the component is finished placing down/creating
	 */
	protected finishedPlacing = false;

	/**
	 * Override this if the component can be rotated while placing down. @see CircuitComponent.rotate for details
	 * @param angleDeg how far to rotate
	 */
	public placeRotate(angleDeg: number): void {}
	
	/**
	 * Override this if the component can be flipped while placing down. @see CircuitComponent.flip for details
	 * @param horizontal on which axis to rotate
	 */
	public placeFlip(horizontal: boolean): void {}	
	
	/**
	* 
	* @param pos where the mouse/pointer/cursor was moved
	* @param ev the context of the movement
	*/
   	public abstract placeMove(pos: SVG.Point, ev?:Event): void
	/**
	* One placement step. Probably a click or touch. Return true if the component is done with the placement.
	* @param pos where the mouse/pointer/cursor is
	* @param ev the context of the click/touch
	* @returns true if the placing is done, false otherwise
	*/
	public abstract placeStep(pos: SVG.Point, ev?:Event): boolean
	/**
	 * Called by ComponentPlacer after {@link placeStep}==true to clean up the component placement. Also instantly finishes the placement when called
	 */
	public abstract placeFinish():void // call this to force the placement to finish
}