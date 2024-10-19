import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitikzComponent, CircuitikzSaveObject, ComponentSymbol, MainController, SnapController, SnapCursorController, SnapPoint, AdjustDragHandler, SnapDragHandler, PathOrientationProperty, PathLabelProperty, Label, Undo, SnappingInfo } from "../internal"
import { lineRectIntersection, pointInsideRect, selectedBoxWidth, pathPointSVG, selectionColor, pathPointRadius } from "../utils/selectionHelper";


export type PathLabel = Label & {
	otherSide?:boolean
}

export type PathSaveObject = CircuitikzSaveObject & {
	start:{x:number, y:number}
	end:{x:number, y:number}
	label?:PathLabel
	mirror?:boolean
	invert?:boolean
}

export type PathOrientation = {
	mirror:boolean,
	invert:boolean
}

export class PathComponent extends CircuitikzComponent{
	private posStart: SVG.Point
	private posEnd: SVG.Point
	
	private startLine: SVG.Line
	private endLine: SVG.Line
	private relSymbolStart: SVG.Point
	private relSymbolEnd: SVG.Point

	private pointsPlaced:0|1|2=0

	private selectionRectangle: SVG.Rect = null;

	private startCircle:SVG.Circle;
	private endCircle:SVG.Circle;

	private pathOrientation:PathOrientationProperty
	public label:PathLabelProperty

	constructor(symbol:ComponentSymbol){
		super(symbol)
		SnapCursorController.instance.visible = true

		let startPinIndex = this.referenceSymbol._pins.findIndex((value)=>value.name==="START")
		let endPinIndex = this.referenceSymbol._pins.findIndex((value)=>value.name==="END")
		
		this.relSymbolStart = this.referenceSymbol._pins.at(startPinIndex).point
		this.relSymbolEnd = this.referenceSymbol._pins.at(endPinIndex).point

		this.visualization = CanvasController.instance.canvas.group()

		let lineAttr = {
			fill: "none",
			stroke: MainController.instance.darkMode?"#fff":"#000",
			"stroke-width": "0.4pt",
		}
		this.startLine = CanvasController.instance.canvas.line()
		this.startLine.attr(lineAttr);
		this.endLine = CanvasController.instance.canvas.line()
		this.endLine.attr(lineAttr);

		this.symbolUse = CanvasController.instance.canvas.use(this.referenceSymbol)
		this.visualization.add(this.symbolUse)
		this.visualization.add(this.startLine)
		this.visualization.add(this.endLine)
		this.visualization.hide()
		
		this.startCircle = pathPointSVG()
		this.visualization.add(this.startCircle)
		
		this.endCircle = pathPointSVG()
		this.visualization.add(this.endCircle)

		this.label = new PathLabelProperty(this,{value:""})
		this.label.label = "Label"
		this.label.addChangeListener((ev)=>{
			if (ev.value.value) {
				if (!ev.previousValue||ev.previousValue.value!=ev.value.value) {
					//rerender
					this.generateLabelRender(this.label.getValue()).then(()=>Undo.addState())
				}else{
					this.updateLabelPosition()
				}
			}else{
				ev.value.rendering?.remove()
			}
		})
		this.editableProperties.push(this.label)

		this.pathOrientation = new PathOrientationProperty(this,{mirror:false,invert:false})
		this.pathOrientation.label = "Orientation"
		this.pathOrientation.addChangeListener(ev=>{
			if (!ev.previousValue||ev.previousValue.mirror!=ev.value.mirror||ev.previousValue.invert!=ev.value.invert) {
				this.updateTransform()
				Undo.addState()
			}
		})
		this.editableProperties.push(this.pathOrientation)

		this.snappingPoints = [
			new SnapPoint(this, null, new SVG.Point(0,0)),
			new SnapPoint(this, null, new SVG.Point(0,0)),
			...this.referenceSymbol._pins
									.filter((_,index)=>!(index==startPinIndex||index==endPinIndex))
									.map((pin) => new SnapPoint(this, pin.name, pin.point)),
		];
	}

