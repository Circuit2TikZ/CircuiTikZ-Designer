import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";
import { CanvasController, ComponentSymbol, FormEntry, Line, MainController, NodeComponent, PathComponent, SaveController, SnapPoint } from "../internal";

export enum LabelAnchor {
	default="default",
	center="center",
	north="north",
	south="south",
	east="east",
	west="west",
	northeast="north east",
	northwest="north west",
	southeast="south east",
	southwest="south west"
}

export enum LineDirection {
	Straight = "--",
	HV = "-|",
	VH = "|-"
}

export type LineSegment = {
	position: SVG.Point
	direction: LineDirection
}

export type Label = {
	value:string
	anchor:LabelAnchor
	labelDistance?:number
}

export type ComponentSaveObject = {
	type: string
	selected?:boolean
}

export type LineSaveObject = ComponentSaveObject &  {
	start: SVG.Point
	segments: LineSegment[]
}

export type CircuitikzSaveObject = ComponentSaveObject & {
	id: string
	name?:string
	label?:Label
}

export type NodeSaveObject = CircuitikzSaveObject & {
	position:SVG.Point
	rotation?:number
	flipX?:boolean
	flipY?:boolean
}

export type PathSaveObject = CircuitikzSaveObject & {
	start:SVG.Point
	end:SVG.Point
	mirror?:boolean
	invert?:boolean
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
	public flipState:SVG.Point;

	protected _bbox: SVG.Box;
	public get bbox(): SVG.Box {
		return this._bbox;
	}

	public visualization: SVG.Element;
	public snappingPoints: SnapPoint[];

	// manipulation on canvas
	public abstract moveTo(position:SVG.Point):void
	public moveRel(delta:SVG.Point):void{
		this.moveTo(this.position.plus(delta))
	}
	public abstract rotate(angleDeg:number):void
	public abstract flip(horizontal:boolean):void

	public abstract showSelected(show:boolean):void

	public abstract isInsideSelectionRectangle(selectionRectangle:SVG.Box):boolean
	public abstract updateTheme():void

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
	public abstract placeMove(pos: SVG.Point): void
	/**
	 * return true when the component is finished placing down
	 * @param pos 
	 */
	public abstract placeStep(pos: SVG.Point): boolean
	public abstract placeFinish():void // call this to force the placement to finish
	
	// public abstract getSnappingPoints() : SnapPoint[]
}