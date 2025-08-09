/**
 * @module snapCursorController
 */

import * as SVG from "@svgdotjs/svg.js"
import { CanvasController } from "../internal"

/**
 * Realizes an in canvas cursor. Can be used to visualize the point to snap to.
 * @class
 */
export class SnapCursorController {
	private static _instance: SnapCursorController
	public static get instance(): SnapCursorController {
		if (!SnapCursorController._instance) {
			SnapCursorController._instance = new SnapCursorController()
		}
		return SnapCursorController._instance
	}

	private cursorViewBox: SVG.Box
	private cursor: SVG.Use

	constructor() {
		const cursorSymbol = new SVG.Symbol(document.getElementById("snapCursor"))
		this.cursor = CanvasController.instance.canvas.use(cursorSymbol)
		this.cursor.id("snapCursorUse")
		this.cursorViewBox = cursorSymbol.viewbox()
		this.cursor.width(this.cursorViewBox.width)
		this.cursor.height(this.cursorViewBox.height)
		// CanvasController.instance.canvas.add(this.cursor);
		this.cursor.hide()
	}

	/**
	 * Moves the cursor to a new position.
	 *
	 * @param {SVG.Point} position - the new position
	 */
	moveTo(position: SVG.Point) {
		this.cursor.center(position.x, position.y)
	}

	/**
	 * Show or hide the cursor.
	 *
	 * @param {boolean} b - the visibility
	 */
	set visible(b: boolean) {
		if (b) this.cursor.show()
		else this.cursor.hide()
	}

	/**
	 * Get the visibility.
	 *
	 * @returns {boolean} the visibility
	 */
	get visible(): boolean {
		return this.cursor.visible()
	}
}
