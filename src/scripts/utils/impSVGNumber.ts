/**
 * Adds useful functions both to SVG.Number and SVG.Point.
 *
 * @module impSVGNumber
 */

import * as SVG from "@svgdotjs/svg.js"
import { roundTikz } from "./selectionHelper"

declare module "@svgdotjs/svg.js" {
	interface Number {
		/**
		 * Convert a SVGNumber to another unit. Does actually change the value.
		 * @param unit - the unit to convert to
		 * @returns {Number}
		 */
		convertToUnit(unit: "px" | "in" | "cm" | "mm" | "pt" | "pc"): Number
		/**
		 * Converts number alike values to a plain `number` in the unit pixel.
		 * @static
		 * @param number
		 * @returns {number} a plain `number` in px
		 */
		ensureInPx(number: string | number | Number): number
		/**
		 * Divides this number by another svg number.
		 * Returns a new instance.
		 * @param number - the divisor
		 * @returns the result
		 */
		divide(number: Number | number): Number
		/**
		 * Subtracts another svg number.
		 * Returns a new instance.
		 * @param number - the subtrahend
		 * @returns the result
		 */
		minus(number: Number | number): Number
		/**
		 * Calculates the sum of this number and another svg number.
		 * Returns a new instance.
		 * @param number - the other summand
		 * @returns the result
		 */
		plus(number: Number | number): Number
		/**
		 * Multiplies this number with another svg number.
		 * Returns a new instance.
		 * @param number - the other operand
		 * @returns the result
		 */
		times(number: Number | number): Number
		/**
		 * Calculates the exponentiation using this number as base.
		 * Returns a new instance.
		 * @param exponent - the exponent
		 * @returns the result
		 */
		pow(exponent: number): Number
		/**
		 * Calculates the remainder (modulo) of an division.
		 * Returns a new instance.
		 * @param number - the divisor
		 * @returns the result
		 */
		mod(number: number): Number
		/**
		 * Checks if this svg number is greater than the other one.
		 * @param number - the other number
		 * @returns the result
		 */
		gt(number: Number | number): boolean
		/**
		 * Checks if this svg number is greater than the other one or equal.
		 * @param number - the other number
		 * @returns the result
		 */
		gte(number: Number | number): boolean
		/**
		 * Checks if this svg number is less than the other one.
		 * @param number - the other number
		 * @returns the result
		 */
		lt(number: Number | number): boolean
		/**
		 * Checks if this svg number is less than the other one or equal.
		 * @param number - the other number
		 * @returns the result
		 */
		lte(number: Number | number): boolean
		/**
		 * Checks if this svg number is equal the other one.
		 * @param number - the other number
		 * @returns the result
		 */
		eq(number: Number | number): boolean
	}

	interface Point {
		/**
		 * Calculate the squared distance of two points.
		 * @param other - the other point
		 * @returns the squared distance (px^2)
		 */
		distanceSquared(other: Point): number
		/**
		 * Calculate the distance of two points.
		 * @param other - the other point
		 * @returns the squared distance (px)
		 */
		distance(other: Point): number
		/**
		 * Calculate the length of the vector resp. the distance from (0|0).
		 * @returns the squared length (px^2)
		 */
		absSquared(): number
		/**
		 * Calculate the length of the vector resp. the distance from (0|0).
		 * @returns the length (px)
		 */
		abs(): number
		/**
		 * Subtracts another svg point.
		 * Returns a new instance.
		 */
		sub(other: Point | number): Point
		/**
		 * Calculates the sum of this and another svg point.
		 * Returns a new instance.
		 */
		add(other: Point | number): Point
		/**
		 * Calculates the multiplication of this point and another svg point or number (elementwise).
		 * Returns a new instance.
		 */
		mul(other: Point | number): Point
		/**
		 * Calculates the division of this point and another svg point or number (elementwise).
		 * Returns a new instance.
		 */
		div(other: number | Point): Point
		/**
		 * calculates the dot product between this point and the other point
		 */
		dot(other: SVG.Point): number
		/**
		 * Rotate the Coordinate around `centerCoord`. The rotation is counter clockwise, like the default mathematical
		 * rotation.
		 * @param angle - rotation angle in degrees or radians
		 * @param centerCoord - center of rotation
		 * @param inRad - set to `true`, if the angle is in radians
		 * @returns the result
		 */
		rotate(angle: number, centerCoord?: Point, inRad?: boolean): Point
		/**
		 * Checks if to points are equal up to a given epsilon(how far the Xs and Ys can be apart to still count as being equal)
		 *
		 * @returns true if the points are equal
		 */
		eq(other: Point, eps?: number): boolean
		toTikzString(noParantheses?: boolean): string
		toSVGPathString(precision?: number): string
		simplifyForJson(): Point
	}