	public updateTheme(): void {
		if (!this.isSelected) {
			this.startLine.stroke(MainController.instance.darkMode?"#fff":"#000")
			this.endLine.stroke(MainController.instance.darkMode?"#fff":"#000")
		}
	}

	public moveTo(position: SVG.Point): void {
		let diff = position.sub(this.position)
		this.posStart = diff.add(this.posStart)
		this.posEnd = diff.add(this.posEnd)
		this.updateTransform()
	}

	public moveStartTo(position: SVG.Point){
		this.posStart = position
		this.updateTransform()
	}

	public moveEndTo(position: SVG.Point){
		this.posEnd = position
		this.updateTransform()
	}

	public rotate(angleDeg: number): void {
		this.posStart = this.posStart.rotate(angleDeg,this.position)
		this.posEnd = this.posEnd.rotate(angleDeg,this.position)
		this.updateTransform()
	}
	public flip(horizontal: boolean): void {
		let newPos1 = new SVG.Point(this.posStart.x,this.posEnd.y)
		let newPos2 = new SVG.Point(this.posEnd.x,this.posStart.y)
		if (horizontal) {
			this.posStart = newPos1
			this.posEnd = newPos2
		} else {
			this.posStart = newPos2
			this.posEnd = newPos1
		}
		let currentOrientation:PathOrientation = {
			mirror:!this.pathOrientation.getValue().mirror,
			invert:this.pathOrientation.getValue().invert
		}
		this.pathOrientation.setValue(currentOrientation,true)
		
		this.updateTransform()
	}

