import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	CircuitComponent,
	MainController,
	SelectionController,
	SelectionMode,
	SnapController,
	Undo,
} from "../internal"

export type DragCallbacks = {
	dragStart?(pos: SVG.Point, ev?: MouseEvent | TouchEvent): void
	dragMove?(pos: SVG.Point, ev?: MouseEvent | TouchEvent): void
	dragEnd?(): boolean //return true if an Undo state can be added
}

type DragHandler = {
	el: SVG.Element
	box: SVG.Box
	lastClick: SVG.Point
	drag(event: Event): void
	startDrag(event: Event): void
	endDrag(event: Event): void
	move(x: number, y: number): SVG.Element
	init(enabled: boolean): void
}

type DragMoveEventDetail = {
	box: SVG.Box
	event: MouseEvent | TouchEvent
	handler: DragHandler
}

type DragEvent = CustomEvent<DragMoveEventDetail>

function getHighestParentGroup(component: CircuitComponent) {
	let parent: CircuitComponent = component
	while (parent.parentGroup) {
		parent = parent.parentGroup
	}
	return parent
}

let currentlyDragging: CircuitComponent = null

export class SnapDragHandler {
	private componentReference: CircuitComponent
	private element: SVG.Element

	private startedDragging = false
	private didDrag = false

	constructor(componentReference: CircuitComponent, element: SVG.Element) {
		this.componentReference = componentReference
		this.element = element
		this.element.remember("_snapDragHandler", this)
		this.element.draggable(true)

		this.element.on("dragstart", this.dragStart, this, { passive: true })
		this.element.on("dragmove.namespace", this.dragMove, this)
		this.element.on("dragend", this.dragEnd, this, { passive: true })
		this.element.on("mouseenter", (ev) => {
			getHighestParentGroup(this.componentReference).isHovered =
				currentlyDragging ? this.componentReference == currentlyDragging : true
		})
		this.element.on("mouseleave", (ev) => {
			getHighestParentGroup(this.componentReference).isHovered = this.didDrag
		})
	}

	static snapDrag(
		componentReference: CircuitComponent,
		enable: boolean,
		element: SVG.Element = componentReference.visualization
	): SnapDragHandler | null {
		let snapDragHandler: SnapDragHandler | null =
			element.remember("_snapDragHandler") ?? (enable ? new SnapDragHandler(componentReference, element) : null)
		if (enable === false && snapDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			if (snapDragHandler.startedDragging) {
				snapDragHandler.dragEnd(null, false)
			}
			snapDragHandler.removeHandler()
			return null
		}
		return snapDragHandler
	}

	removeHandler() {
		this.element.off("dragstart", this.dragStart)
		this.element.off("dragmove.namespace", this.dragMove)
		this.element.off("dragend", this.dragEnd)
		this.element.off("mouseenter")
		this.element.off("mouseleave")
		this.element.draggable(false)
		this.element.forget("_snapDragHandler")
		this.element.forget("_draggable")
	}

