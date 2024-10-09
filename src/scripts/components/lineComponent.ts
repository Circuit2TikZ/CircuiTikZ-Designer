import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, ComponentSaveObject, FormEntry, MainController, SelectionController, SnapCursorController, SnapPoint } from "../internal"
import { AdjustDragHandler, SnapDragHandler } from "../snapDrag/dragHandlers";
import { lineRectIntersection, pointInsideRect, selectionColor } from "../utils/selectionHelper";

export enum LineDirection {
	Straight = "--",
	HV = "-|",
	VH = "|-"
}

export type LineSegment = {
	position: {x:number, y:number}
	direction: LineDirection
}

export type LineSaveObject = ComponentSaveObject &  {
	start: {x:number, y:number}
	segments: LineSegment[]
}

export class LineComponent extends CircuitComponent{
	
	private cornerPoints:SVG.Point[]
	private lineDirections:LineDirection[]
	private lastPlacingDirection=new SVG.Point(1,0)

	private line:SVG.Polyline
	private draggableLine:SVG.Polyline

	private isSelected=false

	private draggingLineWidth=20
	
	constructor(){
		super()
		this.cornerPoints = []
		this.lineDirections = []
		SnapCursorController.instance.visible = true

		this.visualization = CanvasController.instance.canvas.group()
		this.line = CanvasController.instance.canvas.polyline()
		this.line.attr({
			fill: "none",
			stroke: MainController.instance.darkMode?"#fff":"#000",
			"stroke-width": "0.4pt",
		});
		this.draggableLine = CanvasController.instance.canvas.polyline()
		this.draggableLine.attr({
			fill: "none",
			stroke: "transparent",
			"stroke-width": this.draggingLineWidth,
		});

		this.visualization.add(this.line)
		this.visualization.add(this.draggableLine)
		this.snappingPoints=[]
	}

	public updateTheme(): void {
		if (!this.isSelected) {
			this.line.stroke(MainController.instance.darkMode?"#fff":"#000");
		}
	}

	public getPlacingSnappingPoints(): SnapPoint[] {
		return [new SVG.Point() as SnapPoint]
	}
	public draggable(drag: boolean): void {
		// if (drag) {
		// 	this.draggableLine.node.classList.add("draggable")
		// } else {
		// 	this.draggableLine.node.classList.remove("draggable")
		// }
		// this.draggableLine.draggable(drag)
		// AdjustDragHandler.snapDrag(this,this.draggableLine,drag,{
		// 	dragMove:(pos)=>{
		// 		if (SelectionController.instance.isComponentSelected(this)) {
		// 			SelectionController.instance.moveSelectionRel(pos.sub(this.position))
		// 		}else{
		// 			this.moveTo(pos)
		// 		}
		// 		this.recalculateSnappingPoints()
		// 	},
		// })
		SnapDragHandler.snapDrag(this,drag)
	}
	public moveTo(position: SVG.Point): void {
		for (let index = 0; index < this.cornerPoints.length; index++) {
			this.cornerPoints[index] = this.cornerPoints[index].sub(this.position).add(position)
		}
		this.updateTransform()
	}
	public rotate(angleDeg: number): void {
		this.cornerPoints = this.cornerPoints.map((point)=>point.rotate(angleDeg,this.position))
		this.lineDirections = this.lineDirections.map((dir)=>{
			if (dir==LineDirection.HV) {
				return LineDirection.VH
			}else if (dir==LineDirection.VH) {
				return LineDirection.HV
			}else{
				return LineDirection.Straight
			}
		})
		this.updateTransform()
		this.recalculateSnappingPoints()
	}
	public flip(horizontal: boolean): void {
		if (horizontal) {
			this.cornerPoints = this.cornerPoints.map((point)=>{
				return new SVG.Point(point.x,2*this.position.y-point.y)
			})
		}else{
			this.cornerPoints = this.cornerPoints.map((point)=>{
				return new SVG.Point(2*this.position.x-point.x,point.y)
			})
		}
	}
	protected updateTransform(): void {
		let pointArray = new SVG.PointArray(this.cornerPoints[0].toArray())
		for (let index = 0; index < this.lineDirections.length; index++) {
			const direction = this.lineDirections[index];
			const lastPoint = this.cornerPoints[index];
			const point = this.cornerPoints[index+1];
			if (direction==LineDirection.HV) {
				pointArray.push(new SVG.Point(lastPoint.x,point.y).toArray())
			} else if(direction==LineDirection.VH){
				pointArray.push(new SVG.Point(point.x,lastPoint.y).toArray())
			}
			pointArray.push(point.toArray())
		}
		this.line.clear()
		this.line.plot(pointArray)
		this.draggableLine.clear()
		this.draggableLine.plot(pointArray)
		
		this._bbox = this.visualization.bbox()

		this.position.x = this._bbox.cx
		this.position.y = this._bbox.cy

		this.relPosition = this.position.sub(new SVG.Point())
	}
	protected recalculateSelectionVisuals(): void {}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		let pointsArray = this.line.array()
		let allPointsInside = pointInsideRect(new SVG.Point(pointsArray[0]),selectionRectangle);
		for (let idx = 0; idx < pointsArray.length-1; idx++) {
			let p2 = pointsArray[idx+1];
			let lineSegment = [pointsArray[idx],p2];

			if (allPointsInside) {
				allPointsInside = pointInsideRect(new SVG.Point(p2),selectionRectangle)
			}

			if (lineRectIntersection(lineSegment, selectionRectangle)) {
				return true;
			}
		}

