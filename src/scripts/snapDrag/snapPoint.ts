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
	private relPositionTransformed: Point; // the position of this snapPoint relative to the component center
	
	constructor(componentReference: CircuitComponent, anchorName: string, relPosition: Point) {
		super();
		this.componentReference = componentReference;
		this.anchorName = anchorName;
		this.relPosition = relPosition;
		this.recalculate();
	}

	public recalculate(transformMatrix?: Matrix) {
		if (!transformMatrix) {
			transformMatrix = new Matrix({
				rotate:-this.componentReference.rotationDeg,
				scaleX:this.componentReference.flipState.x,
				scaleY:this.componentReference.flipState.y
			})
		}
		
		this.relPositionTransformed = this.relPosition.transform(transformMatrix)
		this.x = this.relPositionTransformed.x + this.componentReference.position.x
		this.y = this.relPositionTransformed.y + this.componentReference.position.y
	}

	public updateRelPosition(relPosition:Point){
		this.relPosition = relPosition
	}

	public relToComponentAnchor(): Point{
		return this.relPositionTransformed
	}
}
