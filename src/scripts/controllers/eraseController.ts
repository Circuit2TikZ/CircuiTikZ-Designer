import * as SVG from "@svgdotjs/svg.js"

import { MainController, CanvasController, Undo } from "../internal"

/**
 * Controller for the erase function/mode.
 */
export class EraseController {
	private static _instance: EraseController

	private constructor() {
		this.moveStart = this.moveStart.bind(this)
		this.moveListener = this.moveListener.bind(this)
		this.addUndo = this.addUndo.bind(this)
	}

	public static get instance(): EraseController {
		if (!EraseController._instance) {
			EraseController._instance = new EraseController()
		}
		return EraseController._instance
	}

	private dragging = false
	private didErase = false

	public deactivate() {
		// unregister move listener
		CanvasController.instance.canvas.node.classList.remove("eraseCursor")

		CanvasController.instance.canvas.off("mousedown", this.moveStart)
		CanvasController.instance.canvas.off("touchdown", this.moveStart)

		CanvasController.instance.canvas.off("mousemove", this.moveListener)
		CanvasController.instance.canvas.off("touchmove", this.moveListener)

		CanvasController.instance.canvas.off("mouseup", this.addUndo)
		CanvasController.instance.canvas.off("touchend", this.addUndo)
	}

	public activate() {
		CanvasController.instance.canvas.node.classList.add("eraseCursor")

		CanvasController.instance.canvas.on("mousedown", this.moveStart)
		CanvasController.instance.canvas.on("touchstart", this.moveStart)

		CanvasController.instance.canvas.on("mousemove", this.moveListener)
		CanvasController.instance.canvas.on("touchmove", this.moveListener)

		CanvasController.instance.canvas.on("mouseup", this.addUndo)
		CanvasController.instance.canvas.on("touchend", this.addUndo)
	}

	private moveStart(event: MouseEvent | TouchEvent) {
		if (event instanceof MouseEvent && event.button !== 0) {
			return
		}

		if (window.TouchEvent && event instanceof TouchEvent && event.touches.length !== 1) {
			return
		}
		this.dragging = true
	}

	private moveListener(event: MouseEvent | TouchEvent) {
		if (!this.dragging) {
			return
		}

		if (
			(event instanceof MouseEvent &&
				(event.buttons & 1 || (event.type !== "mousemove" && event.button === 0))) ||
			(window.TouchEvent && event instanceof TouchEvent && window.TouchEvent && event.touches.length === 1)
		) {
			this.findAndErase(CanvasController.eventToPoint(event, false))
		}
	}

	private addUndo(event: MouseEvent | TouchEvent) {
		if (event instanceof MouseEvent && event.button !== 0) {
			return
		}
		if (window.TouchEvent && event instanceof TouchEvent && event.touches.length !== 0) {
			return
		}
		if (this.didErase) {
			Undo.addState()
			this.didErase = false
		}
		this.dragging = false
	}

	private findAndErase(pos: SVG.Point) {
		let intersectionRect = new SVG.Box(pos.x - 5, pos.y - 5, 10, 10)
		for (const component of MainController.instance.circuitComponents) {
			if (component.isInsideSelectionRectangle(intersectionRect)) {
				MainController.instance.removeComponent(component)
				this.didErase = true
				break
			}
		}
	}
}