	interface Color {
		/**
		 * convert the color to tikz format
		 */
		toTikzString(): string
	}
}

type ToUnit = {
	px: number
	in: number
	cm: number
	mm: number
	pt: number
	pc: number
}

/**
 * Conversion constants from/to any svg unit.
 *
 * @readonly
 * @enum {ToUnit}
 */
const unitConvertMap = {
	px: {
		px: 1,
		in: 1 / 96,
		cm: 127 / 4800,
		mm: 127 / 480,
		pt: 3 / 4,
		pc: 1 / 16,
	},
	in: {
		px: 96,
		in: 1,
		cm: 2.54,
		mm: 25.4,
		pt: 72,
		pc: 6,
	},
	cm: {
		px: 4800 / 127,
		in: 50 / 127,
		cm: 1,
		mm: 10,
		pt: 3600 / 127,
		pc: 300 / 127,
	},
	mm: {
		px: 480 / 127,
		in: 5 / 127,
		cm: 0.1,
		mm: 1,
		pt: 360 / 127,
		pc: 30 / 127,
	},
	pt: {
		px: 4 / 3,
		in: 1 / 72,
		cm: 127 / 3600,
		mm: 127 / 360,
		pt: 1,
		pc: 1 / 12,
	},
	pc: {
		px: 16,
		in: 1 / 6,
		cm: 127 / 300,
		mm: 127 / 30,
		pt: 12,
		pc: 1,
	},
}

/**
 * List of unit names. The unit with the lowest index is the most preferred one.
 *
 * @type {string[]}
 */
const unitPriority: string[] = ["px", "in", "pt", "pc", "cm", "mm"]

/**
 * Convert two values to the same unit. The priority for unit is determined using {@link unitPriority}.
 * If the second number is not a instance of {@link SVG.Number}, it is assumed, that both numbers have the same unit.
 *
 * @param {SVG.Number} thisNumber - the first number; this number will be cloned
 * @param {SVG.Number | number} otherNumber - the second number
 * @returns {SVG.Number[]} an array of both numbers
 */
function toSameUnit(thisNumber: SVG.Number, otherNumber: SVG.Number | number): SVG.Number[] {
	const thisNumberUnit = thisNumber.unit || "px" // Empty == "px"
	const otherNumberUnit = otherNumber instanceof SVG.Number ? otherNumber.unit || "px" : "px"

	let numberA: SVG.Number = new SVG.Number(thisNumber)
	let numberB: SVG.Number
	if (!(otherNumber instanceof SVG.Number)) {
		numberB = new SVG.Number(otherNumber, thisNumberUnit) // assume same unit
	} else if (thisNumberUnit !== otherNumberUnit) {
		const thisNumberPrio = unitPriority.indexOf(thisNumberUnit)
		const otherNumberPrio = unitPriority.indexOf(otherNumberUnit)

		numberB = new SVG.Number(otherNumber)
		if (thisNumberPrio < otherNumberPrio) {
			numberB = numberB.convertToUnit(thisNumberUnit)
		} else {
			numberA = numberA.convertToUnit(otherNumberUnit)
		}
	} else {
		numberB = new SVG.Number(otherNumber)
	}

	return [numberA, numberB]
}

