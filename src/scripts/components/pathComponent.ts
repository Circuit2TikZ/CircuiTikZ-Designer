import * as SVG from "@svgdotjs/svg.js";
import { CircuitikzComponent } from "../internal"

export class PathComponent extends CircuitikzComponent{
	public posStart: SVG.Point
	public posEnd: SVG.Point

	public copyForPlacement(): PathComponent {
		return new PathComponent(this.referenceSymbol)
	}
}