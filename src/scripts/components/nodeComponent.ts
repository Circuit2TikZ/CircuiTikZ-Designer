import * as SVG from "@svgdotjs/svg.js";
import { basicDirections, CanvasController, ChoiceProperty, CircuitikzComponent, CircuitikzSaveObject, ComponentSymbol, defaultBasicDirection, DirectionInfo, ExportController, MainController, MathJaxProperty, PositionedLabel, SectionHeaderProperty, SliderProperty, SnapDragHandler, SnappingInfo, SnapPoint, Undo } from "../internal"
import { referenceColor, roundTikz, selectedBoxWidth, selectionColor } from "../utils/selectionHelper";

export type NodeSaveObject = CircuitikzSaveObject & {
	position:{x:number, y:number}
	label?:PositionedLabel
	rotation?:number
	flipX?:boolean
	flipY?:boolean
}

export class NodeComponent extends CircuitikzComponent{
	private selectionRectangle: SVG.Rect = null;
	
	public anchorChoice: ChoiceProperty<DirectionInfo>
	public positionChoice: ChoiceProperty<DirectionInfo>

	public flipStateX:boolean
	public flipStateY:boolean

	constructor(symbol:ComponentSymbol){
		super(symbol)
		this.position = new SVG.Point()
		this.relPosition = symbol.relMid
		this.symbolUse = CanvasController.instance.canvas.use(symbol)
		this.visualization = CanvasController.instance.canvas.group()
		this.visualization.add(this.symbolUse)
		this.rotationDeg = 0

		{
			//label section
			this.propertiesHTMLRows.push(new SectionHeaderProperty("Label").buildHTML())

			this.mathJaxLabel = new MathJaxProperty()
			this.mathJaxLabel.addChangeListener(ev=>this.generateLabelRender())
			this.propertiesHTMLRows.push(this.mathJaxLabel.buildHTML())
	
			this.anchorChoice = new ChoiceProperty("Anchor",basicDirections,defaultBasicDirection)
			this.anchorChoice.addChangeListener(ev=>this.updateLabelPosition())
			this.propertiesHTMLRows.push(this.anchorChoice.buildHTML())
	
			this.positionChoice = new ChoiceProperty("Position",basicDirections,defaultBasicDirection)
			this.positionChoice.addChangeListener(ev=>this.updateLabelPosition())
			this.propertiesHTMLRows.push(this.positionChoice.buildHTML())
	
			this.labelDistance = new SliderProperty("Gap",-0.5,1,0.01,new SVG.Number(0.12,"cm"))
			this.labelDistance.addChangeListener(ev=>this.updateLabelPosition())
			this.propertiesHTMLRows.push(this.labelDistance.buildHTML())
		}

		this.addInfo()
		
		this.snappingPoints = symbol._pins.map(
			(pin) => new SnapPoint(this, pin.name, pin.point)
		);
	}

	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate:-this.rotationDeg,
			origin:[this.position.x,this.position.y],
			scaleX:this.flipStateX?-1:1,
			scaleY:this.flipStateY?-1:1
		})
	}

	public getSnapPointTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix({
			rotate:-this.rotationDeg,
			scaleX:this.flipStateX?-1:1,
			scaleY:this.flipStateY?-1:1
		})
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		super.recalculateSnappingPoints(matrix??this.getSnapPointTransformMatrix())
	}

	public getSnappingInfo():SnappingInfo {
		return {
			trackedSnappingPoints:this.snappingPoints,
			additionalSnappingPoints:[new SnapPoint(this,"center",new SVG.Point())]
		}
	}

	protected update(){
		// if flip has different x and y signs and 180 degrees turn, simplify to flip only
		if (this.rotationDeg==180) {
			if (this.flipStateX?!this.flipStateY:this.flipStateY) {
				this.flipStateX = !this.flipStateX
				this.flipStateY = !this.flipStateY
				this.rotationDeg=0;
			}else if(this.flipStateX&&this.flipStateY){
				this.flipStateX = false
				this.flipStateY = false
				this.rotationDeg=0;
			}
		}
		const tl = this.position.sub(this.referenceSymbol.relMid);
		this.symbolUse.move(tl.x, tl.y);
		let m = this.getTransformMatrix()
		this.symbolUse.transform(m)

		this._bbox = this.symbolUse.bbox().transform(m)
		this.updateLabelPosition()

		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x,this._bbox.y))

		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
	}

	public getPureBBox(): SVG.Box {
		return this.symbolUse.bbox().transform(this.getTransformMatrix())
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
		this.update()
		this.symbolUse.move(this.position.x - this.referenceSymbol.relMid.x, this.position.y - this.referenceSymbol.relMid.y);
	}
	
	public rotate(angleDeg: number): void {
		this.rotationDeg += angleDeg;
		this.simplifyRotationAngle()
		
		this.update()
	}
	public flip(horizontal: boolean): void {
		let flipX = this.flipStateX
		let flipY = this.flipStateY
		if (this.rotationDeg%180==0) {
			if (horizontal) {
				flipY=!flipY
			}else{
				flipX=!flipX
			}
		}else{
			if (horizontal) {
				flipX=!flipX
			}else{
				flipY=!flipY
			}
		}
		
		// double flipping equals rotation by 180 deg
		if (flipX&&flipY) {
			flipX=false
			flipY=false
			this.rotationDeg+=180;
			this.simplifyRotationAngle()
		}
		this.flipStateX = flipX
		this.flipStateY = flipY
		
		this.update()
	}

	public viewSelected(show: boolean): void {
		if (show) {
			this.selectionRectangle?.remove()
			let box = this.symbolUse.bbox().transform(this.getTransformMatrix());
			this.selectionRectangle = CanvasController.instance.canvas.rect(box.w,box.h).move(box.x,box.y)
			this.selectionRectangle.attr({
				"stroke-width":selectedBoxWidth,
				"stroke":this.isSelectionReference?referenceColor:selectionColor,
				"stroke-dasharray":"3,3",
				"fill":"none"
			});
			this.visualization.stroke("#f00")
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
			position:this.position.simplifyForJson(),
		}
		if (this.rotationDeg!==0) {
			data.rotation=this.rotationDeg
		}
		if (this.flipStateX) {
			data.flipX = true
		}
		if (this.flipStateY) {
			data.flipY = true
		}
		if (this.name.value) {
			data.name = this.name.value
		}
		if (this.mathJaxLabel.value) {
			let labelWithoutRender:PositionedLabel = {
				value:this.mathJaxLabel.value,
				anchor:this.anchorChoice.value.key,
				position:this.positionChoice.value.key,
				distance:this.labelDistance.value??undefined
			}
			data.label = labelWithoutRender
		}

		return data
	}

	public toTikzString(): string {
		const optionsString = this.referenceSymbol.serializeTikzOptions();

		let id = this.name.value
		if (!id&&this.mathJaxLabel.value) {
			id = ExportController.instance.createExportID("N")
		}

		let labelNodeStr = ""
		if (this.mathJaxLabel.value) {
			let labelStr = "anchor="+this.labelPos.name
			
			let labelDist = this.labelDistance.value.convertToUnit("cm")
			
			if (this.anchorChoice.value.key==defaultBasicDirection.key) {
				labelDist = labelDist.minus(0.12)
			}

			let labelShift = this.labelPos.direction.mul(-labelDist.value)
			let posShift = ""
			if (labelShift.x!==0) {
				posShift+="xshift="+roundTikz(labelShift.x)+"cm"
			}
			if (labelShift.y!==0) {
				posShift += posShift==""?"":", "
				posShift+="yshift="+roundTikz(-labelShift.y)+"cm"
			}
			posShift = posShift==""?"":"["+posShift+"]"

			let pos = defaultBasicDirection.name
			if (this.positionChoice.value.key!="default") {
				let newdir = this.positionChoice.value.direction.transform(new SVG.Matrix({
					rotate: -this.rotationDeg,
					scaleX:this.flipStateX?-1:1,
					scaleY:this.flipStateY?-1:1
				}))
				
				pos = basicDirections.find((item)=>item.direction==newdir).name
			}

			let posStr = this.positionChoice.value.key==defaultBasicDirection.key?id+".text":id+"."+pos

			labelNodeStr = " node["+labelStr+"] at ("+posShift+posStr+"){$"+this.mathJaxLabel.value+"$}"
		}
		
		//don't change the order of scale and rotate!!! otherwise tikz render and UI are not the same
		return (
			"\\draw node[" +
			this.referenceSymbol.tikzName +
			(optionsString ? ", " + optionsString : "") +
			(this.rotationDeg !== 0 ? `, rotate=${this.rotationDeg}` : "") +
			(this.flipStateX ? `, xscale=-1` : "") +
			(this.flipStateY ? `, yscale=-1` : "") +
			"] " +
			(id ? "(" + id + ") " : "") +
			"at " +
			this.position.toTikzString() +
			" {}"+
			labelNodeStr
			+";"
		);
	}
	public remove(): void {
		SnapDragHandler.snapDrag(this,false)
		this.visualization.remove()
		this.viewSelected(false)
		this.labelRendering?.remove()
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.visualization.node.classList.add("draggable")
		}else{
			this.visualization.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag,this.symbolUse)
	}

	public resizable(resize: boolean): void {
		throw new Error("Method not implemented.");
	}
	protected recalculateResizePoints(): void {
		throw new Error("Method not implemented.");
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
		this.update()
		this.finishedPlacing=true
	}

	public static fromJson(saveObject:NodeSaveObject): NodeComponent{
		let symbol = MainController.instance.symbols.find((value,index,symbols)=>value.node.id==saveObject.id)
		let nodeComponent: NodeComponent = new NodeComponent(symbol)
		nodeComponent.moveTo(new SVG.Point(saveObject.position))

		if (saveObject.rotation) {
			nodeComponent.rotationDeg = saveObject.rotation
		}

		if (saveObject.flipX) {
			nodeComponent.flipStateX = saveObject.flipX
		}
		if(saveObject.flipY){
			nodeComponent.flipStateY = saveObject.flipY
		}

		if (saveObject.name) {
			nodeComponent.name.updateValue(saveObject.name,true)
		}

		if (saveObject.label) {
			if (Object.hasOwn(saveObject.label,"value")) {
				nodeComponent.labelDistance.value=saveObject.label.distance?new SVG.Number(saveObject.label.distance):new SVG.Number(0)
				nodeComponent.labelDistance.updateHTML()
				nodeComponent.anchorChoice.value=
					saveObject.label.anchor?basicDirections.find((item)=>item.key==saveObject.label.anchor):defaultBasicDirection
				nodeComponent.anchorChoice.updateHTML()
				nodeComponent.positionChoice.value=
					saveObject.label.position?basicDirections.find((item)=>item.key==saveObject.label.position):defaultBasicDirection
				nodeComponent.positionChoice.updateHTML()
				nodeComponent.mathJaxLabel.value = saveObject.label.value
				nodeComponent.mathJaxLabel.updateHTML()
				nodeComponent.labelColor.value = saveObject.label.color?new SVG.Color(saveObject.label.color):null
				nodeComponent.labelColor.updateHTML()
				nodeComponent.generateLabelRender()
			}else{
				//@ts-ignore
				nodeComponent.mathJaxLabel.value = (saveObject.label)
			}
		}
		nodeComponent.placeFinish()

		return nodeComponent;
	}

	public copyForPlacement(): NodeComponent {
		let newComponent = new NodeComponent(this.referenceSymbol)
		newComponent.rotationDeg = this.rotationDeg;
		newComponent.flipStateX = this.flipStateX
		newComponent.flipStateY = this.flipStateY
		return newComponent
	}

	private labelPos:DirectionInfo
	public updateLabelPosition(): void {
		// currently working only with 90 deg rotation steps
		if (!this.mathJaxLabel.value||!this.labelRendering) {
			return
		}
		let label = this.mathJaxLabel.value
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		// get relevant positions and bounding boxes
		let textPos:SVG.Point
		if (this.positionChoice.value.key==defaultBasicDirection.key) {
			textPos = this.referenceSymbol._textPosition.point.add(this.position).transform(transformMatrix)
		}else{
			let bboxHalfSize = new SVG.Point(this.bbox.w/2,this.bbox.h/2)
			let pos = new SVG.Point(this.bbox.cx,this.bbox.cy)
			textPos = pos.add(bboxHalfSize.mul(this.positionChoice.value.direction))
		}
		let labelBBox = labelSVG.bbox()

		// calculate where on the label the anchor point should be
		let labelRef:SVG.Point;
		let labelDist = this.labelDistance.value.convertToUnit("px").value??0;
		if (this.anchorChoice.value.key==defaultBasicDirection.key) {
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

			//reset to center before actually checking where it should go
			this.labelPos = basicDirections.find((item)=>item.direction.eq(labelRef))
		}else{
			this.labelPos = this.anchorChoice.value
			labelRef = this.labelPos.direction
		}
		
		let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w,labelBBox.h)).add(labelRef.mul(labelDist))
		
		// acutally move the label
		let movePos = textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({translate:[movePos.x,movePos.y]}))
	}
}