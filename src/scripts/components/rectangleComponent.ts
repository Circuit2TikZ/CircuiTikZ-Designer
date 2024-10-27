import * as SVG from "@svgdotjs/svg.js"
import { anchorDirectionMap, CanvasController, CircuitComponent, ColorProperty, ComponentSaveObject, LabelAnchor, MainController, SelectionController, SnapCursorController, SnapDragHandler, SnappingInfo, SnapPoint } from "../internal";
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

		//TODO add color property
		this.propertiesHTMLRows.push(new ColorProperty("Fill",null).buildHTML())
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		let relPositions:{anchorname:string,relPos:SVG.Point}[] = []
		let halfSize = new SVG.Point(Math.abs(this.firstPoint.x-this.secondPoint.x)/2,Math.abs(this.firstPoint.y-this.secondPoint.y)/2)
		for (const anchor of Object.values(LabelAnchor)) {
			if (anchor==LabelAnchor.default) {
				continue
			}			
			relPositions.push({relPos:halfSize.mul(anchorDirectionMap.get(anchor)),anchorname:anchor})
		}
		if (!this.snappingPoints||this.snappingPoints.length==0) {
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this,element.anchorname,element.relPos))
			}
		}else{
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos;
				const snappingPoint = this.snappingPoints[index];
				snappingPoint.updateRelPosition(relPos)
				snappingPoint.recalculate(new SVG.Matrix())
			}
		}
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
			trackedSnappingPoints:this.snappingPoints,
			additionalSnappingPoints:[],
		}
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.rectangleDrag.node.classList.add("draggable")
		} else {
			this.rectangleDrag.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag,this.rectangleDrag)
	}

	public resizeable(resizeable:boolean){
		let originalPos:SVG.Point
		let originalSize:SVG.Point
		const getInitialDim = ()=>{
			originalPos = this.position.clone()
			originalSize = this.firstPoint.sub(this.secondPoint)
			originalSize.x = Math.abs(originalSize.x)
			originalSize.y = Math.abs(originalSize.y)
		}
		// AdjustDragHandler.snapDrag(this, this.startCircle, drag, {
		// 	dragStart: (pos)=>{
		// 		getInitialDim()
		// 	},
		// 	dragMove: (pos)=>{
		// 		this.moveStartTo(pos)
		// 	},
		// 	dragEnd:()=>{Undo.addState()}
		// })
		// AdjustDragHandler.snapDrag(this, this.endCircle, drag, {
		// 	dragMove: (pos)=>{
		// 		this.moveEndTo(pos)
		// 	},
		// 	dragEnd:()=>{Undo.addState()}
		// })
	}

	public moveTo(position: SVG.Point): void {
		let delta = position.sub(this.position)
		this.firstPoint = this.firstPoint.add(delta)
		this.secondPoint = this.secondPoint.add(delta)
		this.update()
	}
	public rotate(angleDeg: number): void {
		this.firstPoint = this.firstPoint.rotate(angleDeg,this.position)
		this.secondPoint = this.secondPoint.rotate(angleDeg,this.position)
		this.update()
	}
	public flip(horizontal: boolean): void {
		//doesn't do anything for rectangles
	}
	protected update(): void {
		let halfstroke = this.strokeInfo.width/2
		let upperLeft = new SVG.Point(Math.min(this.firstPoint.x,this.secondPoint.x),Math.min(this.firstPoint.y,this.secondPoint.y))
		let lowerRight = new SVG.Point(Math.max(this.firstPoint.x,this.secondPoint.x),Math.max(this.firstPoint.y,this.secondPoint.y))

		this.rectangleDrag.move(upperLeft.x,upperLeft.y).size(lowerRight.x-upperLeft.x,lowerRight.y-upperLeft.y)

		this.size = lowerRight.sub(upperLeft)

		upperLeft = upperLeft.add(halfstroke)
		lowerRight = lowerRight.sub(halfstroke)

		this.position = lowerRight.add(upperLeft).div(2)
		if (this.size.x<0) {
			this.size.x=0
		}
		if (this.size.y<0) {
			this.size.y=0
		}
		
		this.rectangle.size(this.size.x-this.strokeInfo.width,this.size.y-this.strokeInfo.width)
		this.rectangle.move(upperLeft.x,upperLeft.y)
		this._bbox = new SVG.Box(upperLeft.x-halfstroke,upperLeft.y-halfstroke,this.size.x,this.size.y)
		
		this.relPosition = this.position.sub(upperLeft)
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
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
		this.resizeable(this.isSelected&&SelectionController.instance.currentlySelectedComponents.length<2)
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
		this.selectionRectangle?.remove()
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
			SnapCursorController.instance.visible=false
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