SVG.extend(SVG.Number, {
	/**
	 * Convert a SVGNumber to another unit. Does actually change the value.
	 *
	 * @function convertToUnit
	 * @memberof SVG.Number
	 * @instance
	 * @this {SVG.Number}
	 * @param {"px"|"in"|"cm"|"mm"|"pt"|"pc"} unit - the unit to convert to
	 * @returns {SVG.Number}
	 */
	convertToUnit(unit: "px" | "in" | "cm" | "mm" | "pt" | "pc"): SVG.Number {
		/** @type {ToUnit} */
		const factors: ToUnit = unitConvertMap[this.unit || "px"] || null
		const factor = factors?.[unit] ?? null
		if (factor !== null) return new SVG.Number(this.value * factor, unit)
		else throw new Error("Invalid unit")
	},

	/**
	 * Divides this number by another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the divisor
	 * @returns {SVG.Number} the result
	 */
	divide(number: SVG.Number | number): SVG.Number {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		thisNumber.value /= otherNumber.value
		return thisNumber
	},

	/**
	 * Subtracts another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the subtrahend
	 * @returns {SVG.Number} the result
	 */
	minus(number: SVG.Number | number): SVG.Number {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		thisNumber.value -= otherNumber.value
		return thisNumber
	},

	/**
	 * Calculates the sum of this number and another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other summand
	 * @returns {SVG.Number} the result
	 */
	plus(number: SVG.Number | number): SVG.Number {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		thisNumber.value += otherNumber.value
		return thisNumber
	},

	/**
	 * Multiplies this number with another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other operand
	 * @returns {SVG.Number} the result
	 */
	times(number: SVG.Number | number): SVG.Number {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		thisNumber.value *= otherNumber.value
		return thisNumber
	},

	/**
	 * Calculates the exponentiation using this number as base.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {number} exponent - the exponent
	 * @returns {SVG.Number} the result
	 */
	pow(exponent: number): SVG.Number {
		let thisNumber = new SVG.Number(this)
		thisNumber.value **= exponent
		return thisNumber
	},

	/**
	 * Calculates the remainder (modulo) of an division.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {number} number - the divisor
	 * @returns {SVG.Number} the result
	 */
	mod(number: number): SVG.Number {
		let thisNumber = new SVG.Number(this)
		thisNumber.value %= number
		return thisNumber
	},

	/**
	 * Checks if this svg number is greater than the other one.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	gt(number: SVG.Number | number): boolean {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		return thisNumber.value > otherNumber.value
	},

	/**
	 * Checks if this svg number is greater than the other one or equal.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	gte(number: SVG.Number | number): boolean {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		return thisNumber.value >= otherNumber.value
	},

	/**
	 * Checks if this svg number is less than the other one.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	lt(number: SVG.Number | number): boolean {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		return thisNumber.value < otherNumber.value
	},

	/**
	 * Checks if this svg number is less than the other one or equal.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	lte(number: SVG.Number | number): boolean {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		return thisNumber.value <= otherNumber.value
	},

	/**
	 * Checks if this svg number is equal the other one.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	eq(number: SVG.Number | number): boolean {
		let [thisNumber, otherNumber] = toSameUnit(this, number)
		return thisNumber.value == otherNumber.value
	},
})

/**
 * Converts number alike values to a plain `number` in the unit pixel.
 *
 * @function ensureInPx
 * @memberof SVG.Number
 * @static
 * @param {string|Number|number|SVG.Number} number
 * @returns {number} a plain `number` in px
 */
export function ensureInPx(nmbr: string | number | SVG.Number | SVGLength): number {
	if (nmbr instanceof SVG.Number) return nmbr.convertToUnit("px").value
	let num = Number(nmbr)
	if (Number.isNaN(num)) {
		if (typeof nmbr === "string") {
			return new SVG.Number(nmbr).convertToUnit("px").value
		} else if (typeof nmbr === "number") {
			return new SVG.Number(nmbr).convertToUnit("px").value
		} else {
			nmbr.convertToSpecifiedUnits(SVGLength.SVG_LENGTHTYPE_PX)
			return nmbr.value
		}
	} else return num
}

SVG.extend(SVG.Point, {
	/**
	 * Calculate the squared distance of two points.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point} other - the other point
	 * @returns {number} the squared distance (px^2)
	 */
	distanceSquared(other: SVG.Point): number {
		return (this.x - other.x) ** 2 + (this.y - other.y) ** 2
	},

	/**
	 * Calculate the distance of two points.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point} other - the other point
	 * @returns {number} the squared distance (px)
	 */
	distance(other: SVG.Point): number {
		return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2)
	},

	/**
	 * Calculate the length of the vector resp. the distance from (0|0).
	 *
	 * @this {SVG.Point}
	 * @returns {number} the squared length (px^2)
	 */
	absSquared(): number {
		return this.x ** 2 + this.y ** 2
	},

	/**
	 * Calculate the length of the vector resp. the distance from (0|0).
	 *
	 * @this {SVG.Point}
	 * @returns {number} the length (px)
	 */
	abs(): number {
		return Math.sqrt(this.x ** 2 + this.y ** 2)
	},

	/**
	 * Subtracts another svg point.
	 * Returns a new instance.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point|number} other - the subtrahend
	 * @returns {SVG.Point} the result
	 */
	sub(other: SVG.Point | number): SVG.Point {
		if (other instanceof SVG.Point) {
			return new SVG.Point(this.x - other.x, this.y - other.y)
		} else {
			return new SVG.Point(this.x - other, this.y - other)
		}
	},

	/**
	 * Calculates the sum of this and another svg point.
	 * Returns a new instance.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point|number} other - the other summand
	 * @returns {SVG.Point} the result
	 */
	add(other: SVG.Point | number): SVG.Point {
		if (other instanceof SVG.Point) {
			return new SVG.Point(this.x + other.x, this.y + other.y)
		} else {
			return new SVG.Point(this.x + other, this.y + other)
		}
	},
	/**
	 * Calculates the multiplication of this point and another svg point or number (elementwise).
	 * Returns a new instance.
	 */
	mul(other: SVG.Point | number): SVG.Point {
		if (other instanceof SVG.Point) {
			return new SVG.Point(this.x * other.x, this.y * other.y)
		} else {
			return new SVG.Point(this.x * other, this.y * other)
		}
	},
	/**
	 * Calculates the division of this point and another svg point or number (elementwise).
	 * Returns a new instance.
	 */
	div(other: SVG.Point | number): SVG.Point {
		if (other instanceof SVG.Point) {
			return new SVG.Point(this.x / other.x, this.y / other.y)
		} else {
			return new SVG.Point(this.x / other, this.y / other)
		}
	},
	/**
	 * calculates the dot product between this point and the other point
	 */
	dot(other: SVG.Point): number {
		return this.x * other.x + this.y * other.y
	},

	/**
	 * Rotate the Coordinate around `centerCoord`. The rotation is counter clockwise, like the default mathematical
	 * rotation.
	 *
	 * @this {SVG.Point}
	 * @param {number} angle - rotation angle in degrees or radians
	 * @param {SVG.Point} [centerCoord] - center of rotation
	 * @param {boolean} [inRad=false] - set to `true`, if the angle is in radians
	 * @returns {SVG.Point} the result
	 */
	rotate(angle: number, centerCoord: SVG.Point, inRad: boolean = false): SVG.Point {
		let result = centerCoord ? this.sub(centerCoord) : this.clone()

		const oldX = result.x
		const oldY = result.y
		const radians = inRad ? angle : (Math.PI / 180) * angle,
			cos = Math.cos(radians),
			sin = Math.sin(radians)

		result.x = cos * oldX + sin * oldY
		result.y = -sin * oldX + cos * oldY

		if (!!centerCoord) {
			result.x += centerCoord.x
			result.y += centerCoord.y
		}

		return result
	},
	/**
	 * Checks if to points are equal up to a given epsilon(how far the Xs and Ys can be apart to still count as being equal)
	 *
	 * @param other the other point
	 * @param [eps=1e-7] how far the points can be apart
	 * @returns true if the points are equal
	 */
	eq(other: SVG.Point, eps: number = 1e-7): boolean {
		if (this.x > other.x - eps && this.x < other.x + eps && this.y > other.y - eps && this.y < other.y + eps) {
			return true
		}
		return false
	},

	/**
	 * Formats the point for usage with (Circui)TikZ.
	 *
	 * Converts from px to cm and rounds to 2 digits after the decimal point.
	 *
	 * @this {SVG.Point}
	 * @returns {string} the TikZ representation, e.g. "(0.1, 1.23)"
	 */
	toTikzString(noParantheses = false): string {
		if (noParantheses) {
			return `${roundTikz(this.x * unitConvertMap.px.cm)}, ${roundTikz(-this.y * unitConvertMap.px.cm)}`
		} else {
			return `(${roundTikz(this.x * unitConvertMap.px.cm)}, ${roundTikz(-this.y * unitConvertMap.px.cm)})`
		}
	},
	toSVGPathString() {
		return this.x + " " + this.y
	},
	simplifyForJson(digits: 2 | 3 | 4 | 5 = 3): SVG.Point {
		let factor = 10 ** digits
		return new SVG.Point(Math.round(this.x * factor) / factor, Math.round(this.y * factor) / factor)
	},
})

SVG.extend(SVG.Color, {
	toTikzString(): string {
		let color: SVG.Color = this.rgb()
		return `{rgb,255:red,${color.r.toFixed(0)};green,${color.g.toFixed(0)};blue,${color.b.toFixed(0)}}`
	},
})

//helper functions

/**
 * get the point on the line (through A and B) which is closest to the point P including its relation to the anchor points of the line (i.e. line segment)
 * @param P which point to check
 * @param A first point on the line
 * @param B second point on the line
 * @returns array of the closest point on the line S to the point P and t: how far along the line the point is according to S=A+t*(B-A). A value between 0 and 1 indicates the point is on the line segment AB
 */
export const closestPointOnLine = (P: SVG.Point, A: SVG.Point, B: SVG.Point): [SVG.Point, number] => {
	let dir = B.sub(A)
	let t = P.sub(A).dot(dir) / dir.dot(dir)
	return [A.add(dir.mul(t)), t]
}
