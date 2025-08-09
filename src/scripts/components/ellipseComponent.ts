import * as SVG from "@svgdotjs/svg.js"
import {
	basicDirections,
	CanvasController,
	CircuitComponent,
	defaultBasicDirection,
	ShapeComponent,
	ShapeSaveObject,
	SnapPoint,
	TikzNodeCommand,
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

	declare protected dragElement: SVG.Ellipse

	public get isCircle() {
		return Math.abs(this.size.x - this.size.y) < 1e-5
	}

	public constructor() {
		super()
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

	public applyJson(saveObject: EllipseSaveObject) {
		super.applyJson(saveObject)

		this.update()
		this.componentVisualization.show()
		this.updateTheme()
	}

	public static fromJson(saveObject: EllipseSaveObject): EllipseComponent {
		return new EllipseComponent()
	}

	protected buildTikzCommand(command: TikzNodeCommand): void {
		if (this.isCircle) {
			command.options.push("shape=circle")
		} else {
			command.options.push("shape=ellipse")
		}
		super.buildTikzCommand(command)

		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		command.options.push(
			"minimum width=" +
				roundTikz(new SVG.Number(this.size.x - strokeWidth, "px").convertToUnit("cm").value) +
				"cm"
		)
		if (!this.isCircle) {
			command.options.push(
				"minimum height=" +
					roundTikz(new SVG.Number(this.size.y - strokeWidth, "px").convertToUnit("cm").value) +
					"cm"
			)
		}
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
}
