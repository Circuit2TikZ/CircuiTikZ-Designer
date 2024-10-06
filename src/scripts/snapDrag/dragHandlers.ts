import * as SVG from "@svgdotjs/svg.js";
import { CircuitComponent, MainController, NodeComponent, SelectionController, SnapController, SnapPoint, Undo } from "../internal";

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
	event: MouseEvent|TouchEvent
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

		const relMid: SVG.Point = this.componentReference.relPosition || new SVG.Point(0, 0);

		const draggedPoint = new SVG.Point(ev.detail.box.x + relMid.x, ev.detail.box.y + relMid.y);

		const snapPoints: SVG.Point[] =
			this.componentReference.snappingPoints && this.componentReference.snappingPoints.length > 0
				? this.componentReference.snappingPoints
				: [new SVG.Point(0, 0)];

		let componentInSelection = SelectionController.instance.currentlySelectedComponents.includes(this.componentReference)
		if (componentInSelection) {
			const componentAnchor = this.componentReference.position
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				if(component!=this.componentReference){
					for (const snappingPoint of component.snappingPoints) {
						snapPoints.push(snappingPoint.relToComponentAnchor().plus(component.position).minus(componentAnchor))
					}
				}
			}
		}

		let destination = ev.detail.event?.shiftKey
			? draggedPoint
			: SnapController.instance.snapPoint(draggedPoint, (snapPoints.concat([new SVG.Point()])) as SnapPoint[]);

		if (componentInSelection){
			SelectionController.instance.moveSelectionRel(destination.minus(this.componentReference.position))
			for (const element of SelectionController.instance.currentlySelectedComponents) {
				if (element instanceof NodeComponent) {
					element.recalculateSnappingPoints()
				}
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
			let selectionMode = ev.detail.event.shiftKey?SelectionController.SelectionMode.ADD:ctrlCommand?SelectionController.SelectionMode.SUB:SelectionController.SelectionMode.RESET;

			SelectionController.instance.selectComponents([this.componentReference.visualization], selectionMode)
			trackState = false;			
		}

		this.didDrag = false;
		this.startedDragging = false;
		this.componentReference.visualization.node.classList.remove("dragging");
		this.componentReference.visualization.parent().node.classList.remove("dragging");


		SnapController.instance.hideSnapPoints();

		if (ev.detail?.event instanceof TouchEvent) {
			const clientXY = ev.detail.event.touches?.[0] ?? ev.detail.event.changedTouches?.[0];
			const contextMenuEvent = new PointerEvent("contextmenu", {
				clientX: clientXY.clientX,
				clientY: clientXY.clientY,
			});
			Promise.resolve().then(() => this.componentReference.visualization.node.dispatchEvent(contextMenuEvent));
		}

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

	private startedDragging = false;
	private didDrag = false;

	constructor(componentReference:CircuitComponent, element: SVG.Element, callbacks?: DragCallbacks) {
		this.element = element
		this.componentReference = componentReference
		this.dragCallbacks = callbacks
		let circleBbox = element.bbox()
		this.relMid = new SVG.Point(circleBbox.w/2,circleBbox.h/2);
		this.element.remember("_adjustDragHandler", this);
		this.element.draggable(true);

		this.element.on("dragstart", this.dragStart, this, { passive: true });
		this.element.on("dragmove.namespace", this.dragMove, this);
		this.element.on("dragend", this.dragEnd, this, { passive: true });
	}

	static snapDrag(componentReference:CircuitComponent, element:SVG.Element, enable: boolean, callbacks?:DragCallbacks): AdjustDragHandler | null {
		let adjustDragHandler: AdjustDragHandler | null = element.remember("_adjustDragHandler") ?? (enable ? new AdjustDragHandler(componentReference, element, callbacks) : null);
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
		
		const draggedPoint = new SVG.Point(event.detail.box.x + this.relMid.x, event.detail.box.y + this.relMid.y);

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
			let selectionMode = event.detail.event.shiftKey?SelectionController.SelectionMode.ADD:ctrlCommand?SelectionController.SelectionMode.SUB:SelectionController.SelectionMode.RESET;

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