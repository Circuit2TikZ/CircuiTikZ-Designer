// @ts-check
/**
 * @module LineDrawer
 */

import * as SVG from "@svgdotjs/svg.js";

import FABcontroller from "./fabController";
import CanvasController from "./canvasController";

/**
 * @class
 */
export default class LineDrawer {
	/** @type {HTMLAnchorElement} */
	#toggleModeLink;
	/** @type {boolean} */
	#lineDrawModeActive = false;
	/** @type {CanvasController} */
	#canvasController;
	/** @type {number} */
	#clickCount = 0;

	/** @type {?SVG.PointArray} */
	#pointsArray;
	/** @type {?SVG.Polyline} */
	#polyline;

	/** @type {number[]} */
	#lastPoint;
	/** @type {number[]} */
	#cornerPoint;
	/** @type {number[]} */
	#mousePoint;

	/** @type {boolean} */
	#holdX = false;
	/** @type {boolean} */
	#holdDirectionSet = false;
	/** @type {{up: boolean, right: boolean, down: boolean, left: boolean}} */
	#lineDirection = { up: false, right: false, down: false, left: false };

	/**
	 *
	 * @param {CanvasController} canvasController
	 */
	constructor(canvasController) {
		/** @type {HTMLAnchorElement} */ // @ts-ignore
		this.#toggleModeLink = document.getElementById("drawLineButton");
		this.#toggleModeLink.addEventListener("click", this.#toggleMode.bind(this));

		this.#canvasController = canvasController;
	}

	#toggleMode() {
		this.#lineDrawModeActive = !this.#lineDrawModeActive;
		this.#toggleModeLink.textContent = this.#lineDrawModeActive ? "drag_pan" : "shape_line";

		if (this.#lineDrawModeActive) {
			// activate
			this.#resetVars();
			this.#canvasController.canvas.on("click", this.#clickListener, this);

			// init FAB
			FABcontroller.controller.setButtons(
				{
					icon: "done",
					buttonClass: "btn-success",
					onclick: this.#onOK.bind(this),
				},
				[
					{
						icon: "close",
						buttonClass: "btn-danger",
						onclick: this.#onCancel.bind(this),
					},
				]
			);
		} else {
			// deactivate
			this.#onCancel();
			this.#canvasController.canvas.off("click", this.#clickListener);
		}
	}

	/**
	 * @param {MouseEvent} event
	 * @returns {SVG.Point}
	 */
	#mouseEventToPoint(event) {
		const pt = new SVG.Point(event.clientX, event.clientY);
		return pt.transform(this.#canvasController.canvas.screenCTM().inverse());
	}

	/**
	 *
	 * @param {MouseEvent} event
	 */
	#clickListener(event) {
		this.#clickCount++;
		let pt = this.#mouseEventToPoint(event);
		console.log(event, pt);
		const ptArray = pt.toArray();

		if (this.#clickCount === 1) {
			this.#pointsArray = new SVG.PointArray([ptArray, ptArray, ptArray]);
			this.#lastPoint = this.#pointsArray[0];
			this.#cornerPoint = this.#pointsArray[1];
			this.#mousePoint = this.#pointsArray[2];
			this.#polyline = this.#canvasController.canvas.polyline(this.#pointsArray).fill("none").stroke("#000");
			this.#canvasController.canvas.on("mousemove", this.#moveListener, this);
		} else {
			this.#recalcPoints(pt);
			this.#pointsArray.push(ptArray, [...ptArray]);
			let index = this.#pointsArray.length;
			this.#mousePoint = this.#pointsArray[--index];
			this.#cornerPoint = this.#pointsArray[--index];
			this.#lastPoint = this.#pointsArray[--index];
			const secondLastPoint = this.#pointsArray[--index];
			this.#holdDirectionSet = false;

			this.#lineDirection.up = this.#lastPoint[1] < secondLastPoint[1];
			this.#lineDirection.right = this.#lastPoint[0] > secondLastPoint[0];
			this.#lineDirection.down = this.#lastPoint[1] > secondLastPoint[1];
			this.#lineDirection.left = this.#lastPoint[0] < secondLastPoint[0];
		}
		this.#polyline.plot(this.#pointsArray);

		if (this.#clickCount > 1) FABcontroller.controller.visible = true;
	}

	#onOK() {
		this.#lineEnd();
	}

	#lineEnd() {
		// remove last (non confirmed) corner and mouse points
		this.#pointsArray.splice(this.#pointsArray.length - (this.#cornerPoint ? 1 : 0) - (this.#mousePoint ? 1 : 0));
		this.#polyline.plot(this.#pointsArray);

		// unregister move listener
		this.#canvasController.canvas.off("mousemove", this.#moveListener);

		// todo: save line to list

		this.#resetVars();
		FABcontroller.controller.visible = false;
	}

	#onCancel() {
		if (this.#polyline) this.#polyline.remove();
		this.#resetVars();
		FABcontroller.controller.visible = false;
	}

	#resetVars() {
		this.#mousePoint = null;
		this.#cornerPoint = null;
		this.#lastPoint = null;
		this.#clickCount = 0;
		this.#pointsArray = null;
		this.#polyline = null;
		this.#holdDirectionSet = false;

		this.#lineDirection.up = false;
		this.#lineDirection.right = false;
		this.#lineDirection.down = false;
		this.#lineDirection.left = false;
	}

	/**
	 *
	 * @param {MouseEvent} event
	 */
	#moveListener(event) {
		if (this.#mousePoint) {
			let pt = this.#mouseEventToPoint(event);
			this.#recalcPoints(pt);
			this.#polyline.plot(this.#pointsArray);
		}
	}

	/**
	 *
	 * @param {SVG.Point} newPoint
	 */
	#recalcPoints(newPoint) {
		// TODO snap new point here

		// try to get quadrant change
		const isAboveXAxis = newPoint.y < this.#lastPoint[1];
		const isRightOfYAxis = newPoint.x > this.#lastPoint[0];

		if (this.#holdDirectionSet) {
			// change direction if mouse position crosses the horizontal or vertical position of the last point
			const wasAboveXAxis = this.#mousePoint[1] < this.#lastPoint[1];
			const wasRightOfYAxis = this.#mousePoint[0] > this.#lastPoint[0];

			if (wasAboveXAxis !== isAboveXAxis) {
				this.#holdX = false;
			} else if (wasRightOfYAxis !== isRightOfYAxis) {
				this.#holdX = true;
			}
		} else {
			// no initial direction set --> evaluate delta to last point
			const deltaX = this.#mousePoint[0] - this.#lastPoint[0];
			const deltaY = this.#mousePoint[1] - this.#lastPoint[1];
			this.#holdX = deltaX > deltaY;
			this.#holdDirectionSet = true;
		}

		// no parallel line to the old one, if any
		if ((this.#lineDirection.left && isRightOfYAxis) || (this.#lineDirection.right && !isRightOfYAxis))
			this.#holdX = true;
		else if ((this.#lineDirection.down && isAboveXAxis) || (this.#lineDirection.up && !isAboveXAxis))
			this.#holdX = false;

		// actually calculate the corner point
		if (this.#holdX) {
			this.#cornerPoint[0] = this.#lastPoint[0];
			this.#cornerPoint[1] = newPoint.y;
		} else {
			this.#cornerPoint[0] = newPoint.x;
			this.#cornerPoint[1] = this.#lastPoint[1];
		}

		this.#mousePoint[0] = newPoint.x;
		this.#mousePoint[1] = newPoint.y;
	}
}
