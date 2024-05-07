/**
 * @module snapController
 */

import * as SVG from "@svgdotjs/svg.js";
import CanvasController from "../controllers/canvasController";

/** @typedef {SVG.Point|{x: number, y: number}} PointAlike */

/**
 * Controller for snapping points, objects, etc. to the grid or other already added components.
 * @class
 */
export default class SnapController {
	/** @type {SnapController} */
	static #instance;

	/** @type {SVG.Point[]} */
	#snapPoints = [];

	/**
	 * Do not call this constructor directly. Use {@link controller} instead.
	 */
	constructor() {}

	/**
	 * Add points to snap to.
	 *
	 * @param {(...PointAlike)|[PointAlike[]]} points - can be either an array or multiple parameters
	 */
	addSnapPoints(...points) {
		this.#snapPoints.push(...(Array.isArray(points[0]) ? points[0] : points));
	}

	/**
	 * Remove points to snap to.
	 *
	 * @param {(...PointAlike)|[PointAlike[]]} points - can be either an array or multiple parameters
	 */
	removeSnapPoints(...points) {
		/** @type {PointAlike[]} */
		const pointArray = Array.isArray(points[0]) ? points[0] : points;
		for (const point of pointArray) {
			const idx = this.#snapPoints.indexOf(point);
			if (idx >= 0) this.#snapPoints.splice(idx, 1);
		}
	}

	/**
	 * Getter for the singleton instance.
	 *
	 * @returns {SnapController}
	 */
	static get controller() {
		return SnapController.#instance || (SnapController.#instance = new SnapController());
	}

	/**
	 * Snap a point to the grid or one of the added snap points.
	 *
	 * @param {PointAlike} pos - the point to find a snapped position
	 * @param {PointAlike[]} relSnapPoints - a list of positions relative to `pos` to snap; if there are no special anchors, use `[{x: 0, y: 0}]`
	 * @returns {SVG.Point} - the snapped point
	 */
	snapPoint(pos, relSnapPoints) {
		// 1. Calculate grid snap points
		const canvasController = CanvasController.controller;
		/** @type {SVG.Number} */
		const gridSpacing = new SVG.Number(canvasController.majorGridDistance/canvasController.minorToMajorGridPoints, "cm").convertToUnit("px");
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
		const xMin = Math.floor((relSnapPointsMinX + pos.x) / gridSpacing) * gridSpacing;
		const yMin = Math.floor((relSnapPointsMinY + pos.y) / gridSpacing) * gridSpacing;
		const xMax = Math.ceil((relSnapPointsMaxX + pos.x) / gridSpacing) * gridSpacing;
		const yMax = Math.ceil((relSnapPointsMaxY + pos.y) / gridSpacing) * gridSpacing;

		/** @type {SVG.Point[]} */
		let gridSnapPoints = [];

		for (let x = xMin; x <= xMax; x += gridSpacing) {
			for (let y = yMin; y <= yMax; y += gridSpacing) {
				gridSnapPoints.push(new SVG.Point(x, y));
			}
		}

		// 2. calculate movingSnapPoints (anchors)
		const movingSnapPoints = relSnapPoints.map((point) => new SVG.Point(pos.x + point.x, pos.y + point.y));

		// 3. Snap to grid
		let distStruct = this.#getSnapDistStruct(movingSnapPoints, gridSnapPoints);

		// 4. Snap to other points
		const filteredFixSnapPoints = this.#snapPoints.filter(
			(point) => point.x >= xMin && point.x <= xMax && point.y >= yMin && point.y <= yMax
		);

		if (filteredFixSnapPoints.length > 0)
			distStruct = this.#getSnapDistStruct(movingSnapPoints, filteredFixSnapPoints, distStruct);

		// 5. Calculate snapped point using vector
		// use the original (snap)point instance, if possible (relPos = [0, 0])
		// if the relPos != [0, 0] --> calculate using vector
		return distStruct.movingSnapPoint.x === pos.x && distStruct.movingSnapPoint.y === pos.y
			? distStruct.fixedSnapPoint
			: distStruct.vector.plus(pos);
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
	#getSnapDistStruct(movingSnapPoints, fixedSnapPoints, initialDistStruct) {
		if (!initialDistStruct) initialDistStruct = { dist: Number.MAX_VALUE, vector: null };
		return movingSnapPoints.reduce(
			/**
			 * @param {DistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
			 * @param {SVG.Point} relSnapPoint - snap point / anchor relative to box
			 * @returns {DistStruct}
			 */
			(prevVal, movSnapPoint) =>
				fixedSnapPoints.reduce(
					/**
					 * @param {DistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
					 * @param {SVG.Point} fixSnapPoint - possible point to snap to (grid)
					 * @returns {DistStruct}
					 */
					(prevVal, fixSnapPoint) => {
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
