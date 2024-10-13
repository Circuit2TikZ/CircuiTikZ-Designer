import * as SVG from "@svgdotjs/svg.js";
import { CanvasController, CircuitikzComponent, CircuitikzSaveObject, ComponentSymbol, ExportController, FlipStateProperty, Label, MainController, NodeLabelProperty, SnapController, SnapDragHandler, SnapPoint, Undo } from "../internal"
import { selectedBoxWidth, selectionColor } from "../utils/selectionHelper";

export enum LabelAnchor {
	default="default",
	center="center",
	north="north",
	south="south",
	east="east",
	west="west",
	northeast="north east",
	northwest="north west",
	southeast="south east",
	southwest="south west"
}

export type NodeLabel = Label & {
	anchor?:LabelAnchor
}

export type NodeSaveObject = CircuitikzSaveObject & {
	position:{x:number, y:number}
	label?:NodeLabel
	rotation?:number
	flipX?:boolean
	flipY?:boolean
}

export class NodeComponent extends CircuitikzComponent{
	private selectionRectangle: SVG.Rect = null;
	public flipState:FlipStateProperty
	public label: NodeLabelProperty;

	constructor(symbol:ComponentSymbol){
		super(symbol)
		this.position = new SVG.Point()
		this.relPosition = symbol.relMid
		this.symbolUse = CanvasController.instance.canvas.use(symbol)
		this.visualization = CanvasController.instance.canvas.group()
		this.visualization.add(this.symbolUse)
		this.rotationDeg = 0

		this.label = new NodeLabelProperty(this,{value:""})
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
		
		this.flipState = new FlipStateProperty(this,new SVG.Point(1,1))
		this.flipState.label = "Flip state"
		this.flipState.addChangeListener(ev=>{
			if (!ev.previousValue||ev.previousValue.x!=ev.value.x||ev.previousValue.y!=ev.value.y) {
				this.updateTransform()
				this.recalculateSnappingPoints()
				Undo.addState()
			}
		})
		this.editableProperties.push(this.flipState)
		
		this.snappingPoints = symbol._pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point)
		);
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate:-this.rotationDeg,
			origin:[this.position.x,this.position.y],
			scaleX:this.flipState.getValue().x,
			scaleY:this.flipState.getValue().y
		})
	}

	public getSnapPointTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate:-this.rotationDeg,
			scaleX:this.flipState.getValue().x,
			scaleY:this.flipState.getValue().y
		})
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		super.recalculateSnappingPoints(matrix??this.getSnapPointTransformMatrix())
	}

	public getPlacingSnappingPoints(): SnapPoint[] {
		return this.snappingPoints.concat(new SnapPoint(this,"center",new SVG.Point()))
	}

	protected updateTransform(){
		// if flip has different x and y signs and 180 degrees turn, simplify to flip only
		if (this.rotationDeg==180) {
			if (this.flipState.getValue().x*this.flipState.getValue().y<0) {
				let currentFlipState = this.flipState.getValue().clone()
				this.flipState.setValue(currentFlipState.mul(-1),true)
				this.rotationDeg=0;
			}else if(this.flipState.getValue().x<0&&this.flipState.getValue().y<0){
				this.flipState.setValue(new SVG.Point(1,1),true)
				this.rotationDeg=0;
			}
		}
		const tl = this.position.sub(this.referenceSymbol.relMid);
		this.symbolUse.move(tl.x, tl.y);
		this.symbolUse.transform(new SVG.Matrix({
			rotate:-this.rotationDeg,
			origin:[this.position.x,this.position.y],
			scaleX:this.flipState.getValue().x,
			scaleY:this.flipState.getValue().y
		}))

		this.updateLabelPosition()
		this._bbox = this.symbolUse.bbox().transform(this.getTransformMatrix())

		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))

		this.recalculateSelectionVisuals()
	}

	protected recalculateSelectionVisuals(): void {
		if (this.selectionRectangle) {
			let box = this.symbolUse.bbox().transform(this.getTransformMatrix());
			this.selectionRectangle.move(box.x,box.y);
			this.selectionRectangle.attr("width",box.w);
			this.selectionRectangle.attr("height",box.h);
		}
	}

	public moveTo(position: SVG.Point) {
		this.position = position.clone()
		this.updateTransform()
		this.symbolUse.move(this.position.x - this.referenceSymbol.relMid.x, this.position.y - this.referenceSymbol.relMid.y);
	}
	
	public rotate(angleDeg: number): void {
		this.rotationDeg += angleDeg;
		this.simplifyRotationAngle()
		
		this.updateTransform()
		this.recalculateSnappingPoints()
	}
	public flip(horizontal: boolean): void {
		let currentFlipState = this.flipState.getValue().clone()
		if (this.rotationDeg%180==0) {
			if (horizontal) {
				currentFlipState.y*=-1;
			}else{
				currentFlipState.x*=-1;
			}
		}else{
			if (horizontal) {
				currentFlipState.x*=-1;
			}else{
				currentFlipState.y*=-1;
			}
		}
		
		// double flipping equals rotation by 180 deg
		if (currentFlipState.x<0&&currentFlipState.y<0) {
			currentFlipState.x=1
			currentFlipState.y=1
			this.rotationDeg+=180;
			this.simplifyRotationAngle()
		}		
		this.flipState.setValue(currentFlipState,true)
		
		this.updateTransform()

		this.recalculateSnappingPoints()
	}

	public viewSelected(show: boolean): void {
		if (show) {
			if (!this.selectionRectangle) {
				let box = this.symbolUse.bbox().transform(this.getTransformMatrix());
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
		if (this.flipState.getValue().x<0) {
			data.flipX = true
		}
		if (this.flipState.getValue().y<0) {
			data.flipY = true
		}
		if (this.name.getValue()) {
			data.name = this.name.getValue()
		}
		if (this.label.getValue()&&this.label.getValue().value) {
			let labelWithoutRender:NodeLabel = {
				value:this.label.getValue().value,
				anchor:this.label.getValue().anchor??undefined,
				distance:this.label.getValue().distance.convertToUnit("px")??undefined
			}
			data.label = labelWithoutRender
		}

		return data
	}

	private getLabelTikzOptionsString():string{
		let labelDist = this.label.getValue().distance.convertToUnit("cm").minus(0.1).value
		let label = this.label.getValue().value&&labelDist!=0?true:false
		if (this.labelPos.x==0) {
			if (this.labelPos.y==0) {
				return "anchor=center"
			} else if(this.labelPos.y==-1) {
				return "anchor=north"+(label?", yshift="+(-labelDist).toPrecision(2)+"cm":"")
			} else {
				return "anchor=south"+(label?", yshift="+(labelDist).toPrecision(2)+"cm":"")
			}
		} else if(this.labelPos.x==-1) {
			if (this.labelPos.y==0) {
				return "anchor=west"+(label?", xshift="+(labelDist).toPrecision(2)+"cm":"")
			} else if(this.labelPos.y==-1) {
				return "anchor=north west"+(label?", xshift="+(labelDist).toPrecision(2)+"cm"+", yshift="+(-labelDist).toPrecision(2)+"cm":"")
			} else {
				return "anchor=south west"+(label?", xshift="+(labelDist).toPrecision(2)+"cm"+", yshift="+(labelDist).toPrecision(2)+"cm":"")
			}
		} else {
			if (this.labelPos.y==0) {
				return "anchor=east"+(label?", xshift="+(-labelDist).toPrecision(2)+"cm":"")
			} else if(this.labelPos.y==-1) {
				return "anchor=north east"+(label?", xshift="+(-labelDist).toPrecision(2)+"cm"+", yshift="+(-labelDist).toPrecision(2)+"cm":"")
			} else {
				return "anchor=south east"+(label?", xshift="+(-labelDist).toPrecision(2)+"cm"+", yshift="+(labelDist).toPrecision(2)+"cm":"")
			}
		}
	}

	public toTikzString(): string {
		const optionsString = this.referenceSymbol.serializeTikzOptions();

		let label = this.label.getValue()
		let id = this.name.getValue()
		if (!id&&label.value) {
			id = "N"+ExportController.instance.exportID
		}

		let labelNodeStr:string
		if (label.value) {
			labelNodeStr = " node["+this.getLabelTikzOptionsString()+"] at ("+id+".text){$"+label.value+"$}"
		}
		
		//don't change the order of scale and rotate!!! otherwise tikz render and UI are not the same
		return (
			"\\draw node[" +
			this.referenceSymbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(this.rotationDeg !== 0 ? `, rotate=${this.rotationDeg}` : "") +
			(this.flipState.getValue().x < 0 ? `, xscale=-1` : "") +
			(this.flipState.getValue().y < 0 ? `, yscale=-1` : "") +
			"] " +
			(id ? "(" + id + ") " : "") +
			"at " +
			this.position.toTikzString() +
			" {}"+
			(label.value?labelNodeStr:"")
			+";"
		);
	}
	public remove(): void {
		SnapDragHandler.snapDrag(this,false)
		this.visualization.remove()
		this.viewSelected(false)
		this.label.getValue()?.rendering?.remove()
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.visualization.node.classList.add("draggable")
		}else{
			this.visualization.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag,this.symbolUse)
	}

	public placeMove(pos: SVG.Point): void {
		this.moveTo(pos)
	}
	public placeRotate(angleDeg: number): void {
		this.rotate(angleDeg)
	}
	public placeFlip(horizontal: boolean): void {
		this.flip(horizontal)
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
		let nodeComponent: NodeComponent = new NodeComponent(symbol)
		nodeComponent.moveTo(new SVG.Point(saveObject.position))

		if (saveObject.rotation) {
			nodeComponent.rotationDeg = saveObject.rotation
		}

		let currentFlipState = nodeComponent.flipState.getValue().clone()
		if (saveObject.flipX) {
			currentFlipState.x = -1
		}else if(saveObject.flipY){
			currentFlipState.y = -1
		}
		nodeComponent.flipState.setValue(currentFlipState)

		if (saveObject.name) {
			nodeComponent.name.setValue(saveObject.name)
		}

		if (saveObject.label) {
			if (Object.hasOwn(saveObject.label,"value")) {
				saveObject.label.distance=new SVG.Number(saveObject.label.distance)
				nodeComponent.label.setValue(saveObject.label)
			}else{
				// @ts-ignore
				nodeComponent.label.setValue({value:saveObject.label})
			}
			nodeComponent.generateLabelRender(nodeComponent.label.getValue())
		}else{
			nodeComponent.label.setValue({value: ""})
		}
		nodeComponent.placeFinish()

		return nodeComponent;
	}

	public copyForPlacement(): NodeComponent {
		let newComponent = new NodeComponent(this.referenceSymbol)
		newComponent.rotationDeg = this.rotationDeg;
		newComponent.flipState.setValue(this.flipState.getValue(),false)
		return newComponent
	}

	private labelPos:SVG.Point
	public updateLabelPosition(): void {
		// currently working only with 90 deg rotation steps
		if (!this.label||!this.label.getValue()||this.label.getValue().value===""||!this.label.getValue().rendering) {
			return
		}
		let label = this.label.getValue()
		let labelSVG = this.label.getValue().rendering
		let transformMatrix = this.getTransformMatrix()
		// get relevant positions and bounding boxes
		let textPos = this.referenceSymbol._textPosition.point.add(this.position).transform(transformMatrix)
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelRef:SVG.Point;
		let labelDist = label.distance.convertToUnit("px").value??0;
		switch (label.anchor) {
			case LabelAnchor.default:
				let clamp = function(value:number,min:number,max:number){
					if (value<min) {
						return min
					}else if(value>max){
						return max
					}else{
						return value
					}
				}
				let useBBox = this.symbolUse.bbox().transform(transformMatrix)
				let horizontalTextPosition = clamp(Math.round(2*(useBBox.cx-textPos.x)/useBBox.w),-1,1)		
				let verticalTextPosition = clamp(Math.round(2*(useBBox.cy-textPos.y)/useBBox.h),-1,1)	
				labelRef = new SVG.Point(horizontalTextPosition,verticalTextPosition)
				break;
			case LabelAnchor.center:
				labelRef = new SVG.Point(0,0)
				break;
			case LabelAnchor.north:
				labelRef = new SVG.Point(0,1)
				break;
			case LabelAnchor.south:
				labelRef = new SVG.Point(0,-1)
				break;
			case LabelAnchor.east:
				labelRef = new SVG.Point(-1,0)
				break;
			case LabelAnchor.west:
				labelRef = new SVG.Point(1,0)
				break;
			case LabelAnchor.northeast:
				labelRef = new SVG.Point(-1,1)
				break;
			case LabelAnchor.northwest:
				labelRef = new SVG.Point(1,1)
				break;
			case LabelAnchor.southeast:
				labelRef = new SVG.Point(-1,-1)
				break;
			case LabelAnchor.southwest:
				labelRef = new SVG.Point(1,-1)
				break;
			default:
				break;
		}		
		this.labelPos = labelRef
		
		let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w,labelBBox.h)).add(labelRef.mul(labelDist))
		
		// acutally move the label
		let movePos = textPos.sub(ref)
		labelSVG.move(movePos.x,movePos.y)
	}
}