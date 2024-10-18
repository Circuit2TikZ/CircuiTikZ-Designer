/**
 * @module snapController
 */

import * as SVG from "@svgdotjs/svg.js";
import {CanvasController, SnapPoint} from "../internal";

type DistStruct = {
	dist: number;
	vector?: SVG.Point;
	movingSnapPoint?: SVG.Point;
	fixedSnapPoint?: SVG.Point;
}

/**
 * Controller for snapping points, objects, etc. to the grid or other already added components.
 * @class
 */
export class SnapController {
	private static _instance: SnapController;
	public static get instance(): SnapController {
		if (!SnapController._instance) {
			SnapController._instance = new SnapController()
		}
		return SnapController._instance;
	}

	// a list of all points (except grid points) which can be snapped to
	private snapPoints: SnapPoint[] = [];

	private whereSnap:SVG.Element

	// save the created svg elements for later deletion
	private snapUses: SVG.Use[] = [];

	/**
	 * Do not call this constructor directly. Use {@link instance} instead.
	 */
	private constructor() {
	}

	/**
	 * Add points to snap to.
	 */
	public addSnapPoints(points: SnapPoint[]) {
		this.snapPoints.push(...points);
	}

	/**
	 * Remove points to snap to.
	 */
	public removeSnapPoints(points: SnapPoint[]) {
		for (const point of points) {
			const idx = this.snapPoints.indexOf(point);
			if (idx >= 0) this.snapPoints.splice(idx, 1);
		}
	}

	/**
	 * show the snap points on the canvas (doesn't show grid points)
	 */
	public showSnapPoints(){
		if (!this.whereSnap) {
			this.whereSnap = CanvasController.instance.canvas.circle(2).fill("green")
		}
		const snapSymbol = new SVG.Symbol(document.getElementById("snapPoint"));
		const container = CanvasController.instance.canvas;
		let viewBox = snapSymbol.viewbox();

		this.snapPoints.forEach(snapPoint => {
			let use = container.use(snapSymbol)
			use.width(viewBox.width);
			use.height(viewBox.height);
			use.move(snapPoint.x-viewBox.cx,snapPoint.y-viewBox.cy);
			container.add(use);
			// save the reference to the svg element for later removal
			this.snapUses.push(use);
		});
	}

	/**
	 * hide the snap points again
	 */
	public hideSnapPoints(){
		this.whereSnap?.remove()
		this.whereSnap = null
		// remove all the snap point visualizations from the svg canvas
		this.snapUses.forEach(snapUse=>{
			snapUse.remove();
		});
		this.snapUses = [];
	}

	/**
	 * Snap a point to the grid or one of the added snap points.
	 * Calculations done in px since the node snap points are defined in px
	 */
	public snapPoint(pos: SVG.Point, relSnapPoints: SVG.Point[] = [new SVG.Point()]): SVG.Point {
		// 1. Calculate grid snap points
		const canvasController = CanvasController.instance;
		let gridSpacing: number = new SVG.Number(canvasController.majorGridSizecm/canvasController.majorGridSubdivisions, "cm").convertToUnit("px").value;
		// take zoom level into account (canvas.ctm().a): zoomed in means smaller maximum distance
		const maxSnapDistance = new SVG.Number(1, "cm").convertToUnit("px").value/CanvasController.instance.canvas.ctm().a
		const movingSnapPoints = relSnapPoints.map((point) => pos.add(point));

		if (!CanvasController.instance.gridVisible) {
			// effectively only snap the origin
			gridSpacing = 1e9
		}
		
		// directly calculate the closest grid snapping point to each possible relSnapPoint and filter which is closest overall
		let distStruct = movingSnapPoints.reduce<DistStruct>(
			/**
			 * @param {DistStruct} prevVal - helper struct for finding snap point with lowest dist. to a grid point
			 * @param {SVG.Point} movSnapPoint - possible point to snap to (grid)
			 * @returns {DistStruct}
			 */
			(prevVal: DistStruct, movSnapPoint: SVG.Point): DistStruct => {
				const x = Math.round(movSnapPoint.x/gridSpacing)*gridSpacing;
				const y = Math.round(movSnapPoint.y/gridSpacing)*gridSpacing;
				const gridPoint = new SVG.Point(x,y);
				const vector = gridPoint.sub(movSnapPoint);
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
		const filteredFixSnapPoints = this.snapPoints.filter(
			(point) => point.x >= xMin && point.x <= xMax && point.y >= yMin && point.y <= yMax
		);

		// 4. snap to non grid points
		if (filteredFixSnapPoints.length > 0)
			distStruct = this.getSnapDistStruct(movingSnapPoints, filteredFixSnapPoints, distStruct);

		// 5. Calculate snapped point using vector
		if (distStruct.dist>maxSnapDistance*maxSnapDistance) {
			// only snap if the snap distance is not too long
			distStruct.vector = new SVG.Point(0,0)
		}

		if (distStruct.fixedSnapPoint&&this.whereSnap) {
			if (distStruct.dist>maxSnapDistance*maxSnapDistance) {
				this.whereSnap.hide()
				this.whereSnap.move(pos.x-1,pos.y-1)
			}else{
				this.whereSnap.show()
				this.whereSnap.move(distStruct.fixedSnapPoint.x-1,distStruct.fixedSnapPoint.y-1)
			}
		}

		return distStruct.vector.add(pos);
	}

	/**
	 * Snap absolute points to absolute positions. The point with the lowest distance is returned with its additional
	 * information ({@link DistStruct}). As this function supports multiple possible (moving) snap points, the returned
	 * vector should be used for moving the object to the snapped position.
	 */
	private getSnapDistStruct(movingSnapPoints: SVG.Point[], fixedSnapPoints: SVG.Point[], initialDistStruct?: DistStruct): DistStruct {
		if (!initialDistStruct) initialDistStruct = { dist: Number.MAX_VALUE, vector: null };
		return movingSnapPoints.reduce(
			(prevVal: DistStruct, movSnapPoint): DistStruct =>
				fixedSnapPoints.reduce(
					(prevVal: DistStruct, fixSnapPoint: SVG.Point): DistStruct => {
						const vector = fixSnapPoint.sub(movSnapPoint);
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