		return allPointsInside;
	}
	public viewSelected(show: boolean): void {
		this.isSelected = show;
		if (show) {
			this.line.attr({
				"stroke":selectionColor,
				// "stroke-width": selectedWireWidth,
			});
		} else {
			this.line.attr({
				"stroke":MainController.instance.darkMode?"#fff":"#000",
				// "stroke-width": "0.4pt",
			});
		}
	}
	public toJson(): LineSaveObject {
		let others:LineSegment[] = []
		for (let index = 0; index < this.lineDirections.length; index++) {
			let segment:LineSegment = {
				position:{
					x:this.cornerPoints[index+1].x,
					y:this.cornerPoints[index+1].y
				},
				direction: this.lineDirections[index]
			}
			others.push(segment)
		}

		let data:LineSaveObject = {
			type:"wire",
			start:{x:this.cornerPoints[0].x,y:this.cornerPoints[0].y},
			segments:others
		}

		return data
	}
	public toTikzString(): string {
		let outString = "\\draw "+this.cornerPoints[0].toTikzString()
		for (let index = 0; index < this.lineDirections.length; index++) {
			const dir = this.lineDirections[index];
			const point = this.cornerPoints[index+1];
			outString+=" "+dir+" "+point.toTikzString()
		}
		return outString+";"
	}
	public getFormEntries(): FormEntry[] {
		throw new Error("Method not implemented.");
	}
	public copyForPlacement(): LineComponent {
		return new LineComponent();
	}
	public remove(): void {
		this.visualization.remove()
	}
	public placeMove(pos: SVG.Point, ev?:MouseEvent): void {
		SnapCursorController.instance.moveTo(pos)
		if (this.cornerPoints.length>1) {
			let lastPoint = this.cornerPoints.at(-2)
			let relToLastPoint = pos.sub(lastPoint)

			if (relToLastPoint.x*this.lastPlacingDirection.x<0) {
				this.lastPlacingDirection.x=0
				this.lastPlacingDirection.y=Math.sign(relToLastPoint.y)
			}else if(relToLastPoint.y*this.lastPlacingDirection.y<0){
				this.lastPlacingDirection.x=Math.sign(relToLastPoint.x)
				this.lastPlacingDirection.y=0
			}

			if (ev&&(ev.ctrlKey||(MainController.instance.isMac&&ev.metaKey))) {
				this.lineDirections[this.lineDirections.length-1]=LineDirection.Straight
			}else if (this.lastPlacingDirection.x!=0) {
				this.lineDirections[this.lineDirections.length-1]=LineDirection.VH
			}else if(this.lastPlacingDirection.y!=0){
				this.lineDirections[this.lineDirections.length-1]=LineDirection.HV
			}

			this.cornerPoints[this.cornerPoints.length-1] = pos
			this.updateTransform()
		}
	}
	public placeStep(pos: SVG.Point): boolean {
		SnapCursorController.instance.visible=false
		if (this.cornerPoints.length>0) {
			let lastPoint = this.cornerPoints.at(-2)
			if (pos.x==lastPoint.x&&pos.y==lastPoint.y) {
				return true
			}
		}else{
			this.cornerPoints.push(pos)
		}

		this.cornerPoints.push(pos)
		this.lineDirections.push(LineDirection.HV)
		this.lastPlacingDirection.x=1
		this.lastPlacingDirection.y=0

		this.placeMove(pos)
		
		return false
	}
	public placeFinish(): void {
		SnapCursorController.instance.visible=false
		if (this.cornerPoints.length>0) {
			this.placeStep(this.cornerPoints.at(-1))
		}else{
			MainController.instance.removeComponent(this)
		}
		this.cornerPoints.pop()
		this.lineDirections.pop()
		this.draggable(true)
	}
	public static fromJson(saveObject: LineSaveObject): LineComponent {
		let lineComponent: LineComponent = new LineComponent()
		lineComponent.cornerPoints.push(new SVG.Point(saveObject.start))
		for (const segment of saveObject.segments) {
			lineComponent.cornerPoints.push(new SVG.Point(segment.position))
			lineComponent.lineDirections.push(segment.direction)
		}
		lineComponent.placeFinish()
		lineComponent.updateTransform()
		lineComponent.recalculateSnappingPoints()

		return lineComponent;
	}
}