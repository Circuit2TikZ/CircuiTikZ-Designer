import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, MainController, Modes, PropertyController, SnapController, Undo} from "../internal";
import hotkeys from 'hotkeys-js';

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
		return shiftKey?pt:SnapController.instance.snapPoint(pt,component.getPlacingSnappingPoints().map(point=>point.relToComponentAnchor()))
	}

	public placeStep(ev:MouseEvent){
		if (ev.button==0) {
			let pt = ComponentPlacer.pointFromEvent(ev, ComponentPlacer.instance.component)
			if (ComponentPlacer.instance.component.placeStep(pt,ev)) {
				ComponentPlacer.instance.placeFinish()
			}
		}
	}

	public placeMove(ev:MouseEvent){
		let pt = ComponentPlacer.pointFromEvent(ev, ComponentPlacer.instance.component)
		ComponentPlacer.instance.component.placeMove(pt,ev)
	}

	public placeRotate(angleDeg:number){
		if (ComponentPlacer.instance.component) {
			ComponentPlacer.instance.component.placeRotate(angleDeg)
		}
	}

	public placeFlip(horizontal:boolean){
		if (ComponentPlacer.instance.component) {
			ComponentPlacer.instance.component.placeFlip(horizontal)
		}
	}

	public placeFinish(){
		if (ComponentPlacer.instance.component) {
			ComponentPlacer.instance.component.placeFinish()
			ComponentPlacer.instance.cleanUp()
			Undo.addState()
			
			// restart component placement for just finished component
			ComponentPlacer.instance.placeComponent(ComponentPlacer.instance.component.copyForPlacement())
		}
	}

	public placeCancel(ev?: KeyboardEvent){
		let component = ComponentPlacer.instance.component
		if (component) {
			component.placeFinish()
			MainController.instance.removeComponent(component)
			ComponentPlacer.instance._component = null
		}	
		ComponentPlacer.instance.cleanUp()
		MainController.instance.switchMode(Modes.DRAG_PAN)
	}

	private cleanUp(){
		//remove event listeners
		SnapController.instance.hideSnapPoints()
		let canvas = CanvasController.instance.canvas
		canvas.off("mousemove",ComponentPlacer.instance.placeMove)
		canvas.off("mouseup",ComponentPlacer.instance.placeStep)
		canvas.off("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys.unbind("enter",ComponentPlacer.instance.placeFinish)
		// hotkeys.unbind("esc",ComponentPlacer.instance.placeCancel)
	}

	public placeComponent(component: CircuitComponent){
		MainController.instance.switchMode(Modes.COMPONENT)
		ComponentPlacer.instance._component = component		
		let canvas = CanvasController.instance.canvas
		SnapController.instance.showSnapPoints()
		PropertyController.instance.update()

		canvas.on("mousemove",ComponentPlacer.instance.placeMove)
		canvas.on("mouseup",ComponentPlacer.instance.placeStep)
		canvas.on("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys("enter",{keyup: false, keydown:true},ComponentPlacer.instance.placeFinish)
		ComponentPlacer.instance.component.placeMove(CanvasController.instance.lastCanvasPoint)
	}
}