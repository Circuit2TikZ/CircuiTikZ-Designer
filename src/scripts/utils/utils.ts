import * as SVG from "@svgdotjs/svg.js"

// Utility functions for Circuitikz components

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

/**
 * Clamps a value between a minimum and maximum value.
 * @param value The value to clamp
 * @param min The minimum value
 * @param max The maximum value
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}
