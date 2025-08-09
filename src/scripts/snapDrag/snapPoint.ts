/**
 * @module snapPoint
 */

import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, CircuitComponent } from "../internal"
import { selectionColor } from "../utils/selectionHelper"

/**
 * Realizes a point which is relative to another point. This can be used to recreate CircuiTikZ anchors, which are
 * relative to components. This is useful for snap points.
 */
export class SnapPoint extends SVG.Point {
	public componentReference: CircuitComponent // to which component this snapPoint belongs
	private anchorName: string // the name of the snap point (i.e. G, D, S, center...)
	private relPosition: SVG.Point // the position of this snapPoint relative to the component center

	private element: SVG.Element

	constructor(componentReference: CircuitComponent, anchorName: string, relPosition: SVG.Point) {
		super()
		this.componentReference = componentReference
		this.anchorName = anchorName
		this.relPosition = relPosition
		this.recalculate()
	}

	public recalculate(transformMatrix: SVG.Matrix = this.componentReference.getTransformMatrix()) {
		const point = this.relPosition.transform(transformMatrix)
		this.x = point.x
		this.y = point.y

		if (this.element) {
			this.element.center(this.x, this.y)
		}
	}

	public updateRelPosition(relPosition: SVG.Point) {
		this.relPosition = relPosition
	}

	public relToComponentAnchor(): SVG.Point {
		return this.sub(this.componentReference.position)
	}

	public show(show = true, moving = false) {
		if (show) {
			if (!this.element) {
				const container = CanvasController.instance.canvas
				this.element = container
					.circle(4)
					.fill("none")
					.stroke({ color: moving ? "var(--bs-cyan)" : selectionColor, width: 1 })
				this.element.node.style.pointerEvents = "none"
				this.componentReference.visualization.before(this.element)
				this.element.center(this.x, this.y)
			}
		} else {
			this.element?.remove()
			this.element = null
		}
	}
}
