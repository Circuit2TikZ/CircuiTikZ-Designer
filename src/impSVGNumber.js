/**
 * @module impSVGNumber
 */

import * as SVG from "@svgdotjs/svg.js/dist/svg.esm";

/**
 * @typedef {object} ToUnit
 * @property {number} px
 * @property {number} in
 * @property {number} cm
 * @property {number} mm
 * @property {number} pt
 * @property {number} pc
 */

/**
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
};

/**
 * List of unit names. The unit with the lowest index is the most preferred one.
 * @type {string[]}
 */
const unitPriority = ["px", "in", "pt", "pc", "cm", "mm"];

/**
 * Convert two values to the same unit. The priority for unit is determined using {@link unitPriority}.
 * If the second number is not a instance of {@link SVG.Number}, it is assumed, that both numbers have the same unit.
 *
 * @param {SVG.Number} thisNumber - the first number; this number will be cloned
 * @param {SVG.Number | number} otherNumber - the second number
 * @returns {SVG.Number[]} an array of both numbers
 */
function toSameUnit(thisNumber, otherNumber) {
	const thisNumberUnit = thisNumber.unit || "px"; // Empty == "px"
	const otherNumberUnit = otherNumber.unit || "px";

	if (!(otherNumber instanceof SVG.Number)) {
		thisNumber = new SVG.Number(thisNumber); // clone
		otherNumber = new SVG.Number(otherNumber, thisNumberUnit); // assume same unit
	} else if (thisNumberUnit !== otherNumberUnit) {
		const thisNumberPrio = unitPriority.indexOf(thisNumberUnit);
		const otherNumberPrio = unitPriority.indexOf(otherNumberUnit);

		if (thisNumberPrio < otherNumberPrio) {
			thisNumber = new SVG.Number(thisNumber); // clone
			otherNumber = otherNumber.convertToUnit(thisNumberUnit);
		} else thisNumber = thisNumber.convertToUnit(otherNumberUnit);
	}

	return [thisNumber, otherNumber];
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
	convertToUnit(unit) {
		/** @type {ToUnit} */
		const factors = unitConvertMap[this.unit || "px"] || null;
		const factor = factors?.[unit] ?? null;
		if (factor !== null) return new SVG.Number(this.value * factor, unit);
		else throw new Error("Invalid unit");
	},

	/**
	 * Divides this number by another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the divisor
	 * @returns {SVG.Number} the result
	 */
	divide(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		thisNumber.value /= otherNumber.value;
		return thisNumber;
	},

	/**
	 * Subtracts another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the subtrahend
	 * @returns {SVG.Number} the result
	 */
	minus(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		thisNumber.value -= otherNumber.value;
		return thisNumber;
	},

	/**
	 * Calculates the sum of this number and another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other summand
	 * @returns {SVG.Number} the result
	 */
	plus(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		thisNumber.value += otherNumber.value;
		return thisNumber;
	},

	/**
	 * Multiplies this number with another svg number.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other operand
	 * @returns {SVG.Number} the result
	 */
	times(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		thisNumber.value *= otherNumber.value;
		return thisNumber;
	},

	/**
	 * Calculates the exponentiation using this number as base.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {number} exponent - the exponent
	 * @returns {SVG.Number} the result
	 */
	pow(exponent) {
		let thisNumber = new SVG.Number(this);
		thisNumber.value **= exponent;
		return thisNumber;
	},

	/**
	 * Calculates the remainder (modulo) of an division.
	 * Returns a new instance.
	 *
	 * @this {SVG.Number}
	 * @param {number} number - the divisor
	 * @returns {SVG.Number} the result
	 */
	mod(number) {
		let thisNumber = new SVG.Number(this);
		thisNumber.value %= number;
		return thisNumber;
	},

	/**
	 * Checks if this svg number is greater than the other one.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	gt(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		return thisNumber.value > otherNumber.value;
	},

	/**
	 * Checks if this svg number is greater than the other one or equal.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	gte(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		return thisNumber.value >= otherNumber.value;
	},

	/**
	 * Checks if this svg number is less than the other one.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	lt(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		return thisNumber.value < otherNumber.value;
	},

	/**
	 * Checks if this svg number is less than the other one or equal.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	lte(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		return thisNumber.value <= otherNumber.value;
	},

	/**
	 * Checks if this svg number is equal the other one.
	 *
	 * @this {SVG.Number}
	 * @param {SVG.Number|number} number - the other number
	 * @returns {boolean} the result
	 */
	eq(number) {
		let [thisNumber, otherNumber] = toSameUnit(this, number);
		return thisNumber.value == otherNumber.value;
	},
});

/**
 * Converts number alike values to a plain `number` in the unit pixel.
 *
 * @static
 * @param {string|Number|number|SVG.Number} number
 * @returns {number} a plain `number` in px
 */
SVG.Number.ensureInPx = function (number) {
	if (number instanceof SVG.Number) return number.convertToUnit("px").value;
	let num = Number(number);
	if (Number.isNaN(num)) return new SVG.Number(number).convertToUnit("px").value;
	else return num;
};

SVG.extend(SVG.Point, {
	/**
	 * Calculate the squared distance of two points.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point} other - the other point
	 * @returns {number} the squared distance (px^2)
	 */
	distanceSquared(other) {
		return (this.x - other.x) ** 2 + (this.y - other.y) ** 2;
	},

	/**
	 * Calculate the distance of two points.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point} other - the other point
	 * @returns {number} the squared distance (px)
	 */
	distance(other) {
		return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
	},

	/**
	 * Calculate the length of the vector resp. the distance from (0|0).
	 *
	 * @this {SVG.Point}
	 * @returns {number} the squared length (px^2)
	 */
	absSquared() {
		return this.x ** 2 + this.y ** 2;
	},

	/**
	 * Calculate the length of the vector resp. the distance from (0|0).
	 *
	 * @this {SVG.Point}
	 * @returns {number} the length (px)
	 */
	abs() {
		return Math.sqrt(this.x ** 2 + this.y ** 2);
	},

	/**
	 * Subtracts another svg point.
	 * Returns a new instance.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point} other - the subtrahend
	 * @returns {SVG.Point} the result
	 */
	minus(other) {
		return new SVG.Point(this.x - other.x, this.y - other.y);
	},

	/**
	 * Calculates the sum of this and another svg point.
	 * Returns a new instance.
	 *
	 * @this {SVG.Point}
	 * @param {SVG.Point} other - the other summand
	 * @returns {SVG.Point} the result
	 */
	plus(other) {
		return new SVG.Point(this.x + other.x, this.y + other.y);
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
	rotate(angle, centerCoord, inRad = false) {
		let result = centerCoord ? this.minus(centerCoord) : this.clone();

		const oldX = result.x;
		const oldY = result.y;
		const radians = inRad ? angle : (Math.PI / 180) * angle,
			cos = Math.cos(radians),
			sin = Math.sin(radians);

		result.x = cos * oldX + sin * oldY;
		result.y = -sin * oldX + cos * oldY;

		if (!!centerCoord) {
			result.x += centerCoord.x;
			result.y += centerCoord.y;
		}

		return result;
	},
});
