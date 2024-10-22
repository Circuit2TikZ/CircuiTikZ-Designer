import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitComponent, ComponentSaveObject, MainController, SnapCursorController, SnappingInfo, SnapPoint } from "../internal"
import { AdjustDragHandler, SnapDragHandler } from "../snapDrag/dragHandlers";
import { lineRectIntersection, pathPointRadius, pathPointSVG, pointInsideRect, selectionColor } from "../utils/selectionHelper";

/**
 * how the line should be drawn. horizontal then vertical, vertical then horizontal or straight
 */
export enum LineDirection {
	Straight = "--",
	HV = "-|",
	VH = "|-"
}

/**
 * one line segement has a destination and a line direction
 */
export type LineSegment = {
	position: {x:number, y:number}
	direction: LineDirection
}

/**
 * a line consists of a starting position and at least one line segment
 */
export type LineSaveObject = ComponentSaveObject &  {
	start: {x:number, y:number}
	segments: LineSegment[]
}

/**
 * The component responsible for multi segmented lines (polylines)/wires
 */
export class LineComponent extends CircuitComponent{
	
	/**
	 * the corner points when drawing
	 */
	private cornerPoints:SVG.Point[]
	/**
	 * the line directions when drawing
	 */
	private lineDirections:LineDirection[]
	// useful for placing
	private lastPlacingDirection=new SVG.Point(1,0)

	// essentially the main visualisation
	private line:SVG.Polyline
	// a wider copy of line, but invisible, Meant for dragging the line
	private draggableLine:SVG.Polyline
	private draggingLineWidth=10

	// the svg elements where adjusting the line is possible
	private adjustmentPoints:SVG.Element[]=[]
	
	constructor(){
		super()
		this.cornerPoints = []
		this.lineDirections = []
		SnapCursorController.instance.visible = true
		this.displayName = "Line"

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
		// snap points don't have to be transformed for lines
		return new SVG.Matrix()
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		// first update the relative positions of the snapping points w.r.t. the line, i.e. the start and end positions
		this.snappingPoints[0]?.updateRelPosition(this.cornerPoints[0].sub(this.position))
		this.snappingPoints[1]?.updateRelPosition(this.cornerPoints.at(-1).sub(this.position))
		super.recalculateSnappingPoints()
	}

