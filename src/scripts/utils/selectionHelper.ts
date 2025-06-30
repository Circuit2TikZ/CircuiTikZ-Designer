import * as SVG from "@svgdotjs/svg.js"
import { CanvasController } from "../internal"

export const selectedBoxWidth = 1
export const selectionColor = "var(--bs-red)"
export const referenceColor = "var(--bs-cyan)"
export const hoverColor = "#FF00FF" // magenta

export const selectionSize = 16
export function pathPointSVG() {
	let circle = CanvasController.instance.canvas.circle(selectionSize).fill("transparent")
	circle.node.classList.add("pathPoint")
	return circle
}

export function resizeSVG(): SVG.Element {
	let g = CanvasController.instance.canvas.group()
	g.add(CanvasController.instance.canvas.rect(10, 10).fill("transparent").stroke("none"))
	g.add(CanvasController.instance.canvas.rect(5, 5).fill("var(--bs-cyan)").stroke("none").move(2.5, 2.5))
	return g
}

export function roundTikz(n: number): string {
	return n.toLocaleString("en", {
		maximumFractionDigits: 3,
		notation: "standard",
	})
}

/**
 *
 * @param {[[number,number], [number,number]]|SVG.line} line1
 * @param {[[number,number], [number,number]]|SVG.Line} line2
 */
export function linelineIntersection(line1: SVG.Line | number[][], line2: SVG.Line | number[][]) {
	let l1 = line1 instanceof SVG.Line ? line1.array() : line1
	let l2 = line2 instanceof SVG.Line ? line2.array() : line2

	let det = (l1[0][0] - l1[1][0]) * (l2[0][1] - l2[1][1]) - (l1[0][1] - l1[1][1]) * (l2[0][0] - l2[1][0])
	if (det == 0) return false
	let t = ((l1[0][0] - l2[0][0]) * (l2[0][1] - l2[1][1]) - (l1[0][1] - l2[0][1]) * (l2[0][0] - l2[1][0])) / det
	let u = -((l1[0][0] - l1[1][0]) * (l1[0][1] - l2[0][1]) - (l1[0][1] - l1[1][1]) * (l1[0][0] - l2[0][0])) / det
	return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

export function lineRectIntersection(line: SVG.Line | [[number, number], [number, number]], rect: SVG.Box) {
	let boxPoints = [
		[rect.x, rect.y],
		[rect.x2, rect.y],
		[rect.x2, rect.y2],
		[rect.x, rect.y2],
		[rect.x, rect.y],
	]

	// line and any line of rect intersect?
	for (let index = 0; index < boxPoints.length - 1; index++) {
		if (linelineIntersection(line, [boxPoints[index], boxPoints[index + 1]])) {
			return true
		}
	}

	// line inside rect?
	if (pointInsideRect(line instanceof SVG.Line ? new SVG.Point(line.cx(), line.cy()) : line[0], rect)) {
		return true
	}

	return false
}

/**
 * check if two rectangles intersect
 * @param {SVG.Box} rect1
 * @param {SVG.Box} rect2
 * @returns {boolean}
 */
export function rectRectIntersection(rect1: SVG.Box, rect2: SVG.Box, rotationDeg1: number = 0): boolean {
	if (rotationDeg1 == 0) {
		let l1 = new SVG.Point(rect1.x, rect1.y)
		let r1 = new SVG.Point(rect1.x2, rect1.y2)
		let l2 = new SVG.Point(rect2.x, rect2.y)
		let r2 = new SVG.Point(rect2.x2, rect2.y2)

		// If one rectangle is on left side of other
		if (l1.x > r2.x || l2.x > r1.x) {
			return false
		}

		// If one rectangle is above other
		if (r1.y < l2.y || r2.y < l1.y) {
			return false
		}

		return true
	}

	const rect1Center = new SVG.Point(rect1.cx, rect1.cy)

	// rect2 center inside rect1?
	if (pointInsideRect(new SVG.Point(rect2.cx, rect2.cy).rotate(-rotationDeg1, rect1Center), rect1)) {
		return true
	}

	let boxPoints = [
		[rect1.x, rect1.y],
		[rect1.x2, rect1.y],
		[rect1.x2, rect1.y2],
		[rect1.x, rect1.y2],
	]
	const points = boxPoints.map((point) => new SVG.Point(point[0], point[1]).rotate(rotationDeg1, rect1Center))

	for (let index = 0; index < points.length - 1; index++) {
		const A = points[index]
		const B = points[(index + 1) % points.length]

		if (
			lineRectIntersection(
				[
					[A.x, A.y],
					[B.x, B.y],
				],
				rect2
			)
		) {
			return true
		}
	}
}

export function pointInsideRect(point: SVG.Point | [number, number], rect: SVG.Box): boolean {
	let p = point instanceof SVG.Point ? [point.x, point.y] : point
	return p[0] >= rect.x && p[0] <= rect.x2 && p[1] >= rect.y && p[1] <= rect.y2
}
