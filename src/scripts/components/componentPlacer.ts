import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, MainController, SaveController, SelectionController, SnapController, SnapPoint, Undo } from "../internal";
import hotkeys from "hotkeys-js";

export class ComponentPlacer{
	private static _instance: ComponentPlacer
	private _component: CircuitComponent | null;
	public get component(): CircuitComponent | null {
		return this._component;
	}

	private constructor(){

	}

	public static get instance(){
		if (!ComponentPlacer._instance) {
			ComponentPlacer._instance = new ComponentPlacer()
		}
		return ComponentPlacer._instance
	}

	public static pointFromEvent(ev:MouseEvent, component: CircuitComponent): SVG.Point{
		let pt = CanvasController.eventToPoint(ev,false)
		// let pt:SVG.Point = new SVG.Point(ev.clientX, ev.clientY).transform(component.visualization.screenCTM().inverseO())	
		let shiftKey = ev.shiftKey
		return shiftKey?pt:SnapController.instance.snapPoint(pt,component.getPlacingSnappingPoints())
	}

	public placeStep(ev:MouseEvent){
		if (ev.button==0) {
			let pt = ComponentPlacer.pointFromEvent(ev, ComponentPlacer.instance.component)
			if (ComponentPlacer.instance.component.placeStep(pt,ev)) {
				ComponentPlacer.instance.placeFinish(ev)
			}
		}
	}

	public placeMove(ev:MouseEvent){
		let pt = ComponentPlacer.pointFromEvent(ev, ComponentPlacer.instance.component)
		ComponentPlacer.instance.component.placeMove(pt,ev)
	}

	public placeFinish(ev:MouseEvent){
		if (ev.button==0) {
			ComponentPlacer.instance.component.placeFinish()
			ComponentPlacer.instance.cleanUp()
			// Undo.addState()
			
			// restart component placement for just finished component
			ComponentPlacer.instance.placeComponent(ComponentPlacer.instance.component.copyForPlacement())
		}
	}

	public placeCancel(ev?: KeyboardEvent){
		console.log("cancel");
		
		ComponentPlacer.instance.component.placeFinish()
		MainController.instance.removeComponent(ComponentPlacer.instance.component)
		ComponentPlacer.instance._component = null
		ComponentPlacer.instance.cleanUp()
	}

	private cleanUp(){
		//remove event listeners
		SnapController.instance.hideSnapPoints()
		let canvas = CanvasController.instance.canvas
		canvas.off("mousemove",ComponentPlacer.instance.placeMove)
		canvas.off("mouseup",ComponentPlacer.instance.placeStep)
		canvas.off("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys.unbind("esc",ComponentPlacer.instance.placeCancel)
	}

	public placeComponent(component: CircuitComponent){
		ComponentPlacer.instance._component = component		
		let canvas = CanvasController.instance.canvas
		SnapController.instance.showSnapPoints()

		canvas.on("mousemove",ComponentPlacer.instance.placeMove)
		canvas.on("mouseup",ComponentPlacer.instance.placeStep)
		canvas.on("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys("esc",{keyup: true, keydown:false},ComponentPlacer.instance.placeCancel)
		ComponentPlacer.instance.component.placeMove(CanvasController.instance.lastCanvasPoint)
	}
}