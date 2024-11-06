import * as SVG from "@svgdotjs/svg.js"
import { AdjustDragHandler, basicDirections, CanvasController, ChoiceProperty, CircuitComponent, defaultBasicDirection, defaultFontSize, DirectionInfo, ExportController, FillInfo, FontSize, fontSizes, PositionedLabel, SectionHeaderProperty, SelectionController, ShapeComponent, ShapeSaveObject, SliderProperty, SnapCursorController, SnapDragHandler, SnapPoint, StrokeInfo, Text, TextAreaProperty } from "../internal";
import { referenceColor, resizeSVG, roundTikz, selectedBoxWidth, selectionColor } from "../utils/selectionHelper";
import sanitizeHtml from 'sanitize-html';

export type RectangleSaveObject = ShapeSaveObject & {
	firstPoint:SVG.Point
	secondPoint:SVG.Point,
	text?:Text&{innerSep?:SVG.Number,fontSize?:string}
}

export class RectangleComponent extends ShapeComponent{
	private firstPoint:SVG.Point;
	private secondPoint:SVG.Point;

	protected declare shapeVisualization:SVG.Rect;
	protected declare selectionElement:SVG.Rect;
	protected declare dragElement:SVG.Rect

	private textAreaProperty:TextAreaProperty
	private textInnerSep:SliderProperty
	private textFontSize:ChoiceProperty<FontSize>
	private textForeign:SVG.ForeignObject
	private textDiv:HTMLDivElement

