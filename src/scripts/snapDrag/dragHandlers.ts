import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, MainController, SelectionController, SelectionMode, SnapController, Undo } from "../internal";

export type DragCallbacks = {
	dragStart?(pos: SVG.Point, ev?:MouseEvent):void
	dragMove?(pos: SVG.Point, ev?:MouseEvent):void
	dragEnd?():void
}

type DragHandler = {
	el: SVG.Element;
	box: SVG.Box;
	lastClick: SVG.Point;
	drag(event:Event): void;
	startDrag(event:Event): void;
	endDrag(event:Event): void;
	move(x:number, y:number): SVG.Element;
	init(enabled:boolean):void
}

type DragMoveEventDetail = {
	box:SVG.Box
	event: MouseEvent
	handler: DragHandler
}

type DragEvent = CustomEvent<DragMoveEventDetail>;

function getOtherRelSnappingPoints(component:CircuitComponent){
	let snapPoints:SVG.Point[]=[]
	for (const selectedComponent of SelectionController.instance.currentlySelectedComponents) {
		if(selectedComponent!=component){
			for (const snappingPoint of selectedComponent.snappingPoints) {
				snapPoints.push(snappingPoint.relToComponentAnchor().add(selectedComponent.position).sub(component.position))
			}
		}
	}
	return snapPoints
}

export class SnapDragHandler{
	private componentReference: CircuitComponent
	private element:SVG.Element

	private startedDragging = false;
	private didDrag = false;
	private componentInSelection=false

	constructor(componentReference:CircuitComponent, element:SVG.Element) {
		this.componentReference = componentReference
		this.element = element
		this.element.remember("_snapDragHandler", this);
		this.element.draggable(true);

		this.element.on("dragstart", this.dragStart, this, { passive: true });
		this.element.on("dragmove.namespace", this.dragMove, this);
		this.element.on("dragend", this.dragEnd, this, { passive: true });
	}

	static snapDrag(componentReference:CircuitComponent, enable: boolean, element:SVG.Element = componentReference.visualization): SnapDragHandler | null {
		let snapDragHandler: SnapDragHandler | null = element.remember("_snapDragHandler") ?? (enable ? new SnapDragHandler(componentReference,element) : null);
		if (enable === false && snapDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			if (snapDragHandler.startedDragging) {
				snapDragHandler.dragEnd(null,false)
			}
			snapDragHandler.removeHandler();
			return null;
		}
		return snapDragHandler;
	}

	removeHandler() {
		this.element.off("dragstart", this.dragStart);
		this.element.off("dragmove.namespace", this.dragMove);
		this.element.off("dragend", this.dragEnd);
		this.element.draggable(false);
		this.element.forget("_snapDragHandler");
		this.element.forget("_draggable");
	}

	private dragStart(ev:DragEvent){
		this.startedDragging = true;
		this.element.node.classList.add("dragging");
		this.element.parent().node.classList.add("dragging");
		this.componentInSelection = this.componentReference.isSelected
	}
	private dragMove(ev:DragEvent){
		if (!this.didDrag) {
			// only show snapping points if actually moving
			SnapController.instance.showSnapPoints();
		}

		this.didDrag = true;
		ev.preventDefault();

		// the vector from the top left of the component bounding box to its postition vector
		const relMid: SVG.Point = this.componentReference.relPosition || new SVG.Point(0, 0);
		// the bounding box of the component for which the event occured
		let box = ev.detail.box.transform(this.componentReference.getTransformMatrix())
		
		// emulate as if the component is always dragged from its center (i.e. the position vector)
		const draggedPoint = new SVG.Point(box.x + relMid.x, box.y + relMid.y);

		let relSnapPoints: SVG.Point[] = this.componentReference.getPlacingSnappingPoints().map(point=>point.relToComponentAnchor())

		// add more snapping points if the component is part of the selection
		if (this.componentInSelection) {
			relSnapPoints.push(...getOtherRelSnappingPoints(this.componentReference))
		}

		// calculate where the selection/component should be placed
		let shiftKey = ev.detail.event.shiftKey
		let destination = shiftKey?draggedPoint:SnapController.instance.snapPoint(draggedPoint,relSnapPoints)

		if (this.componentInSelection){
			//move the whole selection to the destination
			SelectionController.instance.moveSelectionRel(destination.sub(this.componentReference.position))
		}else{
			this.componentReference.moveTo(destination)
		}
	}
	private dragEnd(ev:DragEvent,trackState=true){
		if (!this.startedDragging) {
			return
		}

		if (!this.didDrag) {
			// didn't move at all -> essentially clicked the component --> select the component instead
			let ctrlCommand = ev.detail.event.ctrlKey||(MainController.instance.isMac&&ev.detail.event.metaKey)
			let selectionMode = ev.detail.event.shiftKey?SelectionMode.ADD:ctrlCommand?SelectionMode.SUB:SelectionMode.RESET;

			SelectionController.instance.selectComponents([this.componentReference], selectionMode)
			trackState = false;			
		}

		// reset drag states
		this.didDrag = false;
		this.startedDragging = false;
		this.element.node.classList.remove("dragging");
		this.element.parent().node.classList.remove("dragging");
		SnapController.instance.hideSnapPoints();

		if (ev.detail?.event instanceof TouchEvent) {
			const clientXY = ev.detail.event.touches?.[0] ?? ev.detail.event.changedTouches?.[0];
			const contextMenuEvent = new PointerEvent("contextmenu", {
				clientX: clientXY.clientX,
				clientY: clientXY.clientY,
			});
			Promise.resolve().then(() => this.element.node.dispatchEvent(contextMenuEvent));
		}

		// only recalculate snapping points after movement is done! (since they are part of the movement which would lead to eratic behaviour)
		if (this.componentInSelection) {
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				component.recalculateSnappingPoints()
			}
		}else{
			this.componentReference.recalculateSnappingPoints();
		}

