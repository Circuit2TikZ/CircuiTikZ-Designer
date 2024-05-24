import * as SVG from "@svgdotjs/svg.js";

export const selectedWireWidth = "2pt"
export const selectedBoxWidth = "1pt"

/**
	 * 
	 * @param {[[number,number], [number,number]]|SVG.line} line1 
	 * @param {[[number,number], [number,number]]|SVG.Line} line2 
	 */
export function linelineIntersection(line1, line2){
	let l1 = (line1 instanceof SVG.Line)? line1.array():line1;
	let l2 = (line2 instanceof SVG.Line)? line2.array():line2;

	let det = (l1[0][0]-l1[1][0])*(l2[0][1]-l2[1][1])-(l1[0][1]-l1[1][1])*(l2[0][0]-l2[1][0]);
	if (det==0) return false;
	let t = ((l1[0][0]-l2[0][0])*(l2[0][1]-l2[1][1])-(l1[0][1]-l2[0][1])*(l2[0][0]-l2[1][0]))/det;
	let u =-((l1[0][0]-l1[1][0])*(l1[0][1]-l2[0][1])-(l1[0][1]-l1[1][1])*(l1[0][0]-l2[0][0]))/det;
	return t >= 0 && t <= 1 && u >= 0 && u <= 1
}
/**
 * 
 * @param {[[number,number], [number,number]]|SVG.Line} line
 * @param {SVG.Box} rect 
 */
export function lineRectIntersection(line,rect){
	let l = (line instanceof SVG.Line)? line.array():line;

	let boxPoints = [
		[rect.x, rect.y],
		[rect.x2, rect.y],
		[rect.x2, rect.y2],
		[rect.x, rect.y2],
		[rect.x, rect.y],
	];

	for (let index = 0; index < boxPoints.length-1; index++) {
		if (linelineIntersection(l, [boxPoints[index],boxPoints[index+1]])) {
			return true;
		}
	}
	return false;
}

/**
 * check if two rectangles intersect
 * @param {SVG.Box} rect1 
 * @param {SVG.Box} rect2 
 * @returns {boolean}
 */
export function rectRectIntersection(rect1,rect2){
	let l1 = new SVG.Point(rect1.x,rect1.y)
	let r1 = new SVG.Point(rect1.x2,rect1.y2)
	let l2 = new SVG.Point(rect2.x,rect2.y)
	let r2 = new SVG.Point(rect2.x2,rect2.y2)
	
	// if rectangle has area 0, no overlap
	if (l1.x == r1.x || l1.y == r1.y || r2.x == l2.x || l2.y == r2.y)
		return false;
	
	// If one rectangle is on left side of other
	if (l1.x > r2.x || l2.x > r1.x) {
		return false;
	}
	
	// If one rectangle is above other
	if (r1.y < l2.y || r2.y < l1.y) {
		return false;
	}

	return true;
}

/**
 * 
 * @param {[number,number]|SVG.Point} point 
 * @param {SVG.Box} rect 
 */
export function pointInsideRect(point, rect){
	let p = (point instanceof SVG.Point)? [point.x, point.y]:point;
	return p[0]>=rect.x && p[0]<= rect.x2 && p[1]>=rect.y && p[1]<= rect.y2
}