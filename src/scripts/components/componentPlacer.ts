import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, MainController, Modes, PropertyController, SnapController, Undo} from "../internal";
import hotkeys from 'hotkeys-js';

/**
 * used to place all components via user input
 */
export class ComponentPlacer{
	//singleton
	private static _instance: ComponentPlacer
	/**
	 * the currently placing component
	 */
	private _component: CircuitComponent | null;
	public get component(): CircuitComponent | null {
		return this._component;
	}

	private constructor(){

	}

	public static get instance(){
		return ComponentPlacer._instance??(ComponentPlacer._instance = new ComponentPlacer())
	}

	public static pointFromEvent(ev:MouseEvent): SVG.Point{
		let pt = CanvasController.eventToPoint(ev,false)
		// let pt:SVG.Point = new SVG.Point(ev.clientX, ev.clientY).transform(component.visualization.screenCTM().inverseO())
		if (!ev.shiftKey) {
			pt =  SnapController.instance.snapPoint(pt,ComponentPlacer.instance.component)
		}
		return pt
	}

	/**
	 * Initiate one placement step
	 * @param ev which event is responsible for the placement step
	 */
	public placeStep(ev:MouseEvent){
		if (ev.button==0) {
			let pt = ComponentPlacer.pointFromEvent(ev)
			if (ComponentPlacer.instance.component.placeStep(pt,ev)) {
				ComponentPlacer.instance.placeFinish()
			}
			SnapController.instance.recalculateAdditionalSnapPoints()
		}
	}

	/**
	 * Move the cursor/pointer/... while placing a component
	 * @param ev which event is responsible for the movement
	 */
	public placeMove(ev:MouseEvent){
		let pt = ComponentPlacer.pointFromEvent(ev)
		ComponentPlacer.instance.component.placeMove(pt,ev)
		SnapController.instance.recalculateAdditionalSnapPoints()
	}

	/**
	 * Rotate the component while placing
	 * @param angleDeg angle in degrees
	 */
	public placeRotate(angleDeg:number){
		if (ComponentPlacer.instance.component) {
			ComponentPlacer.instance.component.placeRotate(angleDeg)
		}
	}

	/**
	 * Flip the component while placing
	 * @param horizontal which axis to flip at
	 */
	public placeFlip(horizontal:boolean){
		if (ComponentPlacer.instance.component) {
			ComponentPlacer.instance.component.placeFlip(horizontal)
		}
	}

	/**
	 * (Force) finish the component placement
	 */
	public placeFinish(){
		if (ComponentPlacer.instance.component) {
			ComponentPlacer.instance.component.placeFinish()
			ComponentPlacer.instance.cleanUp()
			Undo.addState()
			
			// restart component placement for just finished component
			ComponentPlacer.instance.placeComponent(ComponentPlacer.instance.component.copyForPlacement())
		}
	}

	/**
	 * cancel the component placement
	 * @param ev which event is responsible for the cancellation
	 */
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

	/**
	 * Get rid of now not needed event listeners
	 */
	private cleanUp(){
		SnapController.instance.hideSnapPoints()
		//remove event listeners
		let canvas = CanvasController.instance.canvas
		canvas.off("mousemove",ComponentPlacer.instance.placeMove)
		canvas.off("mouseup",ComponentPlacer.instance.placeStep)
		canvas.off("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys.unbind("enter",ComponentPlacer.instance.placeFinish)
	}

	/**
	 * Place a new Component. The component should be an initialized instance of a CircuitComponent
	 * @param component which component to place
	 */
	public placeComponent(component: CircuitComponent){
		MainController.instance.switchMode(Modes.COMPONENT)
		ComponentPlacer.instance._component = component		
		SnapController.instance.updateSnapPoints(component,false)
		SnapController.instance.showSnapPoints()
		PropertyController.instance.update()
		
		// add event listeners to canvas
		let canvas = CanvasController.instance.canvas
		canvas.on("mousemove",ComponentPlacer.instance.placeMove)
		canvas.on("mouseup",ComponentPlacer.instance.placeStep)
		canvas.on("dblclick",ComponentPlacer.instance.placeFinish)
		hotkeys("enter",{keyup: false, keydown:true},ComponentPlacer.instance.placeFinish)

		// move once to actually place the component at the mouse position
		ComponentPlacer.instance.component.placeMove(CanvasController.instance.lastCanvasPoint)
		SnapController.instance.recalculateAdditionalSnapPoints()
	}
}