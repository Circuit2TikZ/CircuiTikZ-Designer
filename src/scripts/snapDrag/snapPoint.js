/**
 * @module snapPoint
 */

import { Point, Matrix } from "@svgdotjs/svg.js";

/** @typedef {Point|{x: number, y: number}|[number, number]} PointAlike */

/**
 * @callback SnapPointChangeListener
 * @param {SnapPoint} snapPoint - the changed point
 * @param {number} oldX - the old x coordinate
 * @param {number} oldY - the old y coordinate
 * @param {boolean} isDeleted - `true` if the change is the deletion of the corresponding node
 * @returns {*}
 */

/**
 * Realizes a point which is relative to another point. This can be used to recreate CircuiTikZ anchors, which are
 * relative to components. This is useful for snap points.
 * @class
 */
export class SnapPoint extends Point {
	/** @type {?{nodeName: string}} */
	#instance;
	/** @type {?string} */
	#anchorName;
	/** @type {PointAlike} */
	#midPoint;
	/** @type {PointAlike} */
	#relPosition;
	/** @type {number} */
	#angle;
	/** @type {boolean} */
	#inDegree;

	/** @type {SnapPointChangeListener[]} */
	#changeListeners = [];
	
	// For understanding: mid and relPosition are given by reference: don't have to be updated for recalculate if their references are still valid.
	// TODO Should change in the future since this could easily cause hard to find bugs
	/**
	 * Create a new SnapPoint.
	 *
	 * @param {?{nodeName?: string, mid?: PointAlike}} instance - the instance this point is relative to; used to get the node name and/or the mid point
	 * @param {?string} anchorName - the anchor name; used for serializing to TikZ code
	 * @param {PointAlike} [mid] - the mid point this point is relative to
	 * @param {PointAlike} relPosition - the distance (x, y) from the mid
	 * @param {number} [angle=0] - the angle to rotate the relPosition around the mid point
	 * @param {boolean} [inDegree=false] - set to `true`, if the specified angle is in degrees instead of rad
	 */
	constructor(instance, anchorName, mid, relPosition, angle = 0, inDegree = false) {
		super();
		this.#instance = instance;
		this.#anchorName = anchorName;
		this.#relPosition = relPosition;
		this.#inDegree = inDegree;
		this.recalculate(mid || this.#instance.mid, angle, new Point(1,1));
	}

	/**
	 * Recalculate the position if the position or angle of the instance changed.
	 *
	 * @param {?Point} [newMid] - the anchor/mid point, if changed; no need to set if the point instance hasn't changed
	 * @param {?number} [angle] - the new angle, if changed
	 * @param {?Point} [flip] - the flip vector
	 */
	recalculate(newMid, angle, flip) {
		if (newMid) this.#midPoint = newMid;
		if (angle || angle === 0) this.#angle = angle;

		const relPos = this.#asPoint(this.#relPosition)
		const mid = this.#asPoint(this.#midPoint)

		let angle_deg = this.#inDegree? this.#angle: (this.#angle * 180) / Math.PI
		let m = new Matrix({
			rotate:-angle_deg,
			translate:[mid.x,mid.y],
			scaleX:flip.x,
			scaleY:flip.y
		})
		
		const oldX = this.x, oldY = this.y;

		let pt = relPos.transform(m)
		this.x = pt.x
		this.y = pt.y
		
		for (const listener of this.#changeListeners) listener(this, oldX, oldY, false);
	}

	#asPoint(pointlike){
		return Array.isArray(pointlike)? new Point(pointlike[0],pointlike[1]):new Point(Number(pointlike.x),Number(pointlike.y));
	}

	/**
	 * calculates the delta of this snapPoint from the instance anchor (point-anchor)
	 * @returns {SVG.Point} 
	 */
	relToComponentAnchor(){
		return this.#asPoint(this.#relPosition).plus(this.#asPoint(this.#midPoint)).minus(this.#instance.getAnchorPoint())
	}

	/**
	 * Called by the instance, when it gets removed. The changeListeners will be informed.
	 */
	removeInstance() {
		for (const listener of this.#changeListeners) listener(this, this.x, this.y, true);
		this.#instance = null;
		this.#anchorName = null;
	}

	/**
	 * Add a listener to get informed if the position changed or the instance got removed.
	 *
	 * @param {SnapPointChangeListener} listener - the change listener
	 */
	addChangeListener(listener) {
		this.#changeListeners.push(listener);
	}

	/**
	 * Remove a previously added listener.
	 *
	 * @param {SnapPointChangeListener} listener - the change listener
	 */
	removeChangeListener(listener) {
		const index = this.#changeListeners.indexOf(listener);
		if (index >= 0) this.#changeListeners.splice(index, 1);
	}

	/**
	 * Formats the point for usage with (Circui)TikZ.
	 *
	 * Uses the associated node and anchor name, if set. Alternatively converts from px to cm and rounds to 2 digits
	 * after the decimal point.
	 *
	 * @returns {string} the TikZ representation, e.g. "(MyTransistor.G)" or "(0.1, 1.23)"
	 */
	toTikzString() {
		return this.#instance?.nodeName && this.#anchorName
			? `${this.#instance.nodeName}.${this.#anchorName}`
			: super.toTikzString();
	}
}
