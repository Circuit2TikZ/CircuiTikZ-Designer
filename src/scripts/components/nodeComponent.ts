import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitikzComponent, CircuitikzSaveObject, ComponentSymbol, FormEntry, MainController, SnapController, SnapPoint } from "../internal"
import { SnapDragHandler } from "../snapDrag/dragHandlers";
import { selectedBoxWidth, selectionColor } from "../utils/selectionHelper";

export type NodeSaveObject = CircuitikzSaveObject & {
	position:{x:number, y:number}
	rotation?:number
	flipX?:boolean
	flipY?:boolean
}

export class NodeComponent extends CircuitikzComponent{
	private selectionRectangle: SVG.Rect = null;

	constructor(symbol:ComponentSymbol){
		super(symbol)
		this.position = new SVG.Point()
		this.relPosition = symbol.relMid
		this.symbolUse = CanvasController.instance.canvas.use(symbol)
		this.visualization = this.symbolUse
		this.flipState = new SVG.Point(1,1)
		this.rotationDeg = 0
		this.snappingPoints = symbol._pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point)
		);
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate:-this.rotationDeg,
			origin:[this.position.x,this.position.y],
			scaleX:this.flipState.x,
			scaleY:this.flipState.y
		})
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		super.recalculateSnappingPoints(matrix)
	}

	public getPlacingSnappingPoints(): SnapPoint[] {
		return this.snappingPoints.concat(new SVG.Point() as SnapPoint)
	}

	protected updateTransform(){
		// if flip has different x and y signs and 180 degrees turn, simplify to flip only
		if (this.rotationDeg==180&&this.flipState.x*this.flipState.y<0) {
			this.flipState.x*=-1;
			this.flipState.y*=-1;
			this.rotationDeg=0;
		}

		// transformation matrix incorporating rotation and flipping
		let m = this.getTransformMatrix()
		this.visualization.transform(m)
		
		// default bounding box
		this._bbox = new SVG.Box(
			this.position.x - this.referenceSymbol.relMid.x,
			this.position.y - this.referenceSymbol.relMid.y,
			this.referenceSymbol.viewBox.width,
			this.referenceSymbol.viewBox.height
		);
		// transform to proper location
		this._bbox = this._bbox.transform(m)
		// CanvasController.instance.canvas.rect(this._bbox.w,this._bbox.h).move(this._bbox.x,this._bbox.y).stroke("green").fill("none")
		// this._bbox = this.visualization.bbox()

		// set relMid for external use
		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))

		this.recalculateSelectionVisuals()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionRectangle) {
			let box = this.bbox;
			this.selectionRectangle.move(box.x,box.y);
			this.selectionRectangle.attr("width",box.w);
			this.selectionRectangle.attr("height",box.h);
		}
	}

	public moveTo(position: SVG.Point) {
		this.position = position.clone()
		this.updateTransform()
		this.visualization.move(this.position.x - this.referenceSymbol.relMid.x, this.position.y - this.referenceSymbol.relMid.y);
	}
	
	public rotate(angleDeg: number): void {
		this.rotationDeg += angleDeg;
		this.simplifyRotationAngle()
		
		this.updateTransform()
		this.recalculateSnappingPoints()
	}
	public flip(horizontal: boolean): void {
		if (this.rotationDeg%180==0) {
			if (horizontal) {
				this.flipState.y*=-1;
			}else{
				this.flipState.x*=-1;
			}
		}else{
			if (horizontal) {
				this.flipState.x*=-1;
			}else{
				this.flipState.y*=-1;
			}
		}

		// double flipping equals rotation by 180 deg
		if (this.flipState.x<0&&this.flipState.y<0) {
			this.flipState.x=1
			this.flipState.y=1
			this.rotationDeg+=180;
			this.simplifyRotationAngle()
		}		
		
		this.updateTransform()

		this.recalculateSnappingPoints()
	}

	public viewSelected(show: boolean): void {
		if (show) {
			if (!this.selectionRectangle) {
				let box = this.bbox;
				this.selectionRectangle = CanvasController.instance.canvas.rect(box.w,box.h).move(box.x,box.y)
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
	public toJson(): NodeSaveObject {
		let data:NodeSaveObject = {
			type:"node",
			id:this.referenceSymbol.node.id,
			position:{x:this.position.x,y:this.position.y},
		}
		if (this.rotationDeg!==0) {
			data.rotation=this.rotationDeg
		}
		if (this.flipState.x<0) {
			data.flipX = true
		}
		if (this.flipState.y<0) {
			data.flipY = true
		}
		if (this.name) {
			data.name = this.name
		}
		if (this.label) {
			data.label = this.label
		}

		return data
	}
	public toTikzString(): string {
		const optionsString = this.referenceSymbol.serializeTikzOptions();
		let labelString = this.label.value?`$${this.label.value}$`:""
		let rotateString = this.rotationDeg!==0?`\\rotatebox{${-this.rotationDeg}}{${labelString}}`:labelString
		let flipString = this.flipState.x<0?(this.flipState.y<0?`\\ctikzflipxy{${rotateString}}`:`\\ctikzflipx{${rotateString}}`):(this.flipState.y<0?`\\ctikzflipy{${rotateString}}`:rotateString)
		
		//don't change the order of scale and rotate!!! otherwise tikz render and UI are not the same
		return (
			"\\node[" +
			this.referenceSymbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(this.rotationDeg !== 0 ? `, rotate=${this.rotationDeg}` : "") +
			(this.flipState.x < 0 ? `, xscale=-1` : "") +
			(this.flipState.y < 0 ? `, yscale=-1` : "") +
			"] " +
			(this.name ? "(" + this.name + ") " : "") +
			"at " +
			this.position.toTikzString() +
			" {"+
			(this.label.value?flipString:"")+
			"};"
		);
	}
	public getFormEntries(): FormEntry[] {
		throw new Error("Method not implemented.");
	}
	public remove(): void {
		SnapDragHandler.snapDrag(this,false)
		this.visualization.remove()
		this.viewSelected(false)
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.visualization.node.classList.add("draggable")
		}else{
			this.visualization.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag)
	}

	public placeMove(pos: SVG.Point): void {
		this.moveTo(pos)
	}
	public placeStep(pos: SVG.Point): boolean {
		this.moveTo(pos)
		return true
	}
	public placeFinish(): void {
		// make draggable
		this.draggable(true)
		// add snap points to snap controller
		SnapController.instance.addSnapPoints(this.snappingPoints)
		this.updateTransform()
		this.recalculateSnappingPoints()
	}

	public static fromJson(saveObject:NodeSaveObject): NodeComponent{
		let symbol = MainController.instance.symbols.find((value,index,symbols)=>value.node.id==saveObject.id)
		let nodeComponent: NodeComponent = new NodeComponent(symbol)// symbol.addInstanceToContainer(CanvasController.instance.canvas,null,()=>{})
		nodeComponent.moveTo(new SVG.Point(saveObject.position))
		nodeComponent.placeFinish()

		if (saveObject.rotation) {
			nodeComponent.rotationDeg = saveObject.rotation
		}

		if (saveObject.flipX) {
			nodeComponent.flipState.x = -1
		}else if(saveObject.flipY){
			nodeComponent.flipState.y = -1
		}

		if (saveObject.name) {
			nodeComponent.name = saveObject.name
		}

		if (saveObject.label) {
			nodeComponent.label = saveObject.label
			// nodeComponent.generateLabelRender(saveObject.label.value)
		}else{
			nodeComponent.label = {value: ""}
		}
		nodeComponent.updateTransform()
		nodeComponent.recalculateSnappingPoints()

		return nodeComponent;
	}

	public copyForPlacement(): NodeComponent {
		return new NodeComponent(this.referenceSymbol)
	}

	// public updateLabelPosition(): void {
	// 	throw new Error("Method not implemented.");
	// }
}