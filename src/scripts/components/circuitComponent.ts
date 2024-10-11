import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";
import { EditableProperty, FormEntry, LabelAnchor, MainController, SnapPoint } from "../internal";
import { rectRectIntersection } from "../utils/selectionHelper";

export type ComponentSaveObject = {
	type: string
	selected?:boolean
}

/**
 * Every component which should be present in the export should be implementing this
 */
export abstract class CircuitComponent{
	/**
	 * the position of the circuit component
	 */
	public position: SVG.Point;
	/**
	 * The vector from the position of the visualization to the reference position of the circuit component
	 */
	public relPosition: SVG.Point;
	public rotationDeg: number;
	public flipState:SVG.Point = new SVG.Point(1,1);

	public editableProperties:EditableProperty<any>[]=[]

	public displayName:string

	public constructor(){
		this.position = new SVG.Point()
		this.relPosition = new SVG.Point()
		MainController.instance.addComponent(this)

		this.displayName="Circuit Component"

		//TODO add z-order controls as editableProperty
	}

	protected _bbox: SVG.Box;
	public get bbox(): SVG.Box {
		return this._bbox;
	}

	public visualization: SVG.Element;
	public snappingPoints: SnapPoint[];
	public abstract getPlacingSnappingPoints():SnapPoint[]

	public abstract draggable(drag: boolean):void

	// manipulation on canvas
	public abstract moveTo(position:SVG.Point):void
	public moveRel(delta:SVG.Point):void{
		this.moveTo(this.position.add(delta))
	}
	public abstract rotate(angleDeg:number):void
	public abstract flip(horizontal:boolean):void

	protected abstract updateTransform():void

	protected abstract recalculateSelectionVisuals():void

	public abstract viewSelected(show:boolean):void

	public isInsideSelectionRectangle(selectionRectangle:SVG.Box):boolean{
		return rectRectIntersection(this.bbox, selectionRectangle)
	}
	public updateTheme(){}

	public simplifyRotationAngle(){
		while (this.rotationDeg > 180) this.rotationDeg -= 360;
		while (this.rotationDeg <= -180) this.rotationDeg += 360;
	}

	public abstract toJson(): ComponentSaveObject
	public abstract toTikzString():string
	public static fromJson(saveObject:ComponentSaveObject): CircuitComponent{
		throw new Error("fromJson not implemented on "+ (typeof this)+". Implement in derived class");
	}

	public getTransformMatrix(){
		return new SVG.Matrix(this.visualization.transform())
	}

	public recalculateSnappingPoints(matrix?:SVG.Matrix){
		for (const snappingPoint of this.snappingPoints) {
			snappingPoint.recalculate(matrix)
		}
	}
	
	public abstract getFormEntries(): FormEntry[]
	/**
	 * create a copy from the provided CircuitComponent but ready for component placement
	 * @param from 
	 */
	public abstract copyForPlacement(): CircuitComponent

	public abstract remove():void

	finishedPlacing = false;
	public abstract placeMove(pos: SVG.Point, ev?:Event): void
	public placeRotate(angleDeg: number): void {}
	public placeFlip(horizontal: boolean): void {}
	/**
	 * return true when the component is finished placing down
	 */
	public abstract placeStep(pos: SVG.Point, ev?:Event): boolean
	public abstract placeFinish():void // call this to force the placement to finish
	
	// public abstract getSnappingPoints() : SnapPoint[]
}