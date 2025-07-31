import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	CircuitComponent,
	dashArrayToPattern,
	defaultBasicDirection,
	defaultStrokeStyleChoice,
	ExportController,
	ShapeComponent,
	ShapeSaveObject,
	SnapPoint,
	strokeStyleChoices,
} from "../internal"
import { pointInsideRect, roundTikz } from "../utils/selectionHelper"

export type EllipseSaveObject = ShapeSaveObject & {
	position: SVG.Point
	size: SVG.Point
}

export class EllipseComponent extends ShapeComponent {
	private static jsonID = "ellipse"
	static {
		CircuitComponent.jsonSaveMap.set(EllipseComponent.jsonID, EllipseComponent)
	}

	protected declare dragElement: SVG.Ellipse

	public get isCircle() {
		return Math.abs(this.size.x - this.size.y) < 1e-5
	}

	public constructor() {
		super()
		this.addName()
		this.displayName = "Ellipse"

		this.componentVisualization = CanvasController.instance.canvas.ellipse(0, 0)
		this.componentVisualization.hide()

		this.dragElement = CanvasController.instance.canvas.ellipse(0, 0)
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.componentVisualization)

		this.visualization.add(this.dragElement)
	}

	protected update(): void {
		super.update()
		this.componentVisualization.center(this.referencePosition.x, this.referencePosition.y)
		this.dragElement.center(this.referencePosition.x, this.referencePosition.y)
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		let relPositions: { anchorname: string; relPos: SVG.Point }[] = []
		let halfSize = this.size.div(2)
		for (const anchor of basicDirections) {
			if (anchor.key == defaultBasicDirection.key) {
				continue
			}
			let dirLength = anchor.direction.abs()
			dirLength = dirLength == 0 ? 1 : dirLength
			relPositions.push({ relPos: halfSize.mul(anchor.direction.div(dirLength)), anchorname: anchor.name })
			if (dirLength > 1) {
				relPositions.push({ relPos: halfSize.mul(anchor.direction), anchorname: "" })
			}
		}

		if (!this.snappingPoints || this.snappingPoints.length == 0) {
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos.add(halfSize)))
			}
		} else {
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos.add(halfSize))
				snappingPoint.recalculate()
			}
		}
	}

	public toJson(): EllipseSaveObject {
		const data = super.toJson() as EllipseSaveObject
		data.type = EllipseComponent.jsonID
		return data
	}

	public applyJson(saveObject: EllipseSaveObject): EllipseComponent {
		let ellipseComponent = new EllipseComponent()
		ellipseComponent.position = new SVG.Point(saveObject.position)
		ellipseComponent.placePoint = saveObject.position
		ellipseComponent.size = new SVG.Point(saveObject.size)

		ellipseComponent.rotationDeg = saveObject.rotation ?? 0

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				ellipseComponent.fillInfo.color = saveObject.fill.color
				ellipseComponent.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
			}
			if (saveObject.fill.opacity != undefined) {
				ellipseComponent.fillInfo.opacity = saveObject.fill.opacity
				ellipseComponent.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity * 100, "%")
			}
		}

		if (saveObject.stroke) {
			if (saveObject.stroke.color) {
				ellipseComponent.strokeInfo.color = saveObject.stroke.color
				ellipseComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
			}
			if (saveObject.stroke.opacity != undefined) {
				ellipseComponent.strokeInfo.opacity = saveObject.stroke.opacity
				ellipseComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity * 100, "%")
			}
			if (saveObject.stroke.width) {
				ellipseComponent.strokeInfo.width = new SVG.Number(saveObject.stroke.width)
				ellipseComponent.strokeWidthProperty.value = ellipseComponent.strokeInfo.width
			}
			if (saveObject.stroke.style) {
				ellipseComponent.strokeInfo.style = saveObject.stroke.style
				ellipseComponent.strokeStyleProperty.value = strokeStyleChoices.find(
					(item) => item.key == saveObject.stroke.style
				)
			}
		}

		if (saveObject.label) {
			ellipseComponent.labelDistance.value =
				saveObject.label.distance ?
					new SVG.Number(saveObject.label.distance.value, saveObject.label.distance.unit)
				:	new SVG.Number(0, "cm")
			if (ellipseComponent.labelDistance.value.unit == "") {
				ellipseComponent.labelDistance.value.unit = "cm"
			}
			ellipseComponent.anchorChoice.value =
				saveObject.label.anchor ?
					basicDirections.find((item) => item.key == saveObject.label.anchor)
				:	defaultBasicDirection
			ellipseComponent.positionChoice.value =
				saveObject.label.position ?
					basicDirections.find((item) => item.key == saveObject.label.position)
				:	defaultBasicDirection
			ellipseComponent.mathJaxLabel.value = saveObject.label.value
			ellipseComponent.labelColor.value = saveObject.label.color ? new SVG.Color(saveObject.label.color) : null
			ellipseComponent.generateLabelRender()
		}

		ellipseComponent.placeFinish()
		ellipseComponent.updateTheme()
		return ellipseComponent
	}

	public static fromJson(saveObject: EllipseSaveObject): EllipseComponent {
		return new EllipseComponent()
	}

	public toTikzString(): string {
		let optionsArray: string[] = []

		if (this.isCircle) {
			optionsArray.push("shape=circle")
		} else {
			optionsArray.push("shape=ellipse")
		}
		if (this.fillInfo.opacity > 0) {
			if (this.fillInfo.color !== "default") {
				let c = new SVG.Color(this.fillInfo.color)
				optionsArray.push("fill=" + c.toTikzString())
			}

			if (this.fillInfo.opacity != 1) {
				optionsArray.push("fill opacity=" + this.fillInfo.opacity.toString())
			}
		}

		if (this.strokeInfo.opacity > 0) {
			if (this.strokeInfo.color !== "default") {
				let c = new SVG.Color(this.strokeInfo.color)
				optionsArray.push("draw=" + c.toTikzString())
			} else {
				optionsArray.push("draw")
			}

			if (this.strokeInfo.opacity != 1) {
				optionsArray.push("draw opacity=" + this.strokeInfo.opacity.toString())
			}

			let width = this.strokeInfo.width.convertToUnit("pt").value
			if (width != 0.4) {
				optionsArray.push("line width=" + width + "pt")
			}

			if (this.strokeInfo.style != defaultStrokeStyleChoice.key) {
				optionsArray.push(
					dashArrayToPattern(
						this.strokeInfo.width,
						strokeStyleChoices.find((item) => item.key == this.strokeInfo.style).dasharray
					)
				)
			}
		}

		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		optionsArray.push("inner sep=0")
		optionsArray.push(
			"minimum width=" +
				roundTikz(new SVG.Number(this.size.x - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)
		if (!this.isCircle) {
			optionsArray.push(
				"minimum height=" +
					roundTikz(new SVG.Number(this.size.y - strokeWidth, "px").convertToUnit("cm").value) +
					"cm"
			)
		}

		if (this.rotationDeg != 0) {
			optionsArray.push(`rotate=${this.rotationDeg}`)
		}

		let id = this.name.value
		if (!id && this.mathJaxLabel.value) {
			id = ExportController.instance.createExportID("Ellipse")
		}

		let labelNodeStr = ""
		if (this.mathJaxLabel.value) {
			let labelStr = "anchor=" + this.anchorPos.name

			let labelDist = this.labelDistance.value.convertToUnit("cm")

			let labelShift: SVG.Point = new SVG.Point()
			if (this.positionChoice.value.key != defaultBasicDirection.key) {
				labelShift = this.labelPos.direction.mul(-labelDist.value / this.labelPos.direction.abs())
			}
			let posShift = ""
			if (labelShift.x !== 0) {
				posShift += "xshift=" + roundTikz(labelShift.x) + "cm"
			}
			if (labelShift.y !== 0) {
				posShift += posShift == "" ? "" : ", "
				posShift += "yshift=" + roundTikz(-labelShift.y) + "cm"
			}
			posShift = posShift == "" ? "" : "[" + posShift + "]"

			let posStr =
				this.positionChoice.value.key == defaultBasicDirection.key ?
					id + ".center"
				:	id + "." + this.positionChoice.value.name

			let latexStr = this.mathJaxLabel.value ? "$" + this.mathJaxLabel.value + "$" : ""
			latexStr =
				latexStr && this.labelColor.value ?
					"\\textcolor" + this.labelColor.value.toTikzString() + "{" + latexStr + "}"
				:	latexStr

			labelNodeStr = " node[" + labelStr + "] at (" + posShift + posStr + "){" + latexStr + "}"
		}

		let optionsStr = optionsArray.length > 0 ? `[${optionsArray.join(", ")}]` : ""
		return `\\node${optionsStr}${id ? "(" + id + ")" : ""} at ${this.position.toTikzString()}{}${labelNodeStr};`
	}

	public requiredTikzLibraries(): string[] {
		return this.isCircle ? [] : ["shapes.geometric"]
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		if (pointInsideRect(this.position, selectionRectangle)) {
			// if the center of the ellipse is inside the rectangle -> done
			return true
		}
		//the corner points of the selection rectangle
		let boxPoints = [
			[selectionRectangle.x, selectionRectangle.y],
			[selectionRectangle.x2, selectionRectangle.y],
			[selectionRectangle.x2, selectionRectangle.y2],
			[selectionRectangle.x, selectionRectangle.y2],
		]

		// apply transformation, which transforms the ellipse into a unit circle at the origin, to the box points -> the box points now describe some rotated parallelogram instead of a rectangle. this essentially transforms the calculation to an easier problem
		const points = boxPoints.map((point) =>
			new SVG.Point(point[0], point[1]).sub(this.position).rotate(-this.rotationDeg).div(this.size.div(2))
		)

		for (let index = 0; index < points.length - 1; index++) {
			const A = points[index]
			const B = points[(index + 1) % points.length]

			if (A.absSquared() <= 1 || B.absSquared() <= 1) {
				// at least one corner point of the parallelogram is in the unit circle -> collision
				return true
			}

			// from here: no corner point of the current line segment is in the unit circle -> check if line segement cuts through the unit circle

			const AB = B.sub(A)
			const AC = A.mul(-1)

			// t*AB is the projection of AC onto AB, i.e. the closest point of the line described by A and B to the origin
			const t = AC.dot(AB) / AB.absSquared()

			if (t <= 1 && t >= 0) {
				// the closest point of the line through A and B to the origin lies on the line segment AB -> collision possible
				const P = A.add(AB.mul(t))
				if (P.absSquared() <= 1) {
					// the closest point lies inside the unit circle -> collision
					return true
				}
			}
		}

		return false
	}

	public copyForPlacement(): CircuitComponent {
		return new EllipseComponent()
	}

	// public updateLabelPosition(): void {
	// 	if (!this.mathJaxLabel.value || !this.labelRendering) {
	// 		return
	// 	}
	// 	let labelSVG = this.labelRendering
	// 	let transformMatrix = this.getTransformMatrix()
	// 	let useBBox = this.bbox.transform(transformMatrix)
	// 	// get relevant positions and bounding boxes
	// 	let textPos: SVG.Point
	// 	if (this.positionChoice.value.key == defaultBasicDirection.key) {
	// 		textPos = new SVG.Point(this.bbox.cx, this.bbox.cy)
	// 	} else {
	// 		let bboxHalfSize = new SVG.Point(useBBox.w / 2, useBBox.h / 2)
	// 		textPos = this.position.add(
	// 			bboxHalfSize.mul(this.positionChoice.value.direction.div(this.positionChoice.value.direction.abs()))
	// 		)
	// 	}
	// 	let labelBBox = labelSVG.bbox()

	// 	// calculate where on the label the anchor point should be
	// 	let labelRef: SVG.Point
	// 	let labelDist = this.labelDistance.value.convertToUnit("px").value ?? 0
	// 	if (this.anchorChoice.value.key == defaultBasicDirection.key) {
	// 		let clamp = function (value: number, min: number, max: number) {
	// 			if (value < min) {
	// 				return min
	// 			} else if (value > max) {
	// 				return max
	// 			} else {
	// 				return value
	// 			}
	// 		}
	// 		let horizontalTextPosition = clamp(Math.round((2 * (useBBox.cx - textPos.x)) / useBBox.w), -1, 1)
	// 		let verticalTextPosition = clamp(Math.round((2 * (useBBox.cy - textPos.y)) / useBBox.h), -1, 1)
	// 		labelRef = new SVG.Point(horizontalTextPosition, verticalTextPosition)
	// 		this.labelPos = basicDirections.find((item) => item.direction.eq(labelRef))
	// 	} else {
	// 		this.labelPos = this.anchorChoice.value
	// 		labelRef = this.labelPos.direction
	// 	}

	// 	let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w, labelBBox.h)).add(labelRef.mul(labelDist))

	// 	// acutally move the label
	// 	let movePos = textPos.sub(ref)
	// 	labelSVG.transform(new SVG.Matrix({ translate: [movePos.x, movePos.y] }))
	// }
}
