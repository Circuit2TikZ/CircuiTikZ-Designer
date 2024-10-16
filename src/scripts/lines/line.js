/**
 * @module line
 */

import * as SVG from "@svgdotjs/svg.js";
import { lineRectIntersection, pointInsideRect, selectionColor } from "../utils/selectionHelper";
import {MainController, CanvasController} from "../internal";

/// <reference path="../utils/impSVGNumber.d.ts" />
import SnapPoint from "../internal";

/**
 * @property {SVG.PointArray} _array
 */
export class Line extends SVG.Polyline {
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

	isSelected=false
	
	zIndex = 0

	/**
	 *
	 * @param {SVG.Point|SnapPoint} firstPoint
	 */
	constructor(firstPoint) {
		super();

		this.onPointChange = this.onPointChange.bind(this);

		// @ts-ignore
		// if (firstPoint.addChangeListener) firstPoint.addChangeListener(this.onPointChange);

		this.#drawCommands.push((this.#lastPoint = firstPoint));

		const ptArray = firstPoint.toArray();
		this.plot([ptArray, ptArray, ptArray]);

		this.#cornerPoint = this._array[1];

		this.#mousePoint = this._array[2];

		this.attr({
			fill: "none",
			stroke: MainController.controller.darkMode?"#fff":"#000",
			"stroke-width": "0.4pt",
		});
	}

	updateTheme(){
		if (!this.isSelected) {
			this.stroke(MainController.controller.darkMode?"#fff":"#000");
		}
	}

	getFormEntries(){
		return []
	}

