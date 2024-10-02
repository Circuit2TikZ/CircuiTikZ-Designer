/**
 * @module snapController
 */

import * as SVG from "@svgdotjs/svg.js";
import {CanvasController} from "../internal";

/** @typedef {SVG.Point|{x: number, y: number}} PointAlike */

/**
 * Controller for snapping points, objects, etc. to the grid or other already added components.
 * @class
 */
export class SnapController {
	static #instance: SnapController;

	#snapPoints: SVG.Point[] = [];

	#snapUse: SVG.Use[] = [];

	/**
	 * Do not call this constructor directly. Use {@link controller} instead.
	 */
	constructor() {}

	/**
	 * Add points to snap to.
	 *
	 * @param {(...PointAlike)|[PointAlike[]]} points - can be either an array or multiple parameters
	 */
	addSnapPoints(...points: (...PointAlike) => [PointAlike[]]) {
		this.#snapPoints.push(...(Array.isArray(points[0]) ? points[0] : points));
	}

	/**
	 * Remove points to snap to.
	 *
	 * @param {(...PointAlike)|[PointAlike[]]} points - can be either an array or multiple parameters
	 */
	removeSnapPoints(...points: (...PointAlike) => [PointAlike[]]) {
		/** @type {PointAlike[]} */
		const pointArray: PointAlike[] = Array.isArray(points[0]) ? points[0] : points;
		for (const point of pointArray) {
			const idx = this.#snapPoints.indexOf(point);
			if (idx >= 0) this.#snapPoints.splice(idx, 1);
		}
	}

