/**
 * @module line
 */

import * as SVG from "@svgdotjs/svg.js";
import { lineRectIntersection, pointInsideRect, selectedWireWidth } from "../utils/selectionHelper";

/// <reference path="../utils/impSVGNumber.d.ts" />
/** @typedef {import("../snapDrag/snapPoint")} SnapPoint */

/**
 * @property {SVG.PointArray} _array
 */
export default class Line extends SVG.Polyline {
	/**
	 * @typedef {object} DirectionType
	 * @property {string} tikzName - the TikZ draw command
	 */
	/**
	 * Enum for the possible TikZ line draw commands.
	 * @readonly
	 * @enum {DirectionType}
	 */
	static Direction = {
		STRAIGHT: { tikzName: "--" },
		HORIZONTAL_VERTICAL: { tikzName: "-|" },
		VERTICAL_HORIZONTAL: { tikzName: "|-" },
	};

	/** @type {(SVG.Point|SnapPoint|Direction)[]} */
	#drawCommands = [];

	/** @type {?SVG.Point} */
	#lastPoint;
	/** @type {?number[]} */
	#cornerPoint;
	/** @type {?number[]} */
	#mousePoint;

	/**
	 *
	 * @param {SVG.Point|SnapPoint} firstPoint
	 */
	constructor(firstPoint) {
		super();

		this.onPointChange = this.onPointChange.bind(this);

		// @ts-ignore
		if (firstPoint.addChangeListener) firstPoint.addChangeListener(this.onPointChange);

		this.#drawCommands.push((this.#lastPoint = firstPoint));

		const ptArray = firstPoint.toArray();
		this.plot([ptArray, ptArray, ptArray]);
		// @ts-ignore _array not declared in svg.js.d.ts
		this.#cornerPoint = this._array[1];
		// @ts-ignore _array not declared in svg.js.d.ts
		this.#mousePoint = this._array[2];

		this.attr({
			fill: "none",
			stroke: "#000",
			"stroke-width": "0.4pt",
		});
	}

