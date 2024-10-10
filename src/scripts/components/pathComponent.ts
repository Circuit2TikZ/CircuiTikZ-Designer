import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitikzComponent, CircuitikzSaveObject, ComponentSymbol, FormEntry, MainController, SnapController, SnapCursorController, SnapPoint } from "../internal"
import { AdjustDragHandler, SnapDragHandler } from "../snapDrag/dragHandlers";
import { lineRectIntersection, pointInsideRect, selectedBoxWidth, pathPointSVG, selectionColor, pathPointRadius } from "../utils/selectionHelper";

export type PathSaveObject = CircuitikzSaveObject & {
	start:{x:number, y:number}
	end:{x:number, y:number}
	mirror?:boolean
	invert?:boolean
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

	constructor(symbol:ComponentSymbol){
		super(symbol)
		SnapCursorController.instance.visible = true

		let startPinIndex = this.referenceSymbol._pins.findIndex((value)=>value.name==="START")
		let endPinIndex = this.referenceSymbol._pins.findIndex((value)=>value.name==="END")
		
		this.relSymbolStart = this.referenceSymbol._pins.at(startPinIndex).point
		this.relSymbolEnd = this.referenceSymbol._pins.at(endPinIndex).point
		
		this.snappingPoints = [
			new SnapPoint(this, null, new SVG.Point(0,0)),
			new SnapPoint(this, null, new SVG.Point(0,0)),
			...this.referenceSymbol._pins
									.filter((_,index)=>!(index==startPinIndex||index==endPinIndex))
									.map((pin) => new SnapPoint(this, pin.name, pin.point)),
		];

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
	}

	public updateTheme(): void {
		if (!this.selectionRectangle) {
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
		this.recalculateSnappingPoints()
	}

	public moveEndTo(position: SVG.Point){
		this.posEnd = position
		this.updateTransform()
		this.recalculateSnappingPoints()
	}

	public rotate(angleDeg: number): void {
		this.posStart = this.posStart.rotate(angleDeg,this.position)
		this.posEnd = this.posEnd.rotate(angleDeg,this.position)
		this.updateTransform()
		this.recalculateSnappingPoints()
	}
	public flip(horizontal: boolean): void {
		this.recalculateSnappingPoints()
		throw new Error("Method not implemented.");
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		this.snappingPoints[0].updateRelPosition(this.posStart.sub(this.position).rotate(-this.rotationDeg))
		this.snappingPoints[1].updateRelPosition(this.posEnd.sub(this.position).rotate(-this.rotationDeg))
		super.recalculateSnappingPoints(matrix)
	}

	public getPlacingSnappingPoints(): SnapPoint[] {
		return this.finishedPlacing?this.snappingPoints:[new SVG.Point() as SnapPoint]
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
			// scaleY: this.#mirror?-1:1,
			// scaleX: this.#invert?-1:1
		});

		let startEnd = this.relSymbolStart.rotate(this.rotationDeg).add(this.position)
		let endStart = this.relSymbolEnd.rotate(this.rotationDeg).add(this.position)

		this.startCircle.move(this.posStart.x-pathPointRadius/2,this.posStart.y-pathPointRadius/2)
		this.endCircle.move(this.posEnd.x-pathPointRadius/2,this.posEnd.y-pathPointRadius/2)

		this.startLine.plot(this.posStart.x, this.posStart.y, startEnd.x, startEnd.y)
		this.endLine.plot(this.posEnd.x, this.posEnd.y, endStart.x, endStart.y)

		this._bbox = this.visualization.bbox() // TODO this should ignore the label, otherwise the component flickers while moving it around when putting it inside the group
		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))

		this.recalculateSelectionVisuals()
		// this.updateLabelPosition()
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
										// scaleY: this.#mirror?-1:1
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
		//TODO add additional options!?
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
			data.label = this.label.getValue()
		}
		// TODO
		// if (this.mirror) {
		// 	data.mirror = this.mirror
		// }
		// if (this.invert) {
		// 	data.invert = this.invert
		// }

		return data
	}
	public toTikzString(): string {
		return (
			"\\draw " +
			this.posStart.toTikzString() +
			" to[" +
			this.referenceSymbol.tikzName +
			(this.name.getValue()===""?"":", name="+this.name.getValue()) +
			(this.label.getValue().value!==""?", l={$"+this.label.getValue().value+"$}":"") +
			// (this.#mirror?", mirror":"") +
			// (this.#invert?", invert":"") +
			"] " +
			this.posEnd.toTikzString() +
			";"
		);
	}
	public getFormEntries(): FormEntry[] {
		throw new Error("Method not implemented.");
	}
	public remove(): void {
		SnapDragHandler.snapDrag(this,false)
		AdjustDragHandler.snapDrag(this,this.startCircle,false)
		AdjustDragHandler.snapDrag(this,this.endCircle,false)
		this.visualization.remove()
		this.viewSelected(false)
		// this.#labelSVG?.remove()
	}

	public draggable(drag: boolean): void {
		this.startCircle.draggable(drag)
		this.endCircle.draggable(drag)
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
			}
		})
		AdjustDragHandler.snapDrag(this, this.endCircle, drag, {
			dragMove: (pos)=>{
				this.moveEndTo(pos)
			}
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
		SnapController.instance.addSnapPoints(this.snappingPoints)
		this.updateTransform()
		this.recalculateSnappingPoints()
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

		// TODO
		// if (saveObject.mirror) {
		// 	pathComponent.mirror = saveObject.mirror
		// }else if(saveObject.invert){
		// 	pathComponent.invert = saveObject.invert
		// }

		if (saveObject.name) {
			pathComponent.name.setValue(saveObject.name)
		}

		if (saveObject.label) {
			pathComponent.label.setValue(saveObject.label)
			// pathComponent.generateLabelRender(saveObject.label.value)
		}else{
			pathComponent.label.setValue({value: ""})
		}
		pathComponent.placeFinish()
		pathComponent.visualization.show()

		return pathComponent;
	}
}