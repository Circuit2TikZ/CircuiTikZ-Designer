import * as SVG from "@svgdotjs/svg.js"
import { CanvasController, CircuitComponent, ComponentSaveObject, MainController, SnapCursorController, SnapDragHandler, SnappingInfo } from "../internal";
import { selectedBoxWidth, selectionColor } from "../utils/selectionHelper";

export type RectangleSaveObject = ComponentSaveObject & {
	firstPoint:SVG.Point
	secondPoint:SVG.Point,
	fill?:FillInfo,
	stroke?:StrokeInfo,
}

export type StrokeInfo = {
	width?:number,
	color?:SVG.Color|string,
	opacity?:number
}

export type FillInfo = {
	color?:SVG.Color|string,
	opacity?:number
}

export class RectangleComponent extends CircuitComponent{

	private firstPoint:SVG.Point;
	private secondPoint:SVG.Point;
	
	private strokeInfo:StrokeInfo;
	private fillInfo:FillInfo;

	private rectangle:SVG.Rect;
	private size:SVG.Point;

	private selectionRectangle:SVG.Rect=null;
	private rectangleDrag:SVG.Rect

	public constructor(){
		super()
		this.displayName = "Rectangle"

		this.visualization = CanvasController.instance.canvas.group()

		this.fillInfo={
			color:"none",
			opacity:1,
		}
		this.strokeInfo={
			color:"default",
			opacity:1,
			width:1,
		}
		this.rectangle = CanvasController.instance.canvas.rect(0,0)
		this.rectangle.hide()

		this.rectangleDrag = CanvasController.instance.canvas.rect(0,0)
		this.rectangleDrag.attr({
			fill: "transparent",
			stroke: "none",
		});

		this.visualization.add(this.rectangle)
		CanvasController.instance.canvas.add(this.visualization)

		this.visualization.add(this.rectangleDrag)

		SnapCursorController.instance.visible = true;
		this.snappingPoints = []
	}

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color instanceof SVG.Color? this.strokeInfo.color.toString():this.strokeInfo.color
		if (strokeColor=="default") {
			strokeColor = "var(--bs-emphasis-color)"
		}
		
		let fillColor = this.fillInfo.color instanceof SVG.Color? this.fillInfo.color.toString():this.fillInfo.color
		if (fillColor=="default") {
			fillColor = "var(--bs-body-bg)"
		}

		this.rectangle.stroke({
			color:strokeColor,
			opacity:this.strokeInfo.opacity,
			width:this.strokeInfo.opacity==0||strokeColor=="none"?0:this.strokeInfo.width,
		})
		this.rectangle.fill({
			color:fillColor,
			opacity:this.fillInfo.opacity,
		})
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints:[],
			additionalSnappingPoints:[],
		}
		// throw new Error("Method not implemented.");
	}
	public draggable(drag: boolean): void {
		if (drag) {
			this.rectangleDrag.node.classList.add("draggable")
		} else {
			this.rectangleDrag.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag,this.rectangleDrag)
	}
	public moveTo(position: SVG.Point): void {
		let delta = position.sub(this.position)
		this.firstPoint = this.firstPoint.add(delta)
		this.secondPoint = this.secondPoint.add(delta)
		this.update()
	}
	public rotate(angleDeg: number): void {
		throw new Error("Method not implemented.");
	}
	public flip(horizontal: boolean): void {
		throw new Error("Method not implemented.");
	}
	protected update(): void {
		let halfstroke = this.strokeInfo.width/2
		let upperLeft = new SVG.Point(Math.min(this.firstPoint.x,this.secondPoint.x),Math.min(this.firstPoint.y,this.secondPoint.y))
		let lowerRight = new SVG.Point(Math.max(this.firstPoint.x,this.secondPoint.x),Math.max(this.firstPoint.y,this.secondPoint.y))

		this.rectangleDrag.move(upperLeft.x,upperLeft.y).size(lowerRight.x-upperLeft.x,lowerRight.y-upperLeft.y)

		upperLeft = upperLeft.add(halfstroke)
		lowerRight = lowerRight.sub(halfstroke)

		this.position = lowerRight.add(upperLeft).div(2)
		this.size = lowerRight.sub(upperLeft)
		if (this.size.x<0) {
			this.size.x=0
		}
		if (this.size.y<0) {
			this.size.y=0
		}

		this._bbox = new SVG.Box(upperLeft.x,upperLeft.y,this.size.x,this.size.y)

		this.rectangle.size(this.size.x,this.size.y)
		this.rectangle.move(upperLeft.x,upperLeft.y)

		this.relPosition = this.position.sub(upperLeft)
		this.recalculateSelectionVisuals()
	}
	protected recalculateSelectionVisuals(): void {
		if (this.selectionRectangle) {
			this.selectionRectangle.move(this.bbox.x,this.bbox.y);
			this.selectionRectangle.attr("width",this.bbox.w);
			this.selectionRectangle.attr("height",this.bbox.h);
		}
	}
	public viewSelected(show: boolean): void {
		if (show) {
			if (!this.selectionRectangle) {
				this.selectionRectangle = CanvasController.instance.canvas.rect(this.bbox.w,this.bbox.h).move(this.bbox.x,this.bbox.y)
				this.selectionRectangle.attr({
					"stroke-width":selectedBoxWidth,
					"stroke":selectionColor,
					"stroke-dasharray":"3,3",
					"fill":"none"
				});
				this.visualization.stroke("#f00")
			}
		} else {
			this.selectionRectangle?.remove();
			this.visualization.stroke("#000")
			this.selectionRectangle = null
		}
	}
	public toJson(): RectangleSaveObject {
		return {
			type:"rect",
			firstPoint:this.firstPoint,
			secondPoint:this.secondPoint,
		}
	}

	static fromJson(saveObject: RectangleSaveObject): RectangleComponent {
		let rectComponent = new RectangleComponent()
		rectComponent.firstPoint = new SVG.Point(saveObject.firstPoint)
		rectComponent.secondPoint = new SVG.Point(saveObject.secondPoint)
		rectComponent.placeFinish()
		return rectComponent
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
		if (this.secondPoint) {
			return true
		}
		if (!this.firstPoint){
			this.firstPoint = pos
			this.rectangle.show()
			this.placeMove(pos,ev)
			this.updateTheme()
			return false
		}else{
			this.secondPoint = pos
			this.update()
			return true
		}
	}
	public placeFinish(): void {
		if (!this.firstPoint) {
			this.placeStep(new SVG.Point())
		}
		if (!this.secondPoint) {
			this.placeStep(new SVG.Point())
		}
		this.rectangle.show()
		this.draggable(true)
		this.update()
		SnapCursorController.instance.visible=false
	}
}