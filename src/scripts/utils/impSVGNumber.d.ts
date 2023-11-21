import "@svgdotjs/svg.js";

declare module "@svgdotjs/svg.js" {
	interface Number {
		/**
		 * Convert a SVGNumber to another unit. Does actually change the value.
		 * @param unit - the unit to convert to
		 * @returns {Number}
		 */
		convertToUnit(unit: "px" | "in" | "cm" | "mm" | "pt" | "pc"): Number[];
		/**
		 * Converts number alike values to a plain `number` in the unit pixel.
		 * @static
		 * @param number
		 * @returns {number} a plain `number` in px
		 */
		ensureInPx(number: string | number | Number): Number;
		/**
		 * Divides this number by another svg number.
		 * Returns a new instance.
		 * @param number - the divisor
		 * @returns the result
		 */
		divide(number: Number | number): Number;
		/**
		 * Subtracts another svg number.
		 * Returns a new instance.
		 * @param number - the subtrahend
		 * @returns the result
		 */
		minus(number: Number | number): Number;
		/**
		 * Calculates the sum of this number and another svg number.
		 * Returns a new instance.
		 * @param number - the other summand
		 * @returns the result
		 */
		plus(number: Number | number): Number;
		/**
		 * Multiplies this number with another svg number.
		 * Returns a new instance.
		 * @param number - the other operand
		 * @returns the result
		 */
		times(number: Number | number): Number;
		/**
		 * Calculates the exponentiation using this number as base.
		 * Returns a new instance.
		 * @param exponent - the exponent
		 * @returns the result
		 */
		pow(exponent: number): Number;
		/**
		 * Calculates the remainder (modulo) of an division.
		 * Returns a new instance.
		 * @param number - the divisor
		 * @returns the result
		 */
		mod(number: number): Number;
		/**
		 * Checks if this svg number is greater than the other one.
		 * @param number - the other number
		 * @returns the result
		 */
		gt(number: Number | number): boolean;
		/**
		 * Checks if this svg number is greater than the other one or equal.
		 * @param number - the other number
		 * @returns the result
		 */
		gte(number: Number | number): boolean;
		/**
		 * Checks if this svg number is less than the other one.
		 * @param number - the other number
		 * @returns the result
		 */
		lt(number: Number | number): boolean;
		/**
		 * Checks if this svg number is less than the other one or equal.
		 * @param number - the other number
		 * @returns the result
		 */
		lte(number: Number | number): boolean;
		/**
		 * Checks if this svg number is equal the other one.
		 * @param number - the other number
		 * @returns the result
		 */
		eq(number: Number | number): boolean;
	}

	interface Point {
		/**
		 * Calculate the squared distance of two points.
		 * @param other - the other point
		 * @returns the squared distance (px^2)
		 */
		distanceSquared(other: Point): number;
		/**
		 * Calculate the distance of two points.
		 * @param other - the other point
		 * @returns the squared distance (px)
		 */
		distance(other: Point): number;
		/**
		 * Calculate the length of the vector resp. the distance from (0|0).
		 * @returns the squared length (px^2)
		 */
		absSquared(): number;
		/**
		 * Calculate the length of the vector resp. the distance from (0|0).
		 * @returns the length (px)
		 */
		abs(): number;
		/**
		 * Subtracts another svg point.
		 * Returns a new instance.
		 * @param other - the subtrahend
		 * @returns the result
		 */
		minus(other: Point): Point;
		/**
		 * Calculates the sum of this and another svg point.
		 * Returns a new instance.
		 * @param other - the other summand
		 * @returns the result
		 */
		plus(other: Point): Point;
		/**
		 * Rotate the Coordinate around `centerCoord`. The rotation is counter clockwise, like the default mathematical
		 * rotation.
		 * @param angle - rotation angle in degrees or radians
		 * @param centerCoord - center of rotation
		 * @param inRad - set to `true`, if the angle is in radians
		 * @returns the result
		 */
		rotate(angle: number, centerCoord?: Point, inRad?: boolean): Point;
		/**
		 * Formats the point for usage with (Circui)TikZ.
		 *
		 * Converts from px to cm and rounds to 2 digits after the decimal point.
		 * @returns the TikZ representation, e.g. "(0.1, 1.23)"
		 */
		toTikzString(): string;
	}
}