		if (trackState) {
			Undo.addState()
		}
	}
}

export class AdjustDragHandler{
	private dragCallbacks?: DragCallbacks
	private element: SVG.Element
	private componentReference: CircuitComponent

	private startedDragging = false;
	private didDrag = false;

	constructor(componentReference:CircuitComponent, element: SVG.Element, callbacks: DragCallbacks) {
		this.element = element
		this.componentReference = componentReference
		this.dragCallbacks = callbacks
		this.element.remember("_adjustDragHandler", this);
		this.element.draggable(true);

		this.element.on("dragstart", this.dragStart, this, { passive: true });
		this.element.on("dragmove.namespace", this.dragMove, this);
		this.element.on("dragend", this.dragEnd, this, { passive: true });
	}

	static snapDrag(componentReference:CircuitComponent, element:SVG.Element, enable: boolean, callbacks:DragCallbacks={}): AdjustDragHandler | null {
		let adjustDragHandler: AdjustDragHandler | null = element.remember("_adjustDragHandler") ?? (enable ? new AdjustDragHandler(componentReference, element, callbacks) : null);
		if (enable === false && adjustDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			if (adjustDragHandler.startedDragging) {
				adjustDragHandler.dragEnd(null,false)
			}
			adjustDragHandler.removeHandler();
			return null;
		}
		return adjustDragHandler;
	}

	/**
	 * Remove the handler and deactivate `draggable` feature.
	 */
	private removeHandler() {
		this.element.off("dragstart", this.dragStart);
		this.element.off("dragmove.namespace", this.dragMove);
		this.element.off("dragend", this.dragEnd);
		this.element.draggable(false);
		this.element.forget("_adjustDragHandler");
		this.element.forget("_draggable");
	}

	//- listener -------------------------------------------------------------------------------------------------------

	/**
	 * Listener for the "dragstart" event. Changes the cursor symbol using the class "dragging".
	 * @param {DragEvent} event
	 */
	dragStart(event: DragEvent) {
		this.startedDragging = true;
		this.element.node.classList.add("dragging");
		this.element.parent().node.classList.add("dragging");
		if (this.dragCallbacks && this.dragCallbacks.dragStart) {
			const draggedPoint = new SVG.Point(event.detail.box.cx, event.detail.box.cy);
			let shiftKey = event.detail.event.shiftKey
			let destination = shiftKey?draggedPoint:SnapController.instance.snapPoint(draggedPoint,[new SVG.Point()])
			this.dragCallbacks.dragStart(destination,event.detail.event)
		}
	}

	/**
	 * Handler for the dragging event. Alters the default behavior to enable snapping to grid and to other components.
	 *
	 * @private
	 * @param {DragEvent} event - the dragging event.
	 */
	dragMove(event: DragEvent) {
		event.preventDefault();
		
		if (!this.didDrag) {
			// only show snapping points if actually moving
			SnapController.instance.showSnapPoints();
		}
		this.didDrag = true;
		
		const draggedPoint = new SVG.Point(event.detail.box.cx, event.detail.box.cy);

		let shiftKey = event.detail.event.shiftKey
		let destination = shiftKey?draggedPoint:SnapController.instance.snapPoint(draggedPoint,[new SVG.Point()])

		if (this.dragCallbacks && this.dragCallbacks.dragMove) {
			this.dragCallbacks.dragMove(destination,event.detail.event)
		}
	}

	/**
	 * Listener for the "dragend" event. Undo the cursor change from {@link "#dragStart"}.
	 * @param {DragEvent} event
	 */
	dragEnd(event: DragEvent, trackState=true) {
		if (!this.startedDragging) {
			return
		}

		if (!this.didDrag) {
			// didn't move at all -> essentially clicked the component --> select the component instead
			let ctrlCommand = event.detail.event.ctrlKey||(MainController.instance.isMac&&event.detail.event.metaKey)
			let selectionMode = event.detail.event.shiftKey?SelectionMode.ADD:ctrlCommand?SelectionMode.SUB:SelectionMode.RESET;

			SelectionController.instance.selectComponents([this.componentReference], selectionMode)
			trackState = false;
		}

		this.didDrag = false;
		this.startedDragging = false;
		this.element.node.classList.remove("dragging");
		this.element.parent().node.classList.remove("dragging");

		SnapController.instance.hideSnapPoints();

		if (this.dragCallbacks && this.dragCallbacks.dragEnd) {
			this.dragCallbacks.dragEnd()
		}
		
		this.componentReference.recalculateSnappingPoints();

		if (trackState) {
			Undo.addState()
		}
	}
}