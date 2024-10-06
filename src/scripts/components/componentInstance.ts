/**
 * @module componentInstance
 */

import { ComponentSymbol, FormEntry, SnapPoint } from "../internal";
import * as SVG from "@svgdotjs/svg.js";

export abstract class ComponentInstance {
	snappingPoints: SnapPoint[];
	tikzName: string;
	private finishedPlacingCallback: ()=>{}

	static createInstance(symbol:ComponentSymbol, container:SVG.Container, finishedPlacingCallback:()=>{}): ComponentInstance{
		throw new Error("Only instantiate ComponentInstance subclasses!");	
	}
	static fromJson(serialized:object):ComponentInstance{
		throw new Error("Only instantiate ComponentInstance subclasses!");	
	}

	public abstract getFormEntries(): FormEntry[]
	public abstract updateTheme(): void
	public abstract isInsideSelectionRectangle(selectionRectangle:SVG.Box):boolean
	public abstract bbox():SVG.Box
	public abstract getAnchorPoint():SVG.Point
	public abstract showBoudingBox():void
	public abstract hideBoudingBox():void
	public abstract remove():void
	public abstract move(x:number,y:number):ComponentInstance
	public abstract moveRel(delta:SVG.Point):ComponentInstance
	public abstract moveTo(position:SVG.Point):ComponentInstance
	public abstract flip(horizontal:boolean):ComponentInstance
	public abstract rotate(angleDeg:number):ComponentInstance
	public abstract toJson():object
	public abstract toTikzString():string
}