import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, MainController, SaveController, SnapController, SnapPoint, Undo } from "../internal";
import hotkeys from "hotkeys-js";

export class ComponentPlacer{
	private static _instance: ComponentPlacer
	private _component: CircuitComponent | null;
	public get component(): CircuitComponent | null {
		return this._component;
	}

	private constructor(){

	}

	private lastMousePoint = new SVG.Point(0,0)

	public static get instance(){
		if (!ComponentPlacer._instance) {
			ComponentPlacer._instance = new ComponentPlacer()
		}
		return ComponentPlacer._instance
	}

	private snappedPositition(ev:MouseEvent): SVG.Point{
		let pt = new SVG.Point(ev.clientX, ev.clientY);		
		pt = pt.transform(ComponentPlacer.instance.component.visualization.screenCTM().inverseO());
		
		let snappingPoints = ComponentPlacer.instance.component.snappingPoints
		return SnapController.instance.snapPoint(pt,snappingPoints.concat([new SVG.Point() as SnapPoint]))
	}

	public placeStep(ev:MouseEvent){
		if (ev.button==0) {
			let pt = ComponentPlacer.instance.snappedPositition(ev)	
			ComponentPlacer.instance.lastMousePoint = pt
			if (ComponentPlacer.instance.component.placeStep(pt)) {
				ComponentPlacer.instance.placeFinish(ev)
			}
		}
	}

	public placeMove(ev:MouseEvent){
		let pt = ComponentPlacer.instance.snappedPositition(ev)	
		ComponentPlacer.instance.lastMousePoint = pt
		ComponentPlacer.instance.component.placeMove(pt)
	}

	public placeFinish(ev:MouseEvent){
		ComponentPlacer.instance.component.placeFinish()
		ComponentPlacer.instance.cleanUp()
		// Undo.addState()
		
		// restart component placement for just finished component
		ComponentPlacer.instance.placeComponent(ComponentPlacer.instance.component.copyForPlacement())
	}

	public placeCancel(ev?: KeyboardEvent){
		let finishedPlacing = false
		while (!finishedPlacing) {
			finishedPlacing = ComponentPlacer.instance._component.placeStep(ComponentPlacer.instance.lastMousePoint)
		}
		MainController.instance.removeComponent(ComponentPlacer.instance.component)
		ComponentPlacer.instance._component = null
		ComponentPlacer.instance.cleanUp()
	}

	private cleanUp(){
		//remove event listeners
		let canvas = CanvasController.instance.canvas
		canvas.off("mousemove",ComponentPlacer.instance.placeMove)
		canvas.off("mouseup",ComponentPlacer.instance.placeStep)
		canvas.off("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys.unbind("esc",ComponentPlacer.instance.placeCancel)
	}

	public placeComponent(component: CircuitComponent){
		ComponentPlacer.instance._component = component		
		let canvas = CanvasController.instance.canvas

		canvas.on("mousemove",ComponentPlacer.instance.placeMove)
		canvas.on("mouseup",ComponentPlacer.instance.placeStep)
		canvas.on("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys("esc",{keyup: true, keydown:false},ComponentPlacer.instance.placeCancel)
		ComponentPlacer.instance.component.placeMove(ComponentPlacer.instance.lastMousePoint)
	}
}