	/**
	 * show the snap points on the canvas (doesn't show grid points)
	 */
	showSnapPoints(){
		const snapSymbol = new SVG.Symbol(document.getElementById("snapPoint"));
		const container = CanvasController.controller.canvas;
		let viewBox = snapSymbol.viewbox();

		this.#snapPoints.forEach(snapPoint => {
			let use = new SVG.Use();
			use.use(snapSymbol);
			use.width(viewBox.width);
			use.height(viewBox.height);
			use.move(snapPoint.x-viewBox.cx,snapPoint.y-viewBox.cy);
			container.add(use);
			// save the reference to the svg element for later removal
			this.#snapUse.push(use);
		});
	}

	/**
	 * hide the snap points again
	 */
	hideSnapPoints(){
		// remove all the snap point visualizations from the svg canvas
		this.#snapUse.forEach(snapUse=>{
			snapUse.remove();
		});
		this.#snapUse = [];
	}

	/**
	 * Getter for the singleton instance.
	 *
	 * @returns {SnapController}
	 */
	static get controller(): SnapController {
		return SnapController.#instance || (SnapController.#instance = new SnapController());
	}

	/**
	 * Snap a point to the grid or one of the added snap points.
	 * Calculations done in px since the node snap points are defined in px
	 *
	 * @param {PointAlike} pos - the point to find a snapped position
	 * @param {PointAlike[]} relSnapPoints - a list of positions relative to `pos` to snap; if there are no special anchors, use `[{x: 0, y: 0}]`
	 * @returns {SVG.Point} - the snapped point
	 */
	snapPoint(pos: PointAlike, relSnapPoints: PointAlike[]): SVG.Point {
		// 1. Calculate grid snap points
		const canvasController = CanvasController.controller;
		/** @type {SVG.Number} */
		let gridSpacing: SVG.Number = new SVG.Number(canvasController.majorGridSizecm/canvasController.majorGridSubdivisions, "cm").convertToUnit("px");
		const maxSnapDistance = new SVG.Number(0.5, "cm").convertToUnit("px")
		const movingSnapPoints = relSnapPoints.map((point) => new SVG.Point(pos.x + point.x, pos.y + point.y));

		if (!CanvasController.controller.gridVisible) {
			// effectively only snap the origin
			gridSpacing = 1e9
		}

		// directly calculate the closest grid snapping point to each possible relSnapPoint and filter which is closest overall
		let distStruct = movingSnapPoints.reduce(
			/**
			 * @param {DistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
			 * @param {SVG.Point} movSnapPoint - possible point to snap to (grid)
			 * @returns {DistStruct}
			 */
			(prevVal: DistStruct, movSnapPoint: SVG.Point): DistStruct => {
				const x = Math.round(movSnapPoint.x/gridSpacing)*gridSpacing;
				const y = Math.round(movSnapPoint.y/gridSpacing)*gridSpacing;
				const gridPoint = new SVG.Point(x,y);
				const vector = gridPoint.minus(movSnapPoint);
				const squaredDistance = vector.absSquared();
				if (squaredDistance > prevVal.dist) return prevVal;
				else
					return {
						dist: squaredDistance,
						vector: vector,
						movingSnapPoint: movSnapPoint,
						fixedSnapPoint: gridPoint,
					};
			},
			{dist:Number.MAX_VALUE}
		)

		// 2. calculate bounds where a closer point could lie
		let relSnapPointsMinX = relSnapPoints[0].x,
			relSnapPointsMaxX = relSnapPoints[0].x,
			relSnapPointsMinY = relSnapPoints[0].y,
			relSnapPointsMaxY = relSnapPoints[0].y;
		for (const point of relSnapPoints) {
			if (point.x < relSnapPointsMinX) relSnapPointsMinX = point.x;
			else if (point.x > relSnapPointsMaxX) relSnapPointsMaxX = point.x;
			if (point.y < relSnapPointsMinY) relSnapPointsMinY = point.y;
			else if (point.y > relSnapPointsMaxY) relSnapPointsMaxY = point.y;
		}
		const xMin = (relSnapPointsMinX + pos.x) - maxSnapDistance;
		const yMin = (relSnapPointsMinY + pos.y) - maxSnapDistance;
		const xMax = (relSnapPointsMaxX + pos.x) + maxSnapDistance;
		const yMax = (relSnapPointsMaxY + pos.y) + maxSnapDistance;

		// 3. filter remaining snap points
		const filteredFixSnapPoints = this.#snapPoints.filter(
			(point) => point.x >= xMin && point.x <= xMax && point.y >= yMin && point.y <= yMax
		);

		// 4. snap to non grid points
		if (filteredFixSnapPoints.length > 0)
			distStruct = this.#getSnapDistStruct(movingSnapPoints, filteredFixSnapPoints, distStruct);

		// 5. Calculate snapped point using vector
		if (distStruct.dist>maxSnapDistance*maxSnapDistance) {
			// only snap if the snap distance is not too long
			distStruct.vector = new SVG.Point(0,0)
		}
		return distStruct.vector.plus(pos);
	}

	/**
	 * @typedef {object} DistStruct
	 * @property {number} dist - the squared distance
	 * @property {SVG.Point} vector - the vector, which should be added to the snap point
	 * @property {SVG.Point} movingSnapPoint - the point used to find the snap point
	 * @property {SVG.Point} fixedSnapPoint - the absolute point snapped to
	 */

	/**
	 * Snap absolute points to absolute positions. The point with the lowest distance is returned with its additional
	 * information ({@link DistStruct}). As this function supports multiple possible (moving) snap points, the returned
	 * vector should be used for moving the object to the snapped position.
	 *
	 * @param {PointAlike[]} movingSnapPoints - the list of absolute points to be snapped
	 * @param {SVG.Point[]} fixedSnapPoints - the list of absolute positions, which can be snapped to (grid etc.)
	 * @param {DistStruct} [initialDistStruct] - useful, if you call this method multiple times
	 * @returns {DistStruct}
	 */
	#getSnapDistStruct(movingSnapPoints: PointAlike[], fixedSnapPoints: SVG.Point[], initialDistStruct: DistStruct): DistStruct {
		if (!initialDistStruct) initialDistStruct = { dist: Number.MAX_VALUE, vector: null };
		return movingSnapPoints.reduce(
			/**
			 * @param {DistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
			 * @param {SVG.Point} relSnapPoint - snap point / anchor relative to box
			 * @returns {DistStruct}
			 */
			(prevVal: DistStruct, movSnapPoint): DistStruct =>
				fixedSnapPoints.reduce(
					/**
					 * @param {DistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
					 * @param {SVG.Point} fixSnapPoint - possible point to snap to (grid)
					 * @returns {DistStruct}
					 */
					(prevVal: DistStruct, fixSnapPoint: SVG.Point): DistStruct => {
						const vector = fixSnapPoint.minus(movSnapPoint);
						const squaredDistance = vector.absSquared();
						if (squaredDistance > prevVal.dist) return prevVal;
						else
							return {
								dist: squaredDistance,
								vector: vector,
								movingSnapPoint: movSnapPoint,
								fixedSnapPoint: fixSnapPoint,
							};
					},
					prevVal
				),
			initialDistStruct
		);
	}
}
