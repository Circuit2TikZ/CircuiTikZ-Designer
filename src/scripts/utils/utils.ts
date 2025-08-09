import * as SVG from "@svgdotjs/svg.js"
import { basicDirections, DirectionInfo } from "../internal"

export type AbstractConstructor<T = {}> = abstract new (...args: any[]) => T

// utility values

export const defaultStroke = "var(--bs-emphasis-color)"
export const defaultFill = "var(--bs-body-bg)"

// Utility functions for components

/**
 * Simplifies the rotation and scale of a component for better consistency and human readability.
 */
export function simpifyRotationAndScale(rotation: number, scale: SVG.Point): [number, SVG.Point] {
	let s = new SVG.Point(scale)
	rotation = rotation == -180 ? 180 : rotation
	if (s.y < 0) {
		if (rotation == 180) {
			rotation = 0
			s.y *= -1
			s.x *= -1
		} else if (s.x < 0) {
			s.x *= -1
			s.y *= -1
			rotation = rotation + 180
		}
	} else if (rotation == 180) {
		rotation = 0
		s.x *= -1
		s.y *= -1
	}
	return [rotation, s]
}

export function closestBasicDirection(direction: SVG.Point): DirectionInfo {
	return basicDirections
		.map((val) => {
			return { dirInfo: val, distsq: val.direction.distanceSquared(direction) }
		})
		.reduce(
			(prev, current) => {
				if (current.distsq < prev.distsq) {
					return current
				} else {
					return prev
				}
			},
			{ dirInfo: { key: "", name: "", direction: new SVG.Point() }, distsq: Number.MAX_VALUE }
		).dirInfo
}

/**
 * Clamps a value between a minimum and maximum value.
 * @param value The value to clamp
 * @param min The minimum value
 * @param max The maximum value
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

export function memorySizeOf(obj) {
	var bytes = 0

	function sizeOf(obj) {
		if (obj !== null && obj !== undefined) {
			switch (typeof obj) {
				case "number":
					bytes += 8
					break
				case "string":
					bytes += obj.length * 2
					break
				case "boolean":
					bytes += 4
					break
				case "object":
					var objClass = Object.prototype.toString.call(obj).slice(8, -1)
					if (objClass === "Object" || objClass === "Array") {
						for (var key in obj) {
							if (!obj.hasOwnProperty(key)) continue
							sizeOf(obj[key])
						}
					} else bytes += obj.toString().length * 2
					break
			}
		}
		return bytes
	}
	return sizeOf(obj)
}

export function bboxFromPoints(points: SVG.Point[]): SVG.Box {
	let minX = Number.MAX_VALUE
	let maxX = -Number.MAX_VALUE
	let minY = Number.MAX_VALUE
	let maxY = -Number.MAX_VALUE
	for (const point of points) {
		if (point.x < minX) minX = point.x
		if (point.y < minY) minY = point.y
		if (point.x > maxX) maxX = point.x
		if (point.y > maxY) maxY = point.y
	}
	return new SVG.Box(minX, minY, maxX - minX, maxY - minY)
}