	public constructor(){
		super()
		this.displayName = "Rectangle"

		this.shapeVisualization = CanvasController.instance.canvas.rect(0,0)
		this.shapeVisualization.hide()

		this.dragElement = CanvasController.instance.canvas.rect(0,0)
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		});

		this.visualization.add(this.shapeVisualization)
		CanvasController.instance.canvas.add(this.visualization)

		this.visualization.add(this.dragElement)

		SnapCursorController.instance.visible = true;
		this.snappingPoints = []

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Text").buildHTML())
		this.textAreaProperty = new TextAreaProperty({text:"",align:-1,justify:-1})
		this.textAreaProperty.addChangeListener(ev=>{		
			this.update()
		})
		this.propertiesHTMLRows.push(this.textAreaProperty.buildHTML())

		this.textFontSize = new ChoiceProperty("Fontsize",fontSizes,defaultFontSize)
		this.textFontSize.addChangeListener((ev)=>{this.update()})
		this.propertiesHTMLRows.push(this.textFontSize.buildHTML())

		this.textInnerSep = new SliderProperty("Inner sep",0,10,0.1,new SVG.Number(5,"pt"))
		this.textInnerSep.addChangeListener((ev)=>{this.update()})
		this.propertiesHTMLRows.push(this.textInnerSep.buildHTML())

		this.textForeign = CanvasController.instance.canvas.foreignObject(0,0)
		this.textForeign.node.setAttribute("overflow","visible")
		this.textForeign.node.style.pointerEvents = "none"
		this.textDiv = document.createElement("div") as HTMLDivElement
		this.textDiv.classList.add("unselectable")
		this.textDiv.style.width = "100%"
		this.textDiv.style.height = "100%"
		this.textDiv.style.display = "flex"
		let textSpan = document.createElement("div") as HTMLDivElement
		textSpan.style.width = "100%"
		textSpan.style.display = "inline-block"
		this.textDiv.appendChild(textSpan)
		this.textForeign.node.appendChild(this.textDiv)
		this.visualization.add(this.textForeign)
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		let relPositions:{anchorname:string,relPos:SVG.Point}[] = []
		let halfSize = new SVG.Point(Math.abs(this.firstPoint.x-this.secondPoint.x)/2,Math.abs(this.firstPoint.y-this.secondPoint.y)/2)
		for (const anchor of basicDirections) {
			if (anchor.key==defaultBasicDirection.key) {
				continue
			}			
			relPositions.push({relPos:halfSize.mul(anchor.direction),anchorname:anchor.name})
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

	protected recalculateResizePoints(){
		let halfsize = new SVG.Point(this.bbox.w/2,this.bbox.h/2)
		for (const [dir,viz] of this.resizeVisualizations) {
			let pos = this.position.add(halfsize.mul(dir.direction))
			viz.center(pos.x,pos.y)
		}
	}
	public resizable(resize: boolean): void {
		if (resize==this.isResizing) {
			return
		}
		this.isResizing=resize
		if (resize) {
			let originalPos:SVG.Point
			let originalSize:SVG.Point
			const getInitialDim = ()=>{
				originalPos = this.position.clone()
				originalSize = this.firstPoint.sub(this.secondPoint)
				originalSize.x = Math.abs(originalSize.x)
				originalSize.y = Math.abs(originalSize.y)
			}
	
			for (const direction of basicDirections) {
				if (direction.key==defaultBasicDirection.key||direction.key=="center") {
					continue
				}
	
				let viz = resizeSVG()
				if (direction.pointer) {
					viz.node.style.cursor=direction.pointer
				}
				this.resizeVisualizations.set(direction,viz)
	
				let startPoint:SVG.Point
				let oppositePoint:SVG.Point
				AdjustDragHandler.snapDrag(this, viz, true, {
					dragStart: (pos)=>{
						getInitialDim()
						let box = viz.bbox()
						startPoint = new SVG.Point(box.cx,box.cy)
						oppositePoint = originalPos.add(direction.direction.mul(originalSize).div(-2))
					},
					dragMove: (pos,ev)=>{
						if (ev&&(ev as MouseEvent|TouchEvent).ctrlKey&&direction.direction.x*direction.direction.y!=0) {
							// get closest point on one of the two diagonals
							let diff = pos.sub(oppositePoint)
							if (diff.x*diff.y<0) {
								pos = new SVG.Point(pos.x-pos.y,pos.y-pos.x).add(oppositePoint.x+oppositePoint.y).div(2)
							}else{
								pos = new SVG.Point(oppositePoint.x-oppositePoint.y,oppositePoint.y-oppositePoint.x).add(pos.x+pos.y).div(2)
							}
						}
						let delta = pos.sub(startPoint)
						let newHalfSize = originalSize.add(delta.mul(direction.direction)).div(2)
						let newPos = originalPos.add(delta.mul(new SVG.Point(Math.abs(direction.direction.x)/2,Math.abs(direction.direction.y)/2)))
						this.firstPoint = newPos.sub(newHalfSize)
						this.secondPoint = newPos.add(newHalfSize)
						this.update()
					},
				})
			}
			this.update()
		}else{
			for (const [dir,viz] of this.resizeVisualizations) {
				AdjustDragHandler.snapDrag(this, viz, false)
				viz.remove()
			}
			this.resizeVisualizations.clear()
		}
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
		let strokeWidth =this.strokeInfo.width.convertToUnit("px").value 
		let halfstroke = strokeWidth/2
		let upperLeft = new SVG.Point(Math.min(this.firstPoint.x,this.secondPoint.x),Math.min(this.firstPoint.y,this.secondPoint.y))
		let lowerRight = new SVG.Point(Math.max(this.firstPoint.x,this.secondPoint.x),Math.max(this.firstPoint.y,this.secondPoint.y))

		this.dragElement.move(upperLeft.x,upperLeft.y).size(lowerRight.x-upperLeft.x,lowerRight.y-upperLeft.y)

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
		
		this.shapeVisualization.size(this.size.x<strokeWidth?0:this.size.x-strokeWidth,this.size.y<strokeWidth?0:this.size.y-strokeWidth)
		this.shapeVisualization.move(upperLeft.x,upperLeft.y)
		this._bbox = new SVG.Box(upperLeft.x-halfstroke,upperLeft.y-halfstroke,this.size.x,this.size.y)
		
		this.relPosition = this.position.sub(upperLeft)
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updateLabelPosition()
		this.updateText()
	}
	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let lineWidth = selectedBoxWidth.convertToUnit("px").value
			this.selectionElement.move(this.bbox.x-lineWidth/2,this.bbox.y-lineWidth/2);
			this.selectionElement.attr("width",this.bbox.w+lineWidth);
			this.selectionElement.attr("height",this.bbox.h+lineWidth);
		}
	}

	public getPureBBox(): SVG.Box {
		let upperLeft = new SVG.Point(Math.min(this.firstPoint.x,this.secondPoint.x),Math.min(this.firstPoint.y,this.secondPoint.y))
		let lowerRight = new SVG.Point(Math.max(this.firstPoint.x,this.secondPoint.x),Math.max(this.firstPoint.y,this.secondPoint.y))
		return new SVG.Box(upperLeft.x,upperLeft.y,lowerRight.x-upperLeft.x,lowerRight.y-upperLeft.y)
	}

	public viewSelected(show: boolean): void {
		if (show) {
			this.selectionElement?.remove()
			this.selectionElement = CanvasController.instance.canvas.rect(this.bbox.w,this.bbox.h).move(this.bbox.x,this.bbox.y)
			this.selectionElement.attr({
				"stroke-width":selectedBoxWidth,
				"stroke":this.isSelectionReference?referenceColor:selectionColor,
				"stroke-dasharray":"3,3",
				"fill":"none"
			});
			this.visualization.stroke("#f00")
		} else {
			this.selectionElement?.remove();
			this.visualization.stroke("#000")
			this.selectionElement = null
		}
		this.resizable(this.isSelected&&show&&SelectionController.instance.currentlySelectedComponents.length==1)
	}
	public toJson(): RectangleSaveObject {
		let data:RectangleSaveObject = {
			type:"rect",
			firstPoint:this.firstPoint.simplifyForJson(),
			secondPoint:this.secondPoint.simplifyForJson()
		}

		let fill:FillInfo={}
		let shouldFill = false
		if (this.fillInfo.color!="default") {
			fill.color = this.fillInfo.color
			shouldFill = true
		}
		if (this.fillInfo.opacity!=0) {
			fill.opacity = this.fillInfo.opacity
			shouldFill = true
		}
		if (shouldFill) {
			data.fill=fill
		}

		let stroke:StrokeInfo={}
		let shouldStroke = false
		if (this.strokeInfo.color!="default") {
			stroke.color = this.strokeInfo.color
			shouldStroke = true
		}		
		if (this.strokeInfo.opacity!=1) {
			stroke.opacity = this.strokeInfo.opacity
			shouldStroke = true
		}
		
		if (!this.strokeInfo.width.eq(new SVG.Number("1pt"))) {
			stroke.width = this.strokeInfo.width
			shouldStroke = true
		}
		if (shouldStroke) {
			data.stroke=stroke
		}

		if (this.mathJaxLabel.value) {
			let labelWithoutRender:PositionedLabel = {
				value:this.mathJaxLabel.value,
				anchor:this.anchorChoice.value.key,
				position:this.positionChoice.value.key,
				distance:this.labelDistance.value??undefined,
				color:this.labelColor.value?this.labelColor.value.toString():undefined
			}
			data.label = labelWithoutRender
		}

		if (this.textAreaProperty.value&&this.textAreaProperty.value.text!=="") {
			let textData:Text&{fontSize?:string,innerSep?:SVG.Number}={
				text:this.textAreaProperty.value.text
			}
			if (this.textAreaProperty.value.align!==-1) {
				textData.align=this.textAreaProperty.value.align
			}
			if (this.textAreaProperty.value.justify!==-1) {
				textData.justify=this.textAreaProperty.value.justify
			}
			if (this.textFontSize.value.key!==defaultFontSize.key) {
				textData.fontSize = this.textFontSize.value.key
			}
			if (this.textInnerSep.value.value!==5) {
				textData.innerSep = this.textInnerSep.value
			}
			data.text=textData
		}

		return data
	}

	static fromJson(saveObject: RectangleSaveObject): RectangleComponent {
		let rectComponent = new RectangleComponent()
		rectComponent.firstPoint = new SVG.Point(saveObject.firstPoint)
		rectComponent.secondPoint = new SVG.Point(saveObject.secondPoint)

		if (saveObject.fill) {
			if (saveObject.fill.color) {
				rectComponent.fillInfo.color=saveObject.fill.color
				rectComponent.fillColorProperty.value = new SVG.Color(saveObject.fill.color)
				rectComponent.fillColorProperty.updateHTML()
			}
			if (saveObject.fill.opacity!=undefined) {
				rectComponent.fillInfo.opacity=saveObject.fill.opacity
				rectComponent.fillOpacityProperty.value = new SVG.Number(saveObject.fill.opacity*100,"%")
				rectComponent.fillOpacityProperty.updateHTML()
			}
		}

		if (saveObject.stroke) {
			
			if (saveObject.stroke.color) {
				rectComponent.strokeInfo.color=saveObject.stroke.color
				rectComponent.strokeColorProperty.value = new SVG.Color(saveObject.stroke.color)
				rectComponent.strokeColorProperty.updateHTML()
			}
			if (saveObject.stroke.opacity!=undefined) {
				rectComponent.strokeInfo.opacity=saveObject.stroke.opacity
				rectComponent.strokeOpacityProperty.value = new SVG.Number(saveObject.stroke.opacity*100,"%")
				rectComponent.strokeOpacityProperty.updateHTML()
			}			
			if (saveObject.stroke.width) {
				rectComponent.strokeInfo.width=new SVG.Number(saveObject.stroke.width)
				rectComponent.strokeWidthProperty.value = rectComponent.strokeInfo.width
				rectComponent.strokeWidthProperty.updateHTML()
			}
		}

		if (saveObject.label) {
			rectComponent.labelDistance.value=saveObject.label.distance?new SVG.Number(saveObject.label.distance):new SVG.Number(0)
			rectComponent.labelDistance.updateHTML()
			rectComponent.anchorChoice.value=
				saveObject.label.anchor?basicDirections.find((item)=>item.key==saveObject.label.anchor):defaultBasicDirection;
			rectComponent.anchorChoice.updateHTML()
			rectComponent.positionChoice.value=
				saveObject.label.position?basicDirections.find((item)=>item.key==saveObject.label.position):defaultBasicDirection;
			rectComponent.positionChoice.updateHTML()
			rectComponent.mathJaxLabel.value = saveObject.label.value
			rectComponent.mathJaxLabel.updateHTML()
			rectComponent.labelColor.value = saveObject.label.color?new SVG.Color(saveObject.label.color):null
			rectComponent.labelColor.updateHTML()
			rectComponent.generateLabelRender()
		}

		if (saveObject.text) {
			let text:Text={
				text:saveObject.text.text,
				align:saveObject.text.align??-1,
				justify:saveObject.text.justify??-1
			}
			rectComponent.textAreaProperty.value = text
			rectComponent.textAreaProperty.updateHTML()
			rectComponent.textFontSize.value = saveObject.text.fontSize?fontSizes.find(item=>item.key==saveObject.text.fontSize):defaultFontSize
			rectComponent.textFontSize.updateHTML()
			rectComponent.textInnerSep.value = saveObject.text.innerSep?new SVG.Number(saveObject.text.innerSep):new SVG.Number("5pt")
			rectComponent.textInnerSep.updateHTML()
		}

		rectComponent.placeFinish()
		rectComponent.updateTheme()
		return rectComponent
	}

	public toTikzString(): string {
		let optionsArray:string[]=["shape=rectangle"]
		if (this.fillInfo.opacity>0) {
			if (this.fillInfo.color!=="default") {
				let c = new SVG.Color(this.fillInfo.color)
				optionsArray.push("fill="+c.toTikzString())
			}

			if (this.fillInfo.opacity!=1) {
				optionsArray.push("fill opacity="+this.fillInfo.opacity.toString())
			}
		}

		if (this.strokeInfo.opacity>0) {
			if (this.strokeInfo.color!=="default") {
				let c = new SVG.Color(this.strokeInfo.color)
				optionsArray.push("draw="+c.toTikzString())
			}else{
				optionsArray.push("draw")
			}

			if (this.strokeInfo.opacity!=1) {
				optionsArray.push("draw opacity="+this.strokeInfo.opacity.toString())
			}

			let width = this.strokeInfo.width.convertToUnit("pt").value
			if (width!=0.4) {
				optionsArray.push("line width="+width+"pt")
			}
		}

		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value

		optionsArray.push("inner sep=0")
		optionsArray.push("minimum width="+roundTikz(new SVG.Number(this.size.x-strokeWidth,"px").convertToUnit("cm").value)+"cm")
		optionsArray.push("minimum height="+roundTikz(new SVG.Number(this.size.y-strokeWidth,"px").convertToUnit("cm").value)+"cm")

		let id = this.name.value
		if (!id&&(this.mathJaxLabel.value)) {
			id = ExportController.instance.createExportID("Rect")
		}		

		let textStr = ""
		if (this.textAreaProperty.value.text) {
			let dir = new SVG.Point(this.textAreaProperty.value.align,this.textAreaProperty.value.justify)
			let anchor = basicDirections.find(item=>item.direction.eq(dir)).name;
			let pos = this.position.add(dir.mul(this.size.div(2)))
			
			let innerSep = this.textInnerSep.value.plus(this.strokeInfo.width.times(0.5))
			let textWidth = new SVG.Number(this.size.x,"px").minus(this.strokeInfo.width.plus(this.textInnerSep.value).times(2)).convertToUnit("cm")
			
			let fontStr = this.textFontSize.value.key==defaultFontSize.key?"":`\\${this.textFontSize.value.name}`
			let options = `[anchor=${anchor}, align=${this.textAreaProperty.value.align==-1?"left":this.textAreaProperty.value.align==0?"center":"right"}, text width=${roundTikz(textWidth.value)}cm, inner sep=${innerSep.toString()}]`
			textStr = ` node ${options} at ${pos.toTikzString()}{${fontStr} ${this.textAreaProperty.value.text.replaceAll("\n","\\\\")}}`
		}

		let labelNodeStr = ""
		if (this.mathJaxLabel.value) {
			let labelStr = "anchor="+this.labelPos.name
			
			let labelDist = this.labelDistance.value.convertToUnit("cm")

			let anchorDir = this.anchorChoice.value.key==defaultBasicDirection.key?new SVG.Point():this.anchorChoice.value.direction
			let labelShift = anchorDir.mul(-labelDist.value)
			let posShift = ""
			if (labelShift.x!==0) {
				posShift+="xshift="+roundTikz(labelShift.x)+"cm"
			}
			if (labelShift.y!==0) {
				posShift += posShift==""?"":", "
				posShift+="yshift="+roundTikz(-labelShift.y)+"cm"
			}
			posShift = posShift==""?"":"["+posShift+"]"

			let posStr = this.positionChoice.value.key==defaultBasicDirection.key?id+".center":id+"."+this.positionChoice.value.name

			labelNodeStr = " node["+labelStr+"] at ("+posShift+posStr+"){$"+this.mathJaxLabel.value+"$}"
		}

		let optionsStr = optionsArray.length>0?`[${optionsArray.join(", ")}]`:""
		return `\\node${optionsStr}${id?"("+id+")":""} at ${this.position.toTikzString()}{}${textStr}${labelNodeStr};`
	}
	public copyForPlacement(): CircuitComponent {
		return new RectangleComponent()
	}
	public remove(): void {
		for (const [dir,viz] of this.resizeVisualizations) {
			AdjustDragHandler.snapDrag(this, viz, false)
			viz.remove()
		}
		SnapDragHandler.snapDrag(this,false)
		this.visualization.remove()
		this.draggable(false)
		this.resizable(false)
		this.viewSelected(false)
		this.selectionElement?.remove()
	}
	public placeMove(pos: SVG.Point, ev?: Event): void {
		if (!this.firstPoint) {
			// not started placing
			SnapCursorController.instance.moveTo(pos)
		}else{
			if (ev&&(ev as MouseEvent|TouchEvent).ctrlKey) {
				// get closest point on one of the two diagonals
				let diff = pos.sub(this.firstPoint)
				if (diff.x*diff.y<0) {
					this.secondPoint = new SVG.Point(pos.x-pos.y,pos.y-pos.x).add(this.firstPoint.x+this.firstPoint.y).div(2)
				}else{
					this.secondPoint = new SVG.Point(this.firstPoint.x-this.firstPoint.y,this.firstPoint.y-this.firstPoint.x).add(pos.x+pos.y).div(2)
				}
			}else{
				this.secondPoint = pos
			}
			this.update()
		}
	}
	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		if (this.secondPoint) {
			return true
		}
		if (!this.firstPoint){
			this.firstPoint = pos
			this.shapeVisualization.show()
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
		this.shapeVisualization.show()
		this.draggable(true)		
		this.update()
		SnapCursorController.instance.visible=false
	}

	private labelPos:DirectionInfo
	public updateLabelPosition(): void {
		if (!this.mathJaxLabel.value||!this.labelRendering) {
			return
		}
		let labelSVG = this.labelRendering
		let transformMatrix = this.getTransformMatrix()
		// get relevant positions and bounding boxes
		let textPos:SVG.Point
		if (this.positionChoice.value.key==defaultBasicDirection.key) {
			textPos = new SVG.Point(this.bbox.cx,this.bbox.cy)
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
			let useBBox = this.bbox.transform(transformMatrix)
			let horizontalTextPosition = clamp(Math.round(2*(useBBox.cx-textPos.x)/useBBox.w),-1,1)		
			let verticalTextPosition = clamp(Math.round(2*(useBBox.cy-textPos.y)/useBBox.h),-1,1)	
			labelRef = new SVG.Point(horizontalTextPosition,verticalTextPosition)
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

	private updateText(){
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value
		this.textForeign.move(this.bbox.x+strokeWidth,this.bbox.y+strokeWidth)
		let w = this.bbox.w-strokeWidth*2
		let h = this.bbox.h-strokeWidth*2
		this.textForeign.size(w<0?0:w,h<0?0:h)

		let text = sanitizeHtml(this.textAreaProperty.value.text,{
			allowedTags:[],
			allowedAttributes:{},
		})

		this.textDiv.children[0].innerHTML = text.replaceAll("\n","<br>")
		this.textDiv.style.textAlign = this.textAreaProperty.value.align==-1?"start":this.textAreaProperty.value.align==0?"center":"end"
		this.textDiv.style.alignItems = this.textAreaProperty.value.justify==-1?"start":this.textAreaProperty.value.justify==0?"center":"end"
		this.textDiv.style.fontSize = this.textFontSize.value.size + "pt"
		this.textDiv.style.fontFamily = "Times New Roman"
		this.textDiv.style.overflowWrap = "break-word"
		this.textDiv.style.hyphens = "auto"
		this.textDiv.style.padding = this.textInnerSep.value.convertToUnit("pt").toString()
		this.textDiv.style.lineHeight = this.textFontSize.value.size*1.1 + "pt"
	}
}