	public getSnapPointTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate:-this.rotationDeg,
			scaleX:this.pathOrientation.getValue().mirror?-1:1,
			scaleY:this.pathOrientation.getValue().invert?-1:1
		})
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		this.snappingPoints[0].updateRelPosition(this.posStart.sub(this.position).rotate(-this.rotationDeg))
		this.snappingPoints[1].updateRelPosition(this.posEnd.sub(this.position).rotate(-this.rotationDeg))
		super.recalculateSnappingPoints(matrix??this.getSnapPointTransformMatrix())
	}

	public getPlacingSnappingPoints(): SnappingInfo {
		if (this.finishedPlacing) {
			return {
				trackedSnappingPoints:this.snappingPoints,additionalSnappingPoints:[]
			}
		} else {
			return {
				trackedSnappingPoints:[],additionalSnappingPoints:this.pointsPlaced>0?[new SnapPoint(this,"",new SVG.Point())]:[]
			}
		}
	}

	protected updateTransform(): void {
		this.position = this.posStart.add(this.posEnd).div(2)
		const tl = this.position.sub(this.referenceSymbol.relMid);

		const angle = Math.atan2(this.posStart.y - this.posEnd.y, this.posEnd.x - this.posStart.x);
		this.rotationDeg = (angle * 180) / Math.PI;

		this.symbolUse.move(tl.x, tl.y);
		this.symbolUse.transform({
			rotate: -this.rotationDeg, 
			ox: this.position.x, 
			oy: this.position.y,
			scaleY: this.pathOrientation.getValue().mirror?-1:1,
			scaleX: this.pathOrientation.getValue().invert?-1:1
		});

		let startEnd = this.relSymbolStart.rotate(this.rotationDeg).add(this.position)
		let endStart = this.relSymbolEnd.rotate(this.rotationDeg).add(this.position)

		this.startCircle.move(this.posStart.x-pathPointRadius,this.posStart.y-pathPointRadius)
		this.endCircle.move(this.posEnd.x-pathPointRadius,this.posEnd.y-pathPointRadius)

		this.startLine.plot(this.posStart.x, this.posStart.y, startEnd.x, startEnd.y)
		this.endLine.plot(this.posEnd.x, this.posEnd.y, endStart.x, endStart.y)
		
		this.updateLabelPosition()
		this._bbox = this.visualization.bbox()
		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}
	protected recalculateSelectionVisuals(): void {
		if (this.selectionRectangle) {
			// use the saved position instead of the bounding box (bbox position fails in safari)
			let moveVec = this.position.sub(this.referenceSymbol.relMid)

			this.selectionRectangle.move(moveVec.x,moveVec.y)
									.transform({
										rotate: -this.rotationDeg, 
										ox: this.position.x, 
										oy: this.position.y, 
										scaleY: this.pathOrientation.getValue().mirror?-1:1,
										scaleX: this.pathOrientation.getValue().invert?-1:1
									});
		}
	}
	public viewSelected(show: boolean): void {
		if (show) {
			if (!this.selectionRectangle) {
				let box = this.symbolUse.bbox();
				this.selectionRectangle = CanvasController.instance.canvas.rect(box.w,box.h)
				this.recalculateSelectionVisuals()

				this.selectionRectangle.attr({
					"stroke-width": selectedBoxWidth,
					"stroke": selectionColor,
					"stroke-dasharray":"3,3",
					"fill": "none"
				});
			}
			// also paint the lines leading to the symbol
			this.startLine.attr({
				"stroke":selectionColor,
			});
			this.endLine.attr({
				"stroke":selectionColor,
			});
		} else {
			this.selectionRectangle?.remove();
			this.selectionRectangle = null
			this.startLine.attr({
				"stroke":MainController.instance.darkMode?"#fff":"#000",
			});
			this.endLine.attr({
				"stroke":MainController.instance.darkMode?"#fff":"#000",
			});
		}
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		if (this.pointsPlaced<2) {
			return false;
		}
		// if 1 of the 2 lines hanging of the symbol intersect the selection rect -> should select
		if (lineRectIntersection(this.startLine,selectionRectangle)
			||(lineRectIntersection(this.endLine,selectionRectangle))) {
			return true;
		}

		// get bounding box of the center symbol in the rotated frame but without rotation
		let bbox = this.symbolUse.bbox();
		// get the corner points of the bounding box and rotate each of them to their proper positions
		let transform = new SVG.Matrix({ rotate: -this.rotationDeg, ox: this.position.x, oy: this.position.y });
		let boxPoints = [
			new SVG.Point(bbox.x,bbox.y).transform(transform),
			new SVG.Point(bbox.x2,bbox.y).transform(transform),
			new SVG.Point(bbox.x2,bbox.y2).transform(transform),
			new SVG.Point(bbox.x,bbox.y2).transform(transform)
		];
		
		// if all of these points are inside the selection rect -> should select
		if (boxPoints.map((value)=>pointInsideRect(value,selectionRectangle)).every((value)=>value)) {
			return true;
		}

		//TODO technically, the function will return false if the complete selection rectangle is inside the component bounding box. Should the component be selected in this case? And if yes, is it even important to look at this edge case?

		// if at least one line defined by 2 of the 4 corner points intersects the selection rect -> should select
		for (let index = 0; index < boxPoints.length; index++) {
			const p1 = boxPoints[index];
			const p2 = boxPoints[(index+1)%boxPoints.length];
			if (lineRectIntersection([[p1.x,p1.y],[p2.x,p2.y]],selectionRectangle)) {
				return true;
			}
		}

		// no intersection between the selection rect and the component
		return false;
	}

	public toJson(): PathSaveObject {
		let data:PathSaveObject = {
			type:"path",
			id:this.referenceSymbol.node.id,
			start:{x:this.posStart.x,y:this.posStart.y},
			end:{x:this.posEnd.x,y:this.posEnd.y},
		}

		if (this.name.getValue()) {
			data.name = this.name.getValue()
		}
		if (this.label.getValue()) {
			data.label = {
				value:this.label.getValue().value,
				otherSide:this.label.getValue().otherSide
			}
		}

		if (this.pathOrientation.getValue().mirror) {
			data.mirror = this.pathOrientation.getValue().mirror
		}
		if (this.pathOrientation.getValue().invert) {
			data.invert = this.pathOrientation.getValue().invert
		}

		return data
	}
	public toTikzString(): string {
		let distStr = this.label.getValue().distance.convertToUnit("cm").minus(0.1).value.toPrecision(2)+"cm"
		let shouldDist = this.label.getValue().distance&&distStr!="0.0cm"
		return (
			"\\draw " +
			this.posStart.toTikzString() +
			" to[" +
			this.referenceSymbol.tikzName +
			(this.name.getValue()===""?"":", name="+this.name.getValue()) +
			(this.label.getValue().value!==""?", l"+(this.label.getValue().otherSide?"_":"")+"={$"+this.label.getValue().value+"$}"
			+(shouldDist?", label distance="+distStr:""):"") +
			(this.pathOrientation.getValue().mirror?", mirror":"") +
			(this.pathOrientation.getValue().invert?", invert":"") +
			"] " +
			this.posEnd.toTikzString() +
			";"
		);
	}
	public remove(): void {
		SnapDragHandler.snapDrag(this,false)
		AdjustDragHandler.snapDrag(this,this.startCircle,false)
		AdjustDragHandler.snapDrag(this,this.endCircle,false)
		this.visualization.remove()
		this.viewSelected(false)
		this.label.getValue()?.rendering?.remove()
	}

	public draggable(drag: boolean): void {
		// this.startCircle.draggable(drag)
		// this.endCircle.draggable(drag)
		if (drag) {
			this.symbolUse.node.classList.add("draggable");
			this.startCircle.node.classList.add("draggable")
			this.startCircle.node.classList.remove("d-none")
			this.endCircle.node.classList.add("draggable")
			this.endCircle.node.classList.remove("d-none")
		}else{
			this.symbolUse.node.classList.remove("draggable");
			this.startCircle.node.classList.remove("draggable")
			this.startCircle.node.classList.add("d-none")
			this.endCircle.node.classList.remove("draggable")
			this.endCircle.node.classList.add("d-none")
		}
		SnapDragHandler.snapDrag(this, drag)
		AdjustDragHandler.snapDrag(this, this.startCircle, drag, {
			dragMove: (pos)=>{
				this.moveStartTo(pos)
			},
			dragEnd:()=>{Undo.addState()}
		})
		AdjustDragHandler.snapDrag(this, this.endCircle, drag, {
			dragMove: (pos)=>{
				this.moveEndTo(pos)
			},
			dragEnd:()=>{Undo.addState()}
		})
	}

	public placeMove(pos: SVG.Point): void {
		SnapCursorController.instance.moveTo(pos);
		if (this.pointsPlaced==1){
			this.moveEndTo(pos)
		}
	}
	public placeStep(pos: SVG.Point): boolean {
		if (this.pointsPlaced==0) {
			this.visualization.show()
			this.posStart = pos
		}
		this.pointsPlaced+=1
		this.placeMove(pos)
		return this.pointsPlaced>1
	}
	public placeFinish(): void {
		while (!this.finishedPlacing) {
			this.finishedPlacing = this.placeStep(CanvasController.instance.lastCanvasPoint)
		}
		this.finishedPlacing=true
		SnapCursorController.instance.visible = false
		SnapController.instance.hideSnapPoints();
		this.updateTransform()
		this.draggable(true)
	}

	public copyForPlacement(): PathComponent {
		return new PathComponent(this.referenceSymbol)
	}

	public static fromJson(saveObject: PathSaveObject): PathComponent {
		let symbol = MainController.instance.symbols.find((value,index,symbols)=>value.node.id==saveObject.id)
		let pathComponent: PathComponent = new PathComponent(symbol)
		pathComponent.posStart = new SVG.Point(saveObject.start)
		pathComponent.posEnd = new SVG.Point(saveObject.end)
		pathComponent.pointsPlaced=2

		pathComponent.pathOrientation.setValue({
			mirror:saveObject.mirror??false,
			invert:saveObject.invert??false
		},false)

		if (saveObject.name) {
			pathComponent.name.setValue(saveObject.name)
		}

		if (saveObject.label) {
			pathComponent.label.setValue(saveObject.label)
			pathComponent.generateLabelRender(pathComponent.label.getValue())
		}else{
			pathComponent.label.setValue({value: ""})
		}
		pathComponent.placeFinish()
		pathComponent.visualization.show()

		return pathComponent;
	}

	public updateLabelPosition(): void {
		if (!this.label) {
			return
		}
		let label = this.label.getValue()
		if (!label||label.value===""||!label.rendering) {
			return
		}
		let labelSVG = label.rendering
		// breaking points where the label is parallel to the path or to the x axis. in degrees
		const breakVertical = 70
		const breakHorizontal = 21

		let pathDiff = this.posEnd.sub(this.posStart)

		// the bounding boxes for the label and the symbol
		let labelBBox = labelSVG.bbox()
		let symbolBBox = this.symbolUse.bbox()

		// the nominal reference point of the label (bottom center)
		let labelRef = new SVG.Point(labelBBox.w/2,labelBBox.h)
		// the rotation angle of the label (not always identical to the path rotation angle)
		let rotAngle = this.rotationDeg
		if (rotAngle>90) {
			// upper left quadrant -> don't show label upside down -> rotate the label by additional 180 deg
			rotAngle-=180
			// the label reference point should now be the top center
			labelRef.y = 0
		}else if(rotAngle<-90){
			// lower left quadrant -> don't show label upside down -> rotate the label by additional 180 deg
			rotAngle+=180
			// the label reference point should now be the top center
			labelRef.y = 0
		}
		
		// mirroring the symbol should not impact the label except from shifting its position to stay close to the symbol (only relevant for asymetric symbols)
		let referenceoffsetY = this.pathOrientation.getValue().mirror?this.referenceSymbol.relMid.y-symbolBBox.h:-this.referenceSymbol.relMid.y
		
		// nominally the reference point of the symbol is its center (w.r.t. the x coordinate for a path which is horizontal)
		let referenceOffsetX = 0

		let otherSide = this.label.getValue().otherSide
		let other = otherSide?-1:1
		if (otherSide) {
			labelRef.y = labelBBox.h-labelRef.y
			referenceoffsetY+=symbolBBox.h
		}

		// if the path is close to horizontal or vertical according to the break points
		let nearHorizontal = Math.abs(this.rotationDeg)<breakHorizontal||Math.abs(this.rotationDeg)>(180-breakHorizontal);
		let nearVertical = Math.abs(this.rotationDeg)>(breakVertical)&&Math.abs(this.rotationDeg)<(180-breakVertical);

		if (nearHorizontal) {
			// the label should not be rotated w.r.t. the x axis
			rotAngle=0
			//the offset where the rotation pivot point should lie (for both label and symbol)
			let horizontalOffset = Math.min(labelBBox.w,symbolBBox.w)*Math.sign(this.rotationDeg)/2
			referenceOffsetX = horizontalOffset*Math.sign(pathDiff.x)*other
			labelRef.x+=horizontalOffset*other
		}else if(nearVertical){
			// the label should not be rotated w.r.t. the x axis
			rotAngle=0
			let right = this.rotationDeg>0?Math.sign(90-this.rotationDeg):Math.sign(this.rotationDeg+90)
			let up = Math.sign(this.rotationDeg)
			//the offset where the rotation pivot point should lie (for both label and symbol)
			let verticalOffset = Math.min(labelBBox.h,symbolBBox.w)/2
			
			referenceOffsetX = -verticalOffset*right*up*other

			labelRef = new SVG.Point(labelBBox.w/2*(1+up*other),labelBBox.h/2+verticalOffset*other*right)
		}

		referenceoffsetY -=other*(label.distance?label.distance.convertToUnit("px").value:0)

		// where the anchor point of the symbol is located relative to the midAbs point
		let referenceOffset = new SVG.Point(referenceOffsetX,referenceoffsetY).transform(new SVG.Matrix({
			rotate:-this.rotationDeg
		}))
		
		// acutally move and rotate the label to the correct position
		let compRef = this.position.add(referenceOffset)
		let movePos = compRef.sub(labelRef)
		labelSVG.transform({
			rotate:-rotAngle,
			ox:labelRef.x,
			oy:labelRef.y,
			translate:[movePos.x,movePos.y]
		})
		
	}
}