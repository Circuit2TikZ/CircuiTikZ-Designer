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
	public componentReference: CircuitComponent; // to which component this snapPoint belongs
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

		if (this.element) {
			let bbox = this.element.bbox()
			this.element.move(this.x-bbox.w/2,this.y-bbox.h/2);
		}
	}

	public updateRelPosition(relPosition:SVG.Point){
		this.relPosition = relPosition
	}

	public relToComponentAnchor(): SVG.Point{
		return this.relPositionTransformed
	}

	public show(show=true,moving=false){
		if (show) {
			if (!this.element) {
				const container = CanvasController.instance.canvas;
				this.element = container.circle(4).fill("none").stroke({color:moving?"green":"red",width:1})
				container.add(this.element);
				let bbox = this.element.bbox()
				this.element.move(this.x-bbox.w/2,this.y-bbox.h/2);
			}
		}else{
			this.element?.remove()
			this.element=null
		}
	}
}
