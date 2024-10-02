/**
 * @module snapCursorController
 */

import * as SVG from "@svgdotjs/svg.js";

/**
 * Realizes an in canvas cursor. Can be used to visualize the point to snap to.
 * @class
 */
export class SnapCursorController {
	static #instance: SnapCursorController | null;
	#cursorViewBox: SVG.Box;
	cursor: SVG.Use;

	/**
	 * Called only once by index.js. Use {@link controller} to get the instance.
	 *
	 * @param {SVG.Container} container
	 */
	constructor(container: SVG.Container) {
		SnapCursorController.#instance = this;

		const cursorSymbol = new SVG.Symbol(document.getElementById("snapCursor"));
		this.cursor = new SVG.Use();
		this.cursor.id("snapCursorUse")
		this.cursor.use(cursorSymbol);
		this.#cursorViewBox = cursorSymbol.viewbox();
		this.cursor.width(this.#cursorViewBox.width);
		this.cursor.height(this.#cursorViewBox.height);
		container.add(this.cursor);
		this.cursor.hide();
	}

	/**
	 * Returns the instance
	 *
	 * @returns {SnapCursorController}
	 */
	static get controller(): SnapCursorController {
		return SnapCursorController.#instance;
	}

	/**
	 * Moves the cursor to a new position.
	 *
	 * @param {SVG.Point} position - the new position
	 */
	moveTo(position: SVG.Point) {
		this.cursor.move(position.x - this.#cursorViewBox.cx, position.y - this.#cursorViewBox.cy);
	}

	/**
	 * Show or hide the cursor.
	 *
	 * @param {boolean} b - the visibility
	 */
	set visible(b: boolean) {
		if (b) this.cursor.show();
		else this.cursor.hide();
	}

	/**
	 * Get the visibility.
	 *
	 * @returns {boolean} the visibility
	 */
	get visible(): boolean {
		return this.cursor.visible();
	}
}
