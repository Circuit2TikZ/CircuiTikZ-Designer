/**
 * @module snapPoint
 */

import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent } from "../internal";

/**
 * Realizes a point which is relative to another point. This can be used to recreate CircuiTikZ anchors, which are
 * relative to components. This is useful for snap points.
 */
export class SnapPoint extends SVG.Point {
	private componentReference: CircuitComponent; // to which component this snapPoint belongs
	private anchorName: string; // the name of the snap point (i.e. G, D, S, center...)
	private relPosition: SVG.Point; // the position of this snapPoint relative to the component center
	private relPositionTransformed: SVG.Point; // the position of this snapPoint relative to the component center

	private element: SVG.Element
	
	constructor(componentReference: CircuitComponent, anchorName: string, relPosition: SVG.Point) {
		super();
		this.componentReference = componentReference;
		this.anchorName = anchorName;
		this.relPosition = relPosition;
		this.recalculate();
	}

	public recalculate(transformMatrix: SVG.Matrix = this.componentReference.getSnapPointTransformMatrix()) {
		this.relPositionTransformed = this.relPosition.transform(transformMatrix)
		this.x = this.relPositionTransformed.x + this.componentReference.position.x
		this.y = this.relPositionTransformed.y + this.componentReference.position.y
	}

	public updateRelPosition(relPosition:SVG.Point){
		this.relPosition = relPosition
	}

	public relToComponentAnchor(): SVG.Point{
		return this.relPositionTransformed
	}
}
