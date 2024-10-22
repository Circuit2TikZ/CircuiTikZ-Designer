import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, CircuitComponent, ComponentSaveObject, MainController, SnapCursorController, SnappingInfo } from "../internal";

export type RectangleSaveObject = ComponentSaveObject & {
	color:SVG.Color
}

export type StrokeInfo = {
	thickness?:number,
	color?:SVG.Color,
	opacity?:number,
	dashedMode?:string
}

export type FillInfo = {
	color?:SVG.Color,
	opacity?:number
}

export class RectangleComponent extends CircuitComponent{

	private firstPoint:SVG.Point;
	private secondPoint:SVG.Point;
	
	private strokeInfo:StrokeInfo;
	private fillInfo:FillInfo;

	private rectangle:SVG.Rect;

	public constructor(){
		super()
		this.displayName = "Rectangle"

		this.visualization = CanvasController.instance.canvas.group()

		this.rectangle = CanvasController.instance.canvas.rect(0,0)
		this.rectangle.hide()

		this.visualization.add(this.rectangle)
		CanvasController.instance.canvas.add(this.visualization)

		SnapCursorController.instance.visible = true;
	}

	public updateTheme(): void {
		
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints:[],
			additionalSnappingPoints:[],
		}
		// throw new Error("Method not implemented.");
	}
	public draggable(drag: boolean): void {
		// throw new Error("Method not implemented.");
	}
	public moveTo(position: SVG.Point): void {
		throw new Error("Method not implemented.");
	}
	public rotate(angleDeg: number): void {
		throw new Error("Method not implemented.");
	}
	public flip(horizontal: boolean): void {
		throw new Error("Method not implemented.");
	}
	protected update(): void {
		let upperLeft = new SVG.Point(Math.min(this.firstPoint.x,this.secondPoint.x),Math.min(this.firstPoint.y,this.secondPoint.y))
		let lowerRight = new SVG.Point(Math.max(this.firstPoint.x,this.secondPoint.x),Math.max(this.firstPoint.y,this.secondPoint.y))

		this.rectangle.width(lowerRight.x-upperLeft.x)
		this.rectangle.height(lowerRight.y-upperLeft.y)
		this.rectangle.move(upperLeft.x,upperLeft.y)
	}
	protected recalculateSelectionVisuals(): void {
		throw new Error("Method not implemented.");
	}
	public viewSelected(show: boolean): void {
		// throw new Error("Method not implemented.");
	}
	public toJson(): ComponentSaveObject {
		throw new Error("Method not implemented.");
	}
	public toTikzString(): string {
		throw new Error("Method not implemented.");
	}
	public copyForPlacement(): CircuitComponent {
		return new RectangleComponent()
	}
	public remove(): void {
		this.visualization.remove()
	}
	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (!this.firstPoint) {
			// not started placing
			SnapCursorController.instance.moveTo(pos)
		}else{
			this.secondPoint = pos
			this.update()
		}
	}
	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		if (!this.firstPoint){
			this.firstPoint = pos
			this.rectangle.show()
			this.placeMove(pos,ev)
			return false
		}else{
			this.secondPoint = pos
			this.update()
			SnapCursorController.instance.visible=false
			return true
		}
	}
	public placeFinish(): void {
		this.update()
	}

}