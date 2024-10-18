import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, ComponentSaveObject, MainController, SnapController, SnapCursorController, SnapPoint } from "../internal"
import { AdjustDragHandler, SnapDragHandler } from "../snapDrag/dragHandlers";
import { lineRectIntersection, pathPointRadius, pathPointSVG, pointInsideRect, selectionColor } from "../utils/selectionHelper";

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

	private draggingLineWidth=10
	private adjustmentPoints:SVG.Element[]=[]
	
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

	public getSnapPointTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix()
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		this.snappingPoints[0].updateRelPosition(this.cornerPoints[0].sub(this.position))
		this.snappingPoints[1].updateRelPosition(this.cornerPoints.at(-1).sub(this.position))
		super.recalculateSnappingPoints()
	}

	public getPlacingSnappingPoints(): SnapPoint[] {
		return this.finishedPlacing?this.snappingPoints:[new SnapPoint(this,"center",new SVG.Point())]
	}
	public draggable(drag: boolean): void {
		if (drag) {
			this.draggableLine.node.classList.add("draggable")
		} else {
			this.draggableLine.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag,this.draggableLine)

		let dirs:SVG.Point[] = []
		for (let index = 0; index < this.lineDirections.length; index++) {
			let rel = this.cornerPoints[index+1].sub(this.cornerPoints[index])
			dirs[index] = this.lineDirections[index] == LineDirection.VH?
			new SVG.Point(0,Math.sign(rel.y)):
			new SVG.Point(Math.sign(rel.x),0)
		}

		for (let index = 0; index < this.adjustmentPoints.length; index++) {
			const element = this.adjustmentPoints[index];
			if (drag) {
				element.node.classList.add("draggable")
				element.node.classList.remove("d-none")
			}else{
				element.node.classList.remove("draggable")
				element.node.classList.add("d-none")
			}
			AdjustDragHandler.snapDrag(this,element,drag,{
				dragMove:(pos,ev)=>{
					if (ev&&(ev.ctrlKey||(MainController.instance.isMac&&ev.metaKey))) {
						if (index>0) {
							this.lineDirections[index-1]=LineDirection.Straight
						}
						this.lineDirections[index]=LineDirection.Straight
					}else{
						if (index>0) {
							dirs[index-1] = this.directionVecFromPos(pos.sub(this.cornerPoints[index-1]),dirs[index-1])
							this.lineDirections[index-1]=this.lineDirectionFromDirectionVec(dirs[index-1],ev)
						}
						if (index<this.adjustmentPoints.length-1) {
							let rel = pos.sub(this.cornerPoints[index+1])
							dirs[index] = this.directionVecFromPos(rel,dirs[index])
							let dir = dirs[index].x!=0?new SVG.Point(0,rel.y):new SVG.Point(rel.x,0)
							this.lineDirections[index]=this.lineDirectionFromDirectionVec(dir,ev)
						}
					}
					this.cornerPoints[index].x=pos.x
					this.cornerPoints[index].y=pos.y
					this.updateTransform()
				}
			})
		}
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
		for (let index = 0; index < this.adjustmentPoints.length; index++) {
			this.adjustmentPoints[index].move(this.cornerPoints[index].x-pathPointRadius,this.cornerPoints[index].y-pathPointRadius)
		}

		let pointArray = new SVG.PointArray(this.cornerPoints[0].toArray())
		for (let index = 0; index < this.lineDirections.length; index++) {
			const direction = this.lineDirections[index];
			const lastPoint = this.cornerPoints[index];
			const point = this.cornerPoints[index+1];
			if (direction==LineDirection.HV) {
				pointArray.push(new SVG.Point(point.x,lastPoint.y).toArray())
			} else if(direction==LineDirection.VH){
				pointArray.push(new SVG.Point(lastPoint.x,point.y).toArray())
			}
			pointArray.push(point.toArray())
		}

		this.line.clear()
		this.line.plot(pointArray)
		this.draggableLine.clear()
		this.draggableLine.plot(pointArray)
		
		this._bbox = this.line.bbox()

		this.position.x = this._bbox.cx
		this.position.y = this._bbox.cy

		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))
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
			const dir = this.lineDirections[index]??"-|";
			const point = this.cornerPoints[index+1];
			outString+=" "+dir+" "+point.toTikzString()
		}
		return outString+";"
	}
	public copyForPlacement(): LineComponent {
		return new LineComponent();
	}
	public remove(): void {
		this.visualization.remove()
		this.viewSelected(false)
		if (this.finishedPlacing) {
			this.draggable(false)
		}
	}
	public placeMove(pos: SVG.Point, ev?:MouseEvent): void {
		SnapCursorController.instance.moveTo(pos)
		if (this.cornerPoints.length>1) {
			let lastPoint = this.cornerPoints.at(-2)
			let relToLastPoint = pos.sub(lastPoint)

			this.lastPlacingDirection=this.directionVecFromPos(relToLastPoint,this.lastPlacingDirection)
			this.lineDirections[this.lineDirections.length-1]=this.lineDirectionFromDirectionVec(this.lastPlacingDirection,ev)

			this.cornerPoints[this.cornerPoints.length-1] = pos
			this.updateTransform()
		}
	}

	private directionVecFromPos(relPos:SVG.Point,lastDirection:SVG.Point):SVG.Point{
		var dir = lastDirection.clone()
		if (relPos.y!=0&&relPos.x*lastDirection.x<0) {
			dir.x=0
			dir.y=Math.sign(relPos.y)
		}else if(relPos.x!=0&&relPos.y*lastDirection.y<0){
			dir.x=Math.sign(relPos.x)
			dir.y=0
		}
		return dir
	}

	private lineDirectionFromDirectionVec(directionVec:SVG.Point,ev?:MouseEvent):LineDirection{
		if (ev&&(ev.ctrlKey||(MainController.instance.isMac&&ev.metaKey))) {
			return LineDirection.Straight
		}else if (directionVec.x!=0) {
			return LineDirection.HV
		}else if(directionVec.y!=0){
			return LineDirection.VH
		}
	}

	public placeStep(pos: SVG.Point): boolean {
		SnapCursorController.instance.visible=false
		if (this.cornerPoints.length>0) {
			let lastPoint = this.cornerPoints.at(-2) // there is never only one corner point in the array
			if (pos.x==lastPoint.x&&pos.y==lastPoint.y) {
				return true
			}
		}else{
			this.cornerPoints.push(pos.clone())
		}

		this.cornerPoints.push(pos)
		this.lineDirections.push(LineDirection.HV)
		this.lastPlacingDirection.x=1
		this.lastPlacingDirection.y=0

		this.placeMove(pos)
		
		return false
	}

	public placeFinish(): void {
		if (this.finishedPlacing) {
			return
		}
		
		SnapCursorController.instance.visible=false
		if (this.cornerPoints.length<=2) {
			MainController.instance.removeComponent(this)
			return
		}
		
		this.cornerPoints.pop()
		this.lineDirections.pop()
		this.snappingPoints = [new SnapPoint(this,"START",this.cornerPoints[0].sub(this.position)),
								new SnapPoint(this,"END",this.cornerPoints.at(-1).sub(this.position))]
		SnapController.instance.addSnapPoints(this.snappingPoints)
		
		for (const cornerPoint of this.cornerPoints) {
			let element = pathPointSVG().move(cornerPoint.x-pathPointRadius,cornerPoint.y-pathPointRadius)
			this.visualization.add(element)
			this.adjustmentPoints.push(element)
		}
		
		this.draggable(true)
		this.updateTransform()
		this.recalculateSnappingPoints()

		this.finishedPlacing = true
	}

	public static fromJson(saveObject: LineSaveObject): LineComponent {
		let lineComponent: LineComponent = new LineComponent()
		lineComponent.cornerPoints.push(new SVG.Point(saveObject.start))
		if (Object.hasOwn(saveObject,"segments")) {
			for (const segment of saveObject.segments) {
				lineComponent.cornerPoints.push(new SVG.Point(segment.position))
				lineComponent.lineDirections.push(segment.direction)
			}
		}else{
			// @ts-ignore backwards compatibility
			for (const point of saveObject.others) {
				let dir = point.dir==0?LineDirection.Straight:point.dir==1?LineDirection.HV:LineDirection.VH
				// @ts-ignore backwards compatibility
				lineComponent.cornerPoints.push(new SVG.Point(point.x,point.y))
				lineComponent.lineDirections.push(dir)
			}
		}
		lineComponent.placeFinish()

		return lineComponent;
	}
}