	public getSnappingInfo(): SnappingInfo {
		if (this.finishedPlacing) {
			// only snap to the snapping points
			return {
				trackedSnappingPoints:this.snappingPoints,
				additionalSnappingPoints:[]
			}
		} else {
			// only snap the cursor
			return {
				trackedSnappingPoints:[],
				additionalSnappingPoints:this.cornerPoints.length>0?[new SnapPoint(this,"center",new SVG.Point())]:[]
			}
		}
	}
	public draggable(drag: boolean): void {
		if (drag) {
			this.draggableLine.node.classList.add("draggable")
		} else {
			this.draggableLine.node.classList.remove("draggable")
		}
		// actually enable/disable dragging for the line itself. This should be done with the draggable line
		SnapDragHandler.snapDrag(this,drag,this.draggableLine)

		// pre calculate the direction of the line as a vector from the linedirection objects
		let dirs:SVG.Point[] = []
		for (let index = 0; index < this.lineDirections.length; index++) {
			let rel = this.cornerPoints[index+1].sub(this.cornerPoints[index])
			dirs[index] = this.lineDirections[index] == LineDirection.VH?
														new SVG.Point(0,Math.sign(rel.y)):
														new SVG.Point(Math.sign(rel.x),0)
		}

		// add dragging to all corner points
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
						// lines from and to this point should be straight
						if (index>0) {
							this.lineDirections[index-1]=LineDirection.Straight
						}
						this.lineDirections[index]=LineDirection.Straight
					}else{
						// change the line direction if necessary
						if (index>0) {
							// from the last point to this point
							dirs[index-1] = this.directionVecFromPos(pos.sub(this.cornerPoints[index-1]),dirs[index-1])
							this.lineDirections[index-1]=this.lineDirectionFromDirectionVec(dirs[index-1],ev)
						}
						if (index<this.adjustmentPoints.length-1) {
							// from this point to the next point
							let rel = pos.sub(this.cornerPoints[index+1])
							dirs[index] = this.directionVecFromPos(rel,dirs[index])
							let dir = dirs[index].x!=0?new SVG.Point(0,rel.y):new SVG.Point(rel.x,0)
							this.lineDirections[index]=this.lineDirectionFromDirectionVec(dir,ev)
						}
					}
					this.cornerPoints[index].x=pos.x
					this.cornerPoints[index].y=pos.y
					this.update()
				}
			})
		}
	}
	public moveTo(position: SVG.Point): void {
		for (let index = 0; index < this.cornerPoints.length; index++) {
			this.cornerPoints[index] = this.cornerPoints[index].sub(this.position).add(position)
		}
		this.update()
	}
	public rotate(angleDeg: number): void {
		// rotate all points around the component reference position
		this.cornerPoints = this.cornerPoints.map((point)=>point.rotate(angleDeg,this.position))
		// adjust all line directions (flip HV and VH)
		this.lineDirections = this.lineDirections.map((dir)=>{
			if (dir==LineDirection.HV) {
				return LineDirection.VH
			}else if (dir==LineDirection.VH) {
				return LineDirection.HV
			}else{
				return LineDirection.Straight
			}
		})
		this.update()
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
	protected update(): void {
		//update the points where the line can be adjusted
		for (let index = 0; index < this.adjustmentPoints.length; index++) {
			this.adjustmentPoints[index].move(this.cornerPoints[index].x-pathPointRadius,this.cornerPoints[index].y-pathPointRadius)
		}

		// generate all the points in the line from the corner points and the line directions
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

		// actually plot the points
		this.line.clear()
		this.line.plot(pointArray)
		this.draggableLine.clear()
		this.draggableLine.plot(pointArray)
		
		//recalculate the bounding box and position
		this._bbox = this.line.bbox()
		this.position.x = this._bbox.cx
		this.position.y = this._bbox.cy
		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))

		// update visuals
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}
	protected recalculateSelectionVisuals(): void {}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		//essentially check each line segment if via a line rect intersection
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
		//only move the last corner point in the array
		SnapCursorController.instance.moveTo(pos)
		if (this.cornerPoints.length>1) {
			let lastPoint = this.cornerPoints.at(-2)
			let relToLastPoint = pos.sub(lastPoint)

			this.lastPlacingDirection=this.directionVecFromPos(relToLastPoint,this.lastPlacingDirection)
			this.lineDirections[this.lineDirections.length-1]=this.lineDirectionFromDirectionVec(this.lastPlacingDirection,ev)

			this.cornerPoints[this.cornerPoints.length-1] = pos
			this.update()
		}
	}

	/**
	 * This essentially adjusts the line direction if necessary. If the cursor crosses the axis perpendicular to the previous initial direction of the line segment, this axis should now be the initial direction of the line segment
	 * @param relPos the current position relative to the position of the previous point
	 * @param lastDirection in which direction the line was previously starting
	 * @returns the adjusted direction
	 */
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
			//if there already exists a line, check if the same point was placed twice --> if so, the line placement should end
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
			//was already called
			return
		}
		
		SnapCursorController.instance.visible=false
		
		// remove the point which was currently being placed (not actually part of the line)
		this.cornerPoints.pop()
		this.lineDirections.pop()

		if (this.cornerPoints.length<2) {
			// if not event 2 corner points --> not a line
			MainController.instance.removeComponent(this)
			return
		}

		this.snappingPoints = [new SnapPoint(this,"START",this.cornerPoints[0].sub(this.position)),
								new SnapPoint(this,"END",this.cornerPoints.at(-1).sub(this.position))]
		
		// add the corner adjustment points
		for (const cornerPoint of this.cornerPoints) {
			let element = pathPointSVG().move(cornerPoint.x-pathPointRadius,cornerPoint.y-pathPointRadius)
			this.visualization.add(element)
			this.adjustmentPoints.push(element)
		}
		
		this.draggable(true)
		this.update()

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
			// @ts-ignore: backwards compatibility
			for (const point of saveObject.others) {
				let dir = point.dir==0?LineDirection.Straight:point.dir==1?LineDirection.HV:LineDirection.VH
				// @ts-ignore: backwards compatibility
				lineComponent.cornerPoints.push(new SVG.Point(point.x,point.y))
				lineComponent.lineDirections.push(dir)
			}
		}
		lineComponent.cornerPoints.push(new SVG.Point())
		lineComponent.lineDirections.push(LineDirection.Straight)
		lineComponent.placeFinish()

		return lineComponent;
	}
}