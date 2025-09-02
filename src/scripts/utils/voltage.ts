import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, defaultStroke } from "../internal"

export type VoltageArrowOptions = {
	distanceFromNode?: number
	bump?: number
	shift?: number
	invertSide?: boolean
	invertDirection?: boolean
}

function interpolate(a: SVG.Point, b: SVG.Point, t: number) {
	return b.mul(t).add(a.mul(1 - t))
}

const arrowStrokeWidth = 0.5
const distanceFromLine = 0.08
const currentArrowScale = 16
const defaultRlen = 1.4
const cmtopx = 4800 / 127 // 96px/2.54

export function generateVoltageArrow(
	start: SVG.Point,
	end: SVG.Point,
	northwestDelta: SVG.Point,
	southeastDelta: SVG.Point,
	scale: SVG.Point,
	options?: VoltageArrowOptions
): { arrow: SVG.Element; labelPos: SVG.Point } {
	const group = new SVG.G()

	if (!options) {
		options = {}
	}

	let mirror = scale.y < 0
	const scaleFactor = Math.abs(scale.x)

	let distanceFromNode = options.distanceFromNode ?? 0.5
	let bump = options.bump ?? 1.5
	let shift = options.shift ?? 0
	let invertSide = options.invertSide != undefined ? options.invertSide : false
	let side = invertSide ? -1 : 1
	let invertDirection = options.invertDirection != undefined ? options.invertDirection : false

	let diff = end.sub(start)
	let angle = Math.atan2(diff.y, diff.x)
	let endTrans = end.rotate(angle, start, true)

	const distFromLine = distanceFromLine * defaultRlen * scaleFactor * cmtopx

	let absVShift = side * (1 + shift) * distFromLine

	const midTrans = start.add(endTrans).div(2)
	const mid = start.add(end).div(2)
	const compStart = midTrans.add(new SVG.Point(northwestDelta.x * scaleFactor, 0))
	const compEnd = midTrans.add(new SVG.Point(southeastDelta.x * scaleFactor, 0))

	const arrowScale = (cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth

	const arrowOffset = defaultRlen / currentArrowScale
	let tmp = interpolate(start, compStart, arrowOffset)
	let Vfrom = interpolate(tmp, compStart, distanceFromNode)
	tmp = interpolate(endTrans, compEnd, arrowOffset)
	let Vto = interpolate(tmp, compEnd, distanceFromNode)

	const sin20 = 0.34202 // sin of 20 degrees

	let d: string
	// let sizing = invertSide != mirror ? northwestDelta : southeastDelta
	let sizing = southeastDelta
	if (invertSide != mirror) {
		sizing = northwestDelta
	}
	sizing = mirror ? sizing.mul(-1) : sizing
	let C110 = interpolate(new SVG.Point(), new SVG.Point(-sin20 * Math.abs(sizing.y), sizing.y), bump * scaleFactor)
		.add(mid)
		.add(new SVG.Point(0, absVShift))
		.rotate(-angle, mid, true)
	let C70 = interpolate(new SVG.Point(), new SVG.Point(sin20 * Math.abs(sizing.y), sizing.y), bump * scaleFactor)
		.add(mid)
		.add(new SVG.Point(0, absVShift))
		.rotate(-angle, mid, true)
	let Vfrom1 = Vfrom.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
	let Vto1 = Vto.add(new SVG.Point(0, absVShift)).rotate(-angle, start, true)
	d = `M${Vfrom1.toSVGPathString()}C${C110.toSVGPathString()} ${C70.toSVGPathString()} ${Vto1.toSVGPathString()}`

	let arrowAngleDiff: SVG.Point
	let arrowPos = Vto1
	if (invertDirection) {
		arrowAngleDiff = Vfrom1.sub(C110)
		arrowPos = Vfrom1
	} else {
		arrowAngleDiff = Vto1.sub(C70)
	}
	let arrowAngle = Math.atan2(arrowAngleDiff.y, arrowAngleDiff.x)

	const path = new SVG.Path({ d: d })
	path.fill("none").stroke({ color: defaultStroke, width: arrowStrokeWidth })
	const arrowTip = CanvasController.instance.canvas.use("currarrow").fill(defaultStroke)
	const arrowTipTransform = new SVG.Matrix({
		translate: [-1.7 + (2 * arrowStrokeWidth) / arrowScale, -0.8],
	}).lmultiply({
		scale: arrowScale,
		rotate: (180 * arrowAngle) / Math.PI,
		translate: arrowPos,
	})
	arrowTip.transform(arrowTipTransform)

	group.add(path)
	group.add(arrowTip)

	return { arrow: group, labelPos: C110.add(C70).div(2) }
}
