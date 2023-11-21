// @ts-check
/**
 * @module eraseController
 */

import * as SVG from "@svgdotjs/svg.js";

import Line from "../lines/line";

/** @typedef {import("../components/componentInstance").ComponentInstance} ComponentInstance */
/** @typedef {import("./mainController").default} MainController */

/**
 * Controller for the erase function/mode.
 * @class
 */
export default class EraseController {
	/** @type {MainController} */
	#mainController;
	/** @type {SVG.Svg} */
	#canvas;

	/**
	 * Init the EraseController
	 * @param {MainController} mainController - needed for removing instances & lines
	 */
	constructor(mainController) {
		this.#mainController = mainController;
		this.#canvas = this.#mainController.canvasController.canvas;
	}

	/**
	 * Deactivate the erasing feature temporary.
	 *
	 * Removes listeners from the canvas.
	 */
	deactivate() {
		// unregister move listener
		this.#canvas.off("mousemove", this.#moveListener);
		this.#canvas.off("click", this.#clickListener);
		this.#canvas.node.classList.remove("eraseCursor");
	}

	/**
	 * Activate the erasing feature.
	 *
	 * Adds listeners to the canvas.
	 */
	activate() {
		this.#canvas.on("click", this.#clickListener, this);
		this.#canvas.on("mousemove", this.#moveListener, this);
		this.#canvas.node.classList.add("eraseCursor");
	}

	/**
	 * Listener for clicks to erase components/lines. Triggers erasing.
	 *
	 * @param {MouseEvent} event
	 */
	#clickListener(event) {
		let pt = this.#mainController.canvasController.pointerEventToPoint(event);
		this.#findAndErase(pt, event.target);
	}

	/**
	 * Listener for mouse movements. Triggers erasing, if the main button is pressed.
	 *
	 * @param {MouseEvent} event
	 */
	#moveListener(event) {
		// Drag --> Drag-erase
		if (event.buttons & 1)
			this.#findAndErase(this.#mainController.canvasController.pointerEventToPoint(event), event.target);
	}

	/**
	 * Find instances and lines around the point and removes them. One call only removes one instance/line.
	 *
	 * @param {SVG.Point} point - the point used to find a nearby line/instance
	 * @param {EventTarget} target - the target of the event, which triggered the removal. Maybe the user clicked exactly on a line
	 */
	#findAndErase(point, target) {
		let lowestDist = 10; // ~ 0.27 cm
		/** @type {?ComponentInstance|Line} */
		let foundElement = null;

		// Try to get element by click/touch target
		if (target && target instanceof SVGElement) {
			// @ts-ignore there is no better/more type-safe alternative to parentElement
			for (let elm = target; elm instanceof SVGElement; elm = elm.parentElement) {
				if (
					// @ts-ignore wr check if .instance exists
					elm.instance && // @ts-ignore instance exists --> no error
					(this.#mainController.instances.includes(elm.instance) || // @ts-ignore instance exists --> no error
						this.#mainController.lines.includes(elm.instance))
				) {
					// @ts-ignore instance exists --> no error
					foundElement = elm.instance;
					break;
				}
			}
		}

		if (!foundElement) {
			// try to get line by location
			for (const line of this.#mainController.lines) {
				const dist = line.pointDistance(point, lowestDist);
				if (dist !== null && dist < lowestDist) {
					lowestDist = dist;
					foundElement = line;
				}
			}
		}

		if (foundElement && foundElement instanceof Line) {
			this.#mainController.removeLine(foundElement);
		} else if (foundElement) {
			// @ts-ignore if its not a line, it must be a instance
			this.#mainController.removeInstance(foundElement);
		}
	}
}
