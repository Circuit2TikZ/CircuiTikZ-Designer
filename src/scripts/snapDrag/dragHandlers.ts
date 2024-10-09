import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, MainController, SelectionController, SelectionMode, SnapController, SnapPoint, Undo, CanvasController } from "../internal";

export type DragCallbacks = {
	dragStart?():void
	dragMove?(pos: SVG.Point):void
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

export class SnapDragHandler{
	private componentReference: CircuitComponent

	private startedDragging = false;
	private didDrag = false;

	constructor(componentReference:CircuitComponent) {
		this.componentReference = componentReference
		this.componentReference.visualization.remember("_snapDragHandler", this);
		this.componentReference.visualization.draggable(true);

		this.componentReference.visualization.on("dragstart", this.dragStart, this, { passive: true });
		this.componentReference.visualization.on("dragmove.namespace", this.dragMove, this);
		this.componentReference.visualization.on("dragend", this.dragEnd, this, { passive: true });
	}

	static snapDrag(componentReference:CircuitComponent, enable: boolean): SnapDragHandler | null {
		let snapDragHandler: SnapDragHandler | null = componentReference.visualization.remember("_snapDragHandler") ?? (enable ? new SnapDragHandler(componentReference) : null);
		if (enable === false && snapDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			snapDragHandler.dragEnd(null,false)
			snapDragHandler.removeHandler();
			return null;
		}
		return snapDragHandler;
	}

	removeHandler() {
		this.componentReference.visualization.off("dragstart", this.dragStart);
		this.componentReference.visualization.off("dragmove.namespace", this.dragMove);
		this.componentReference.visualization.off("dragend", this.dragEnd);
		this.componentReference.visualization.draggable(false);
	}

	private dragStart(ev:DragEvent){
		this.startedDragging = true;
		this.componentReference.visualization.node.classList.add("dragging");
		this.componentReference.visualization.parent().node.classList.add("dragging");
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

		let snapPoints: SVG.Point[] = this.componentReference.getPlacingSnappingPoints()
			// this.componentReference.snappingPoints && this.componentReference.snappingPoints.length > 0
			// 	? this.componentReference.snappingPoints.concat([new SVG.Point(0, 0) as SnapPoint])
			// 	: [new SVG.Point(0, 0)];

		// add more snapping points if the component is part of the selection
		let componentInSelection = SelectionController.instance.isComponentSelected(this.componentReference)
		if (componentInSelection) {
			const componentAnchor = this.componentReference.position
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				if(component!=this.componentReference){
					for (const snappingPoint of component.snappingPoints) {
						snapPoints.push(snappingPoint.relToComponentAnchor().add(component.position).sub(componentAnchor))
					}
				}
			}
		}

		// calculate where the selection/component should be placed
		let shiftKey = ev.detail.event.shiftKey
		let relSnapPoints = snapPoints.map(point=>point instanceof SnapPoint?point.relToComponentAnchor():point)
		let destination = shiftKey?draggedPoint:SnapController.instance.snapPoint(draggedPoint,relSnapPoints)

		if (componentInSelection){
			//move the whole selection to the destination
			SelectionController.instance.moveSelectionRel(destination.sub(this.componentReference.position))
			for (const element of SelectionController.instance.currentlySelectedComponents) {
				element.recalculateSnappingPoints()
			}
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
		this.componentReference.visualization.node.classList.remove("dragging");
		this.componentReference.visualization.parent().node.classList.remove("dragging");
		SnapController.instance.hideSnapPoints();

		// TODO support touch screens again
		if (ev.detail?.event instanceof TouchEvent) {
			const clientXY = ev.detail.event.touches?.[0] ?? ev.detail.event.changedTouches?.[0];
			const contextMenuEvent = new PointerEvent("contextmenu", {
				clientX: clientXY.clientX,
				clientY: clientXY.clientY,
			});
			Promise.resolve().then(() => this.componentReference.visualization.node.dispatchEvent(contextMenuEvent));
		}

		// only recalculate snapping points after movement is done! (since they are part of the movement which would lead to eratic behaviour)
		this.componentReference.recalculateSnappingPoints();

		if (trackState) {
			Undo.addState()
		}
	}
}

export class AdjustDragHandler{
	private dragCallbacks?: DragCallbacks
	private element: SVG.Element
	private componentReference: CircuitComponent
	private relMid: SVG.Point;

	private moveSelection = false;
	private startedDragging = false;
	private didDrag = false;

	constructor(componentReference:CircuitComponent, element: SVG.Element, moveSelection=false, callbacks?: DragCallbacks) {
		this.element = element
		this.componentReference = componentReference
		this.moveSelection = moveSelection
		this.dragCallbacks = callbacks
		let circleBbox = element.bbox()
		this.relMid = new SVG.Point(circleBbox.w/2,circleBbox.h/2);
		this.element.remember("_adjustDragHandler", this);
		this.element.draggable(true);

		this.element.on("dragstart", this.dragStart, this, { passive: true });
		this.element.on("dragmove.namespace", this.dragMove, this);
		this.element.on("dragend", this.dragEnd, this, { passive: true });
	}

	static snapDrag(componentReference:CircuitComponent, element:SVG.Element, enable: boolean, moveSelection=false, callbacks?:DragCallbacks): AdjustDragHandler | null {
		let adjustDragHandler: AdjustDragHandler | null = element.remember("_adjustDragHandler") ?? (enable ? new AdjustDragHandler(componentReference, element, moveSelection, callbacks) : null);
		if (enable === false && adjustDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			adjustDragHandler.dragEnd(null,false)
			adjustDragHandler.removeHandler();
			return null;
		}
		return adjustDragHandler;
	}

	/**
	 * Remove the handler and deactivate `draggable` feature.
	 */
	removeHandler() {
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
			this.dragCallbacks.dragStart()
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

		let destination = event.detail.event?.shiftKey
		? draggedPoint
		: SnapController.instance.snapPoint(draggedPoint, [new SVG.Point(0, 0)]);

		if (this.dragCallbacks && this.dragCallbacks.dragMove) {
			this.dragCallbacks.dragMove(destination)
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