	/**
	 * Redraw the line using the points array (`_array`). This sets the "points" attribute.
	 */
	#redraw() {
		// @ts-ignore _array not declared in svg.js.d.ts
		this.attr("points", this._array.toString());
	}

	/**
	 * Permanently add a new point. This is useful for drawing lines.
	 *
	 * @param {boolean} horizontalFirst - set to `true`, if the first line part should be horizontal followed by a vertical line
	 * @param {SVG.Point} point - the new (snapped) mouse point
	 */
	pushPoint(horizontalFirst = true, point) {
		if (this.#lastPoint.x == point.x && this.#lastPoint.y == point.y) return;

		// @ts-ignore
		if (point.addChangeListener) point.addChangeListener(this.onPointChange);

		this.updateMousePoint(horizontalFirst, point);
		this.#cornerPoint = point.toArray();
		this.#mousePoint = point.toArray();
		// @ts-ignore _array not declared in svg.js.d.ts
		this._array.push(this.#cornerPoint, this.#mousePoint);

		if (this.#lastPoint.x == point.x || this.#lastPoint.y == point.y) {
			this.#drawCommands.push(Line.Direction.STRAIGHT, point);
		} else if (horizontalFirst) this.#drawCommands.push(Line.Direction.HORIZONTAL_VERTICAL, point);
		else this.#drawCommands.push(Line.Direction.VERTICAL_HORIZONTAL, point);

		this.#lastPoint = point;
	}

	/**
	 * 
	 * @param {SVG.Box} selectionRectangle 
	 */
	isInsideSelectionRectangle(selectionRectangle){
		let allPointsInside = pointInsideRect(this._array[0],selectionRectangle);
		for (let idx = 0; idx < this._array.length-1; idx++) {
			let p2 = this._array[idx+1];
			let lineSegment = [this._array[idx],p2];

			if (allPointsInside) {
				allPointsInside = pointInsideRect(p2,selectionRectangle)
			}

			if (lineRectIntersection(lineSegment, selectionRectangle)) {
				return true;
			}
		}

		return allPointsInside;
	}

	showBoundingBox(){
		this.attr({
			"stroke-width": selectedWireWidth,
		});
	}

	hideBoundingBox(){
		this.attr({
			"stroke-width": "0.4pt",
		});
	}

	/**
	 * Updates the "mouse point" if the mouse position changed. This is useful for drawing lines.
	 *
	 * @param {boolean} horizontalFirst - set to `true`, if the first line part should be horizontal followed by a vertical line
	 * @param {SVG.Point} point - the new (snapped) mouse point
	 */
	updateMousePoint(horizontalFirst, point) {
		// actually calculate the corner point
		if (horizontalFirst) {
			this.#cornerPoint[0] = point.x;
			this.#cornerPoint[1] = this.#lastPoint.y;
		} else {
			this.#cornerPoint[0] = this.#lastPoint.x;
			this.#cornerPoint[1] = point.y;
		}

		this.#mousePoint[0] = point.x;
		this.#mousePoint[1] = point.y;

		this.#redraw();
	}

	/**
	 * Removes the last edge point and the mouse point. Use this to finish th line drawing.
	 * Neither {@link updateMousePoint} nor {@link pushPoint} may be used afterwards.
	 */
	removeMousePoint() {
		// @ts-ignore _array not declared in svg.js.d.ts
		this._array.splice(this._array.length - 2, 2);
		this.#lastPoint = null;
		this.#cornerPoint = null;
		this.#mousePoint = null;
		this.#redraw();
	}

	/**
	 * Removes a line from the canvas.
	 *
	 * @returns {this}
	 */
	remove() {
		// Clean up listeners
		for (const dc of this.#drawCommands) {
			// @ts-ignore
			if (dc.removeChangeListener) dc.removeChangeListener(this.onPointChange);
		}
		super.remove();
		return this;
	}

	/**
	 * Listener for changes of `SnapPoint`s. If a (relative) point position changes, it is replaced with an absolute
	 * one.
	 *
	 * @type {import("../snapDrag/snapPoint").SnapPointChangeListener}
	 */
	onPointChange(snapPoint, oldX, oldY, _isDeleted) {
		const replacementPoint = new SVG.Point(oldX, oldY);
		for (let i = 0; i < this.#drawCommands.length; i++) {
			const oldPoint = this.#drawCommands[i];
			if (oldPoint === snapPoint || (oldPoint.x === oldX && oldPoint.y === oldY)) {
				this.#drawCommands[i] = replacementPoint;
				snapPoint.removeChangeListener(this.onPointChange);
			}
		}
	}

	/**
	 *
	 * @param {SVG.Point} pt
	 * @param {number} [maxDistance=Number.MAX_VALUE]
	 * @returns {?number}
	 */
	pointDistance(pt, maxDistance = Number.MAX_VALUE) {
		// is bounding box near enough to the point?
		/** @type {SVG.Box} */
		const bbox = this.bbox();
		if (
			!(
				pt.x >= bbox.x - maxDistance &&
				pt.x <= bbox.x2 + maxDistance &&
				pt.y >= bbox.y - maxDistance &&
				pt.y <= bbox.y2 + maxDistance
			)
		)
			return null;

		let minDistanceSquared = maxDistance === Number.MAX_VALUE ? Number.MAX_VALUE : maxDistance ** 2;

		/** @type {SVG.Point[]} */
		let linePoints = this._array.map((p) => new SVG.Point(p));
		let lastPoint = linePoints.shift();
		for (const linePoint of linePoints) {
			const dist = this.#linePointDistanceSquared(pt, lastPoint, linePoint);
			if (dist < minDistanceSquared) minDistanceSquared = dist;
			lastPoint = linePoint;
		}

		minDistanceSquared = Math.sqrt(minDistanceSquared);

		return minDistanceSquared < maxDistance ? minDistanceSquared : null;
	}

	/**
	 *
	 * @param {SVG.Point} pt
	 * @param {SVG.Point} lineStart
	 * @param {SVG.Point} lineEnd
	 * @returns {number}
	 */
	#linePointDistanceSquared(pt, lineStart, lineEnd) {
		if (lineStart.x === lineEnd.x && lineStart.y === lineEnd.y) return pt.distanceSquared(lineStart);

		/** @type {SVG.Point} */
		const lineVector = lineEnd.minus(lineStart); // lineEnd - lineStart
		/** @type {SVG.Point} */
		const helpVector = pt.minus(lineStart); // this - lineStart

		// 0 = lineStart ... 1 = lineEnd
		const lambda =
			(lineVector.x * helpVector.x + lineVector.y * helpVector.y) / (lineVector.x ** 2 + lineVector.y ** 2);

		if (lambda <= 0)
			return pt.distanceSquared(lineStart); // Point before line
		else if (lambda >= 1) return pt.distanceSquared(lineEnd); // Point after line

		// orthogonalProjection: lineVector * lambda + lineStart
		return (lineVector.x * lambda + lineStart.x - pt.x) ** 2 + (lineVector.y * lambda + lineStart.y - pt.y) ** 2;
	}

	/**
	 * Stringifies the Line in TikZ syntax.
	 * @returns {string}
	 */
	toTikzString() {
		return (
			"\\draw " +
			this.#drawCommands
				.map((dc) => {
					// @ts-ignore
					if (dc.toTikzString) return dc.toTikzString();
					// @ts-ignore
					else if (dc.tikzName) return dc.tikzName;
					else throw new Error("toTikzString not implemented");
				})
				.join(" ") +
			";"
		);
	}
}