	/**
	 * Redraw the line using the points array (`_array`). This sets the "points" attribute.
	 */
	#redraw() {
		this.attr("points", this._array.toString());
	}

	/**
	 * Permanently add a new point. This is useful for drawing lines.
	 *
	 * @param {DirectionType} direction - in which direction the line moves first or if its a straight line
	 * @param {SVG.Point} point - the new (snapped) mouse point
	 */
	pushPoint(direction = Line.Direction.HORIZONTAL_VERTICAL, point) {
		if (this.#lastPoint.x == point.x && this.#lastPoint.y == point.y) return;
		// @ts-ignore
		// if (point.addChangeListener) point.addChangeListener(this.onPointChange);

		this.updateMousePoint(direction, point);
		
		// remove additional corner point if straight line
		if (direction == Line.Direction.STRAIGHT) {
			this._array.splice(this._array.length-2,1)
		}
		
		this.#cornerPoint = point.toArray();
		this.#mousePoint = point.toArray();
		this._array.push(this.#cornerPoint, this.#mousePoint);

		if (this.#lastPoint.x == point.x || this.#lastPoint.y == point.y) {
			this.#drawCommands.push(Line.Direction.STRAIGHT, point);
		} else{
			this.#drawCommands.push(direction, point);
		} 

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
			"stroke":selectionColor,
			// "stroke-width": selectedWireWidth,
		});
		this.isSelected = true;
	}

	hideBoundingBox(){
		this.attr({
			"stroke":MainController.controller.darkMode?"#fff":"#000",
			// "stroke-width": "0.4pt",
		});
		this.isSelected = false;
	}

	/**
	 * Updates the "mouse point" if the mouse position changed. This is useful for drawing lines.
	 *
	 * @param {DirectionType} direction - in which direction the line moves first or if its a straight line
	 * @param {SVG.Point} point - the new (snapped) mouse point
	 */
	updateMousePoint(direction, point) {
		// actually calculate the corner point
		if (direction===Line.Direction.HORIZONTAL_VERTICAL) {
			this.#cornerPoint[0] = point.x;
			this.#cornerPoint[1] = this.#lastPoint.y;
		} else if(direction===Line.Direction.VERTICAL_HORIZONTAL){
			this.#cornerPoint[0] = this.#lastPoint.x;
			this.#cornerPoint[1] = point.y;
		} else{
			this.#cornerPoint[0] = point.x;
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

	rotate(angleDeg){
		if (Math.abs(angleDeg % 180)>0.1) {
			for (let index = 1; index < this.#drawCommands.length; index+=2) {
				let element = this.#drawCommands[index];
				if (element === Line.Direction.HORIZONTAL_VERTICAL) {
					this.#drawCommands[index] = Line.Direction.VERTICAL_HORIZONTAL
				} else if(element === Line.Direction.VERTICAL_HORIZONTAL){
					this.#drawCommands[index] = Line.Direction.HORIZONTAL_VERTICAL
				}
			}
		}
		
		let center = new SVG.Point(this.bbox().cx,this.bbox().cy)
		for (let index = 0; index < this.#drawCommands.length; index+=2) {
			let element = this.#drawCommands[index];
			this.#drawCommands[index] = element.rotate(angleDeg,center,false)
		}
		
		this.#buildArrayFromDrawCommands()
	}

	/**
	 * Flip the component horizontally or vertically
	 *
	 * @param {boolean} horizontal along which axis to flip
	 */
	flip(horizontal){

		let flipX = horizontal?0:-2;
		let flipY = horizontal?-2:0;
		let center = new SVG.Point(this.bbox().cx,this.bbox().cy)

		for (let index = 0; index < this.#drawCommands.length; index+=2) {
			let element = this.#drawCommands[index];
			let diffToCenter = element.minus(center);
			this.#drawCommands[index] = new SVG.Point(element.x+flipX*diffToCenter.x,element.y+flipY*diffToCenter.y)
		}
		this.#buildArrayFromDrawCommands()
	}

	#buildArrayFromDrawCommands(){
		this._array.splice(0,this._array.length)

		for (let index = 0; index < this.#drawCommands.length; index++) {
			const element = this.#drawCommands[index];
			if (element instanceof SVG.Point) {
				this._array.push([element.x,element.y])
			}else{
				const last = this.#drawCommands[index-1]
				const next = this.#drawCommands[index+1]
				if (element == Line.Direction.HORIZONTAL_VERTICAL) {
					this._array.push([next.x,last.y])
				}else if (element == Line.Direction.VERTICAL_HORIZONTAL) {
					this._array.push([last.x,next.y])					
				}
			}
		}
		this.#redraw()
	}

	moveRel(amount){
		for (let index = 0; index < this.#drawCommands.length; index+=2) {
			let element = this.#drawCommands[index];
			this.#drawCommands[index] = new SVG.Point(element.x+amount.x,element.y+amount.y)
		}
		this.#buildArrayFromDrawCommands()
	}

	getEndPoints(){
		let numPoints = this._array.length
		return [new SVG.Point(this._array[0][0],this._array[0][1]), new SVG.Point(this._array[numPoints-1][0],this._array[numPoints-1][1])]
	}

	/**
	 * Create a instance from the (saved) serialized text.
	 *
	 * @param {object} serialized - the saved instance
	 * @returns {PathComponentInstance} the deserialized instance
	 */
	static fromJson(serialized) {
		let line = new Line(new SVG.Point(serialized.start))
		CanvasController.controller.canvas.add(line);
		for (const point of serialized.others) {
			let dir = point.dir==0?Line.Direction.STRAIGHT:point.dir==1?Line.Direction.HORIZONTAL_VERTICAL:Line.Direction.VERTICAL_HORIZONTAL
			line.pushPoint(dir,new SVG.Point(point.x,point.y))
		}
		line.removeMousePoint()

		MainController.controller.addLine(line)
		return line;
	}

	/**
	 * Serialize the component in an object
	 *
	 * @returns {object} the serialized instance
	 */
	toJson() {
		let others = []
		for (let index = 2; index < this.#drawCommands.length; index+=2) {
			let dir = this.#drawCommands[index-1]
			let other = {
				x:this.#drawCommands[index].x,
				y:this.#drawCommands[index].y,
				dir:Line.Direction.STRAIGHT===dir?0:Line.Direction.HORIZONTAL_VERTICAL===dir?1:2
			}
			others.push(other)
		}

		let data = {
			type:"wire",
			start:{x:this.#drawCommands[0].x,y:this.#drawCommands[0].y},
			others:others
		}

		return data
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
