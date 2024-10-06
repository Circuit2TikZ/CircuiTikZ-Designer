import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitikzComponent, ComponentSaveObject, ComponentSymbol, FormEntry, NodeSaveObject, SnapController, SnapPoint } from "../internal"
import { DragCallbacks, SnapDragHandler } from "../snapDrag/dragHandlers";

export class NodeComponent extends CircuitikzComponent{

	private flipVector: SVG.Point
	private angleDeg: number

	constructor(symbol:ComponentSymbol){
		super(symbol)
		this.position = new SVG.Point()
		this.relPosition = symbol.relMid
		this.visualization = CanvasController.instance.canvas.use(symbol)
		this.flipVector = new SVG.Point(1,1)
		this.angleDeg = 0
		this.snappingPoints = symbol._pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point)
		);
		
		CanvasController.instance.canvas.add(this.visualization)
	}

	public getTransformMatrix(): SVG.Matrix {
		let origin = this.position.minus(this.relPosition)
		return new SVG.Matrix({
			rotate:-this.angleDeg,
			origin:[origin.x,origin.y],
			scaleX:this.flipVector.x,
			scaleY:this.flipVector.y
		})
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		super.recalculateSnappingPoints(new SVG.Matrix({
			rotate:-this.angleDeg,
			translate:[this.position.x,this.position.y],
			scaleX:this.flipVector.x,
			scaleY:this.flipVector.y
		}))
	}

	private updateTransform(){
		// if flip has different x and y signs and 180 degrees turn, simplify to flip only
		if (this.angleDeg==180&&this.flipVector.x*this.flipVector.y<0) {
			this.flipVector.x*=-1;
			this.flipVector.y*=-1;
			this.angleDeg=0;
		}

		// transformation matrix incorporating rotation and flipping
		let m = this.getTransformMatrix()
		this.visualization.transform(m)
		
		// default bounding box
		this._bbox = new SVG.Box(
			this.position.x - this.relPosition.x,
			this.position.y - this.relPosition.y,
			this.referenceSymbol.viewBox.width,
			this.referenceSymbol.viewBox.height
		);
		// transform to proper location
		this._bbox = this._bbox.transform(m)

		// set relMid for external use
		// this.relMid = this.#midAbs.minus(new SVG.Point(this.boundingBox.x,this.boundingBox.y))

		// this.#recalculateSelectionRect();
	}

	#simplifyAngleDeg(){
		while (this.angleDeg > 180) this.angleDeg -= 360;
		while (this.angleDeg <= -180) this.angleDeg += 360;
	}
	
	public moveTo(position: SVG.Point): void {
		this.position = position
		let pos = position.minus(this.relPosition)
		this.visualization.move(pos.x,pos.y)
	}
	public rotate(angleDeg: number): void {
		throw new Error("Method not implemented.");
	}
	public flip(horizontal: boolean): void {
		throw new Error("Method not implemented.");
	}
	public showSelected(show: boolean): void {
		throw new Error("Method not implemented.");
	}
	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		throw new Error("Method not implemented.");
	}
	public updateTheme(): void {
		throw new Error("Method not implemented.");
	}
	public toJson(): ComponentSaveObject {
		throw new Error("Method not implemented.");
	}
	public toTikzString(): string {
		throw new Error("Method not implemented.");
	}
	public getFormEntries(): FormEntry[] {
		throw new Error("Method not implemented.");
	}
	public remove(): void {
		this.visualization.remove()
		
		if (this.snappingPoints) {
			SnapController.instance.removeSnapPoints(this.snappingPoints)
		}
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
		this.visualization.node.classList.add("draggable")
		SnapDragHandler.snapDrag(this,true)
		// add snap points to snap controller
		SnapController.instance.addSnapPoints(this.snappingPoints)
		this.recalculateSnappingPoints()
	}

	public static fromJson(saveObject:NodeSaveObject): NodeComponent{
		throw new Error("Method not implemented.");
	}

	public copyForPlacement(): NodeComponent {
		return new NodeComponent(this.referenceSymbol)
	}
}