	private dragOffset: SVG.Point
	private dragStart(ev: DragEvent) {
		this.startedDragging = true
		currentlyDragging = this.componentReference
		this.element.node.classList.add("dragging")
		this.element.parent().node.classList.add("dragging")
		this.dragOffset = this.componentReference.position.sub(CanvasController.eventToPoint(ev.detail.event, false))

		SnapController.instance.updateSnapPoints(getHighestParentGroup(this.componentReference), false)
	}
	private dragMove(ev: DragEvent) {
		this.didDrag = true
		ev.preventDefault()

		const draggedPoint = CanvasController.eventToPoint(ev.detail.event, false).add(this.dragOffset)

		// calculate where the selection/component should be placed
		let shiftKey = ev.detail.event.shiftKey
		let destination =
			shiftKey ? draggedPoint : SnapController.instance.snapPoint(draggedPoint, this.componentReference)

		SnapController.instance.showSnapPoints(!shiftKey)

		let parent: CircuitComponent = getHighestParentGroup(this.componentReference)

		if (parent.isSelected) {
			//move the whole selection to the destination
			SelectionController.instance.moveSelectionRel(destination.sub(this.componentReference.position))
		} else {
			parent.moveTo(destination.add(parent.position.sub(this.componentReference.position)))
		}
		SnapController.instance.recalculateAdditionalSnapPoints()
	}
	private dragEnd(ev: DragEvent, trackState = true) {
		if (!this.startedDragging) {
			return
		}
		currentlyDragging = null

		let parent: CircuitComponent = getHighestParentGroup(this.componentReference)

		if (!this.didDrag) {
			// didn't move at all -> essentially clicked the component --> select the component instead; no Undo state
			let ctrlCommand = ev.detail.event.ctrlKey || (MainController.instance.isMac && ev.detail.event.metaKey)
			let selectionMode =
				ev.detail.event.shiftKey ? SelectionMode.ADD
				: ctrlCommand ? SelectionMode.SUB
				: SelectionMode.RESET

			if (
				selectionMode == SelectionMode.RESET &&
				SelectionController.instance.currentlySelectedComponents.includes(parent) &&
				SelectionController.instance.currentlySelectedComponents.length > 1
			) {
				SelectionController.instance.setReference(parent)
			} else {
				SelectionController.instance.selectComponents([parent], selectionMode)
			}
			trackState = false
		}

		// reset drag states
		this.didDrag = false
		this.startedDragging = false
		this.element.node.classList.remove("dragging")
		this.element.parent().node.classList.remove("dragging")
		SnapController.instance.showSnapPoints(false)

		if (window.TouchEvent && ev.detail?.event instanceof TouchEvent) {
			const clientXY = ev.detail.event.touches?.[0] ?? ev.detail.event.changedTouches?.[0]
			const contextMenuEvent = new PointerEvent("contextmenu", {
				clientX: clientXY.clientX,
				clientY: clientXY.clientY,
			})
			Promise.resolve().then(() => this.element.node.dispatchEvent(contextMenuEvent))
		}

		// only recalculate snapping points after movement is done! (since they are part of the movement which would lead to eratic behaviour)
		if (parent.isSelected) {
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				component.recalculateSnappingPoints()
			}
		} else {
			parent.recalculateSnappingPoints()
		}

		if (trackState) {
			Undo.addState()
		}
	}
}

export class AdjustDragHandler {
	private dragCallbacks?: DragCallbacks
	private element: SVG.Element
	private componentReference: CircuitComponent

	private startedDragging = false
	private didDrag = false

	constructor(componentReference: CircuitComponent, element: SVG.Element, callbacks: DragCallbacks) {
		this.element = element
		this.componentReference = componentReference
		this.dragCallbacks = callbacks
		this.element.remember("_adjustDragHandler", this)
		this.element.draggable(true)

		this.element.on("dragstart", this.dragStart, this, { passive: true })
		this.element.on("dragmove.namespace", this.dragMove, this)
		this.element.on("dragend", this.dragEnd, this, { passive: true })
		this.element.on("mouseenter", (ev) => {
			this.componentReference.isHovered = currentlyDragging ? this.componentReference == currentlyDragging : true
		})
		this.element.on("mouseleave", (ev) => {
			this.componentReference.isHovered = this.didDrag
		})
	}

	static snapDrag(
		componentReference: CircuitComponent,
		element: SVG.Element,
		enable: boolean,
		callbacks: DragCallbacks = {}
	): AdjustDragHandler | null {
		let adjustDragHandler: AdjustDragHandler | null =
			element.remember("_adjustDragHandler") ??
			(enable ? new AdjustDragHandler(componentReference, element, callbacks) : null)
		if (enable === false && adjustDragHandler) {
			// enable === false --> not undefined
			// if the snapDragHandler gets removed while currently moving, this means that the component placement is cancelled, i.e. no state should be added
			if (adjustDragHandler.startedDragging) {
				adjustDragHandler.dragEnd(null, false)
			}
			adjustDragHandler.removeHandler()
			return null
		}
		return adjustDragHandler
	}

