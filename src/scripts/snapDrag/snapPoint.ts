/**
 * @module snapPoint
 */

import { Point, Matrix } from "@svgdotjs/svg.js";
import { CircuitComponent } from "../internal";

/**
 * Realizes a point which is relative to another point. This can be used to recreate CircuiTikZ anchors, which are
 * relative to components. This is useful for snap points.
 */
export class SnapPoint extends Point {
	private componentReference: CircuitComponent; // to which component this snapPoint belongs
	private anchorName: string; // the name of the snap point (i.e. G, D, S, center...)
	private relPosition: Point; // the position of this snapPoint relative to the component center
	
	constructor(componentReference: CircuitComponent, anchorName: string, relPosition: Point) {
		super();
		this.componentReference = componentReference;
		this.anchorName = anchorName;
		this.relPosition = relPosition;
		this.recalculate();
	}

	

	/**
	 * Recalculate the position if the position or angle of the instance changed.
	 *
	 * @param {?Point} [newMid] - the anchor/mid point, if changed; no need to set if the point instance hasn't changed
	 * @param {?number} [angle] - the new angle, if changed
	 * @param {?Point} [flip] - the flip vector
	 */
	public recalculate(transformMatrix?: Matrix) {
		if (!transformMatrix) {
			transformMatrix = this.componentReference.getTransformMatrix()
		}		
		let pt = this.relPosition.transform(transformMatrix)
		this.x = pt.x
		this.y = pt.y
	}

	public relToComponentAnchor(): Point{
		return this.minus(this.componentReference.position)
	}
}
