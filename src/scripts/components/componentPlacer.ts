import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	CircuitComponent,
	MainController,
	Modes,
	PropertyController,
	SelectionController,
	SelectionMode,
	SnapController,
	SnapCursorController,
	Undo,
} from "../internal"
import hotkeys from "hotkeys-js"

/**
 * used to place all components via user input
 */
export class ComponentPlacer {
	//singleton
	private static _instance: ComponentPlacer
	/**
	 * the currently placing component
	 */
	private _component: CircuitComponent | null
	public get component(): CircuitComponent | null {
		return this._component
	}

	private previousComponent: CircuitComponent | null = null

	private constructor() {
		this.placeStep = this.placeStep.bind(this)
		this.placeMove = this.placeMove.bind(this)
		this.placeFinish = this.placeFinish.bind(this)
	}

	public static get instance() {
		return ComponentPlacer._instance ?? (ComponentPlacer._instance = new ComponentPlacer())
	}

	public static pointFromEvent(ev: MouseEvent | TouchEvent): SVG.Point {
		let pt = CanvasController.eventToPoint(ev, false)
		// let pt:SVG.Point = new SVG.Point(ev.clientX, ev.clientY).transform(component.visualization.screenCTM().inverseO())
		if (!ev.shiftKey) {
			pt = SnapController.instance.snapPoint(pt, ComponentPlacer.instance.component)
		}
		return pt
	}

	/**
	 * Initiate one placement step
	 * @param ev which event is responsible for the placement step
	 */
	public placeStep(ev: MouseEvent | TouchEvent) {
		if (ev instanceof MouseEvent && ev.button !== 0) {
			return
		}
		if (window.TouchEvent && ev instanceof TouchEvent && ev.touches.length !== 0) {
			return
		}
		let pt = ComponentPlacer.pointFromEvent(ev)
		if (this.component.placeStep(pt, ev)) {
			this.placeFinish(ev)
		}
		SnapController.instance.recalculateAdditionalSnapPoints()
	}

	/**
	 * Move the cursor/pointer/... while placing a component
	 * @param ev which event is responsible for the movement
	 */
	public placeMove(ev: MouseEvent | TouchEvent) {
		let pt = ComponentPlacer.pointFromEvent(ev)
		this.component.placeMove(pt, ev)
		SnapController.instance.showSnapPoints(!ev.shiftKey)
		SnapController.instance.recalculateAdditionalSnapPoints()
		SnapCursorController.instance.moveTo(pt)
	}

	/**
	 * Rotate the component while placing
	 * @param angleDeg angle in degrees
	 */
	public placeRotate(angleDeg: number) {
		if (this.component) {
			this.component.placeRotate(angleDeg)
		}
	}

	/**
	 * Flip the component while placing
	 * @param horizontal which axis to flip at
	 */
	public placeFlip(horizontal: boolean) {
		if (this.component) {
			this.component.placeFlip(horizontal)
		}
	}

	/**
	 * (Force) finish the component placement
	 */
	public placeFinish(ev: Event) {
		if (this.component) {
			this.component.placeFinish()
			this.cleanUp()
			Undo.addState()

			// restart component placement for just finished component
			if (window.TouchEvent && !(ev instanceof TouchEvent)) {
				this.previousComponent = this.component
				this.placeComponent(this.component.copyForPlacement())
			} else {
				this._component = null
				MainController.instance.switchMode(Modes.DRAG_PAN)
			}
		}
	}

	/**
	 * cancel the component placement
	 * @param ev which event is responsible for the cancellation
	 */
	public placeCancel(ev?: KeyboardEvent) {
		let component = this.component
		if (component) {
			component.placeFinish()
			MainController.instance.removeComponent(component)
			this._component = null
		}
		if (this.previousComponent) {
			SelectionController.instance.selectComponents([this.previousComponent], SelectionMode.RESET)
		}
		this.previousComponent = null
		this.cleanUp()
		SnapCursorController.instance.visible = false
		MainController.instance.switchMode(Modes.DRAG_PAN)
	}

	/**
	 * Get rid of now not needed event listeners
	 */
	private cleanUp() {
		SnapController.instance.showSnapPoints(false)
		//remove event listeners
		let canvas = CanvasController.instance.canvas
		canvas.off("mousemove", this.placeMove)
		canvas.off("touchmove", this.placeMove)
		canvas.off("mouseup", this.placeStep)
		canvas.off("touchend", this.placeStep)
		// canvas.off("dblclick",this.placeFinish)
		hotkeys.unbind("enter", this.placeFinish)
	}

	/**
	 * Place a new Component. The component should be an initialized instance of a CircuitComponent
	 * @param component which component to place
	 */
	public placeComponent(component: CircuitComponent) {
		MainController.instance.switchMode(Modes.COMPONENT)
		this._component = component
		SnapController.instance.updateSnapPoints(component, false)
		SnapController.instance.showSnapPoints()
		PropertyController.instance.update()

		// add event listeners to canvas
		let canvas = CanvasController.instance.canvas
		canvas.on("mousemove", this.placeMove)
		canvas.on("touchmove", this.placeMove)
		canvas.on("mouseup", this.placeStep)
		canvas.on("touchend", this.placeStep)
		hotkeys("enter", { keyup: false, keydown: true }, this.placeFinish)

		// move once to actually place the component at the mouse position
		this.component.placeMove(CanvasController.instance.lastCanvasPoint)
		SnapCursorController.instance.moveTo(
			SnapController.instance.snapPoint(CanvasController.instance.lastCanvasPoint, component)
		)
		SnapController.instance.recalculateAdditionalSnapPoints()
	}
}