	/**
	 * Remove the handler and deactivate `draggable` feature.
	 */
	private removeHandler() {
		this.element.off("dragstart", this.dragStart)
		this.element.off("dragmove.namespace", this.dragMove)
		this.element.off("dragend", this.dragEnd)
		this.element.off("mouseenter")
		this.element.off("mouseleave")
		this.element.draggable(false)
		this.element.forget("_adjustDragHandler")
		this.element.forget("_draggable")
	}

	//- listener -------------------------------------------------------------------------------------------------------

	/**
	 * Listener for the "dragstart" event. Changes the cursor symbol using the class "dragging".
	 * @param {DragEvent} event
	 */
	dragStart(event: DragEvent) {
		this.startedDragging = true
		currentlyDragging = this.componentReference
		this.element.node.classList.add("dragging")
		this.element.parent().node.classList.add("dragging")
		SnapController.instance.updateSnapPoints(this.componentReference, true)
		if (this.dragCallbacks && this.dragCallbacks.dragStart) {
			const draggedPoint = new SVG.Point(event.detail.box.cx, event.detail.box.cy)
			let shiftKey = event.detail.event.shiftKey
			let destination =
				shiftKey ? draggedPoint : SnapController.instance.snapPoint(draggedPoint, this.componentReference)
			this.dragCallbacks.dragStart(destination, event.detail.event)
			SnapController.instance.recalculateAdditionalSnapPoints()
		}
	}

	/**
	 * Handler for the dragging event. Alters the default behavior to enable snapping to grid and to other components.
	 *
	 * @private
	 * @param {DragEvent} event - the dragging event.
	 */
	dragMove(event: DragEvent) {
		event.preventDefault()

		if (window.TouchEvent && event.detail.event instanceof TouchEvent && event.detail.event.touches.length > 1) {
			this.didDrag = true
			this.dragEnd(event, true)
			return
		}

		this.didDrag = true

		const draggedPoint = new SVG.Point(event.detail.box.cx, event.detail.box.cy)

		let shiftKey = event.detail.event.shiftKey
		let destination =
			shiftKey ? draggedPoint : SnapController.instance.snapPoint(draggedPoint, this.componentReference)

		SnapController.instance.showSnapPoints(!shiftKey)

		if (this.dragCallbacks && this.dragCallbacks.dragMove) {
			this.dragCallbacks.dragMove(destination, event.detail.event)
		}
		SnapController.instance.recalculateAdditionalSnapPoints()
	}

	/**
	 * Listener for the "dragend" event. Undo the cursor change from {@link "#dragStart"}.
	 * @param {DragEvent} event
	 */
	dragEnd(event: DragEvent, trackState = true) {
		if (!this.startedDragging) {
			return
		}
		currentlyDragging = null

		if (!this.didDrag) {
			// didn't move at all -> essentially clicked the component --> select the component instead
			let ctrlCommand =
				event.detail.event.ctrlKey || (MainController.instance.isMac && event.detail.event.metaKey)
			let selectionMode =
				event.detail.event.shiftKey ? SelectionMode.ADD
				: ctrlCommand ? SelectionMode.SUB
				: SelectionMode.RESET

			if (
				selectionMode == SelectionMode.RESET &&
				SelectionController.instance.currentlySelectedComponents.includes(this.componentReference) &&
				SelectionController.instance.currentlySelectedComponents.length > 1
			) {
				SelectionController.instance.setReference(this.componentReference)
			} else {
				SelectionController.instance.selectComponents([this.componentReference], selectionMode)
			}
			trackState = false
		}

		this.didDrag = false
		this.startedDragging = false
		this.element.node.classList.remove("dragging")
		this.element.parent().node.classList.remove("dragging")

		SnapController.instance.showSnapPoints(false)

		let shouldUndo = false
		if (this.dragCallbacks && this.dragCallbacks.dragEnd) {
			shouldUndo = this.dragCallbacks.dragEnd()
		}

		this.componentReference.recalculateSnappingPoints()

		if (trackState && shouldUndo) {
			Undo.addState()
		}
	}
}
