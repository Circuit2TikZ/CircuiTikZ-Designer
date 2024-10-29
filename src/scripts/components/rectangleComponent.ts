import * as SVG from "@svgdotjs/svg.js"
import { AdjustDragHandler, basicDirections, CanvasController, ChoiceProperty, CircuitComponent, ColorProperty, ComponentSaveObject, defaultBasicDirection, DirectionInfo, MathJaxProperty, PositionedLabel, SectionHeaderProperty, SelectionController, SliderProperty, SnapCursorController, SnapDragHandler, SnappingInfo, SnapPoint, TextProperty, Undo } from "../internal";
import { resizeSVG, selectedBoxWidth, selectionColor } from "../utils/selectionHelper";

export type RectangleSaveObject = ComponentSaveObject & {
	firstPoint:SVG.Point
	secondPoint:SVG.Point,
	fill?:FillInfo,
	stroke?:StrokeInfo,
	label?:PositionedLabel
}

export type StrokeInfo = {
	width?:SVG.Number,
	color?:string|"default",
	opacity?:number
}

export type FillInfo = {
	color?:string|"default",
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

	private resizeVisualizations:Map<DirectionInfo,SVG.Element>

	private fillColorProperty:ColorProperty
	private fillOpacityProperty:SliderProperty
	private strokeColorProperty:ColorProperty
	private strokeOpacityProperty:SliderProperty
	private strokeWidthProperty:SliderProperty

	private anchorChoice:ChoiceProperty
	private positionChoice:ChoiceProperty
	private labelDistance:SliderProperty

	private textProperty:TextProperty // TODO change to textarea, add toJson and Tikz
	private textForeign:SVG.ForeignObject
	private textDiv:HTMLDivElement

	public constructor(){
		super()
		this.displayName = "Rectangle"

		this.visualization = CanvasController.instance.canvas.group()
		this.resizeVisualizations = new Map<DirectionInfo,SVG.Element>()

		this.fillInfo={
			color:new SVG.Color(0,0,0,"rgb").toRgb(),
			opacity:0,
		}
		this.strokeInfo={
			color:"default",
			opacity:1,
			width:new SVG.Number("1pt"),
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

		//add color property
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Fill").buildHTML())

		this.fillOpacityProperty = new SliderProperty("Opacity",0,100,1,new SVG.Number(this.fillInfo.opacity*100,"%"))
		this.fillOpacityProperty.addChangeListener(ev=>{
			this.fillInfo.opacity = ev.value.value/100
			this.updateTheme()
		})

		this.fillColorProperty  = new ColorProperty("Color",new SVG.Color(0,0,0,"rgb"))
		this.fillColorProperty.addChangeListener(ev=>{
			if (ev.value==null) {
				this.fillInfo.color = "default"
				this.fillInfo.opacity=0
			}else{
				this.fillInfo.color = ev.value.toRgb()
				this.fillInfo.opacity=this.fillOpacityProperty.value.value/100
			}			
			this.updateTheme()
		})

		this.propertiesHTMLRows.push(this.fillColorProperty.buildHTML())
		this.propertiesHTMLRows.push(this.fillOpacityProperty.buildHTML())

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Stroke").buildHTML())
		this.strokeOpacityProperty = new SliderProperty("Opacity",0,100,1,new SVG.Number(this.strokeInfo.opacity*100,"%"))
		this.strokeOpacityProperty.addChangeListener(ev=>{
			this.strokeInfo.opacity = ev.value.value/100
			this.updateTheme()
		})

		this.strokeColorProperty = new ColorProperty("Color",null)
		this.strokeColorProperty.addChangeListener(ev=>{
			if (ev.value==null) {
				this.strokeInfo.color = "default"
				this.strokeInfo.opacity=1
			}else{
				this.strokeInfo.color = ev.value.toRgb()
				this.strokeInfo.opacity=this.strokeOpacityProperty.value.value/100
			}			
			this.updateTheme()
		})
		this.strokeWidthProperty = new SliderProperty("Width",0,10,0.1,this.strokeInfo.width)
		this.strokeWidthProperty.addChangeListener(ev=>{
			this.strokeInfo.width = ev.value
			this.update()
			this.updateTheme()
		})
		this.propertiesHTMLRows.push(this.strokeColorProperty.buildHTML())
		this.propertiesHTMLRows.push(this.strokeOpacityProperty.buildHTML())
		this.propertiesHTMLRows.push(this.strokeWidthProperty.buildHTML())

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Text").buildHTML())
		this.textProperty = new TextProperty("Content","")
		this.textProperty.addChangeListener(ev=>{
			// I know I should sanatize the input here, but we don't have any database or connection to the server apart from loading the page so this really shouldn't be a problem
			this.textDiv.innerHTML = this.textProperty.value
			this.update()
		})
		this.propertiesHTMLRows.push(this.textProperty.buildHTML())

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

		this.textForeign = CanvasController.instance.canvas.foreignObject(0,0)
		this.textForeign.node.setAttribute("overflow","visible")
		this.textForeign.node.style.pointerEvents = "none"
		this.textDiv = document.createElement("div") as HTMLDivElement
		this.textDiv.classList.add("w-100","h-100")
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

	public updateTheme(): void {
		let strokeColor = this.strokeInfo.color
		if (strokeColor=="default") {
			strokeColor = "var(--bs-emphasis-color)"
		}
		
		let fillColor = this.fillInfo.color
		if (fillColor=="default") {
			fillColor = "none"
		}

		this.rectangle.stroke({
			color:strokeColor,
			opacity:this.strokeInfo.opacity,
			width:this.strokeInfo.opacity==0?0:this.strokeInfo.width.convertToUnit("px").value,
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
				AdjustDragHandler.snapDrag(this, viz, true, {
					dragStart: (pos)=>{
						getInitialDim()
						let box = viz.bbox()
						startPoint = new SVG.Point(box.cx,box.cy)
					},
					dragMove: (pos)=>{
						let delta = pos.sub(startPoint)
						let newHalfSize = originalSize.add(delta.mul(direction.direction)).div(2)
						let newPos = originalPos.add(delta.mul(new SVG.Point(Math.abs(direction.direction.x)/2,Math.abs(direction.direction.y)/2)))
						this.firstPoint = newPos.sub(newHalfSize)
						this.secondPoint = newPos.add(newHalfSize)
						this.update()
					},
					dragEnd:()=>{Undo.addState()}
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
		
		this.rectangle.size(this.size.x<strokeWidth?0:this.size.x-strokeWidth,this.size.y<strokeWidth?0:this.size.y-strokeWidth)
		this.rectangle.move(upperLeft.x,upperLeft.y)
		this._bbox = new SVG.Box(upperLeft.x-halfstroke,upperLeft.y-halfstroke,this.size.x,this.size.y)
		
		this.relPosition = this.position.sub(upperLeft)
		this.recalculateSelectionVisuals()
		this.recalculateSnappingPoints()
		this.recalculateResizePoints()
		this.updateLabelPosition()
		this.updateText()
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
		this.resizable(this.isSelected&&show&&SelectionController.instance.currentlySelectedComponents.length==1)
	}
	public toJson(): RectangleSaveObject {
		let data:RectangleSaveObject = {
			type:"rect",
			firstPoint:this.firstPoint,
			secondPoint:this.secondPoint
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
				distance:this.labelDistance.value??undefined
			}
			data.label = labelWithoutRender
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
			if (saveObject.fill.opacity) {
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
			if (saveObject.stroke.opacity) {
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
			if (Object.hasOwn(saveObject.label,"value")) {
				rectComponent.labelDistance.updateValue(saveObject.label.distance?new SVG.Number(saveObject.label.distance):new SVG.Number(0),true)
				rectComponent.anchorChoice.updateValue(
					saveObject.label.anchor?basicDirections.find((item)=>item.key==saveObject.label.anchor):defaultBasicDirection,true)
				rectComponent.positionChoice.updateValue(
					saveObject.label.position?basicDirections.find((item)=>item.key==saveObject.label.position):defaultBasicDirection,true)
				rectComponent.mathJaxLabel.updateValue(saveObject.label.value,true)
			}
		}
		rectComponent.placeFinish()
		rectComponent.updateTheme()
		return rectComponent
	}

	public toTikzString(): string {
		let fillStr:string[] = []
		if (this.fillInfo.opacity>0) {
			if (this.fillInfo.color!=="default") {
				let c = new SVG.Color(this.fillInfo.color)
				fillStr.push(`fill={rgb,255:red,${c.r.toFixed(0)};green,${c.g.toFixed(0)};blue,${c.b.toFixed(0)}}`)
			}

			if (this.fillInfo.opacity!=1) {
				fillStr.push("fill opacity="+this.fillInfo.opacity.toString())
			}
		}

		let strokeStr:string[] = []
		if (this.strokeInfo.opacity>0) {
			if (this.strokeInfo.color!=="default") {
				let c = new SVG.Color(this.strokeInfo.color)
				strokeStr.push(`draw={rgb,255:red,${c.r.toFixed(0)};green,${c.g.toFixed(0)};blue,${c.b.toFixed(0)}}`)
			}else{
				strokeStr.push("draw")
			}

			if (this.strokeInfo.opacity!=1) {
				strokeStr.push("draw opacity="+this.strokeInfo.opacity.toString())
			}

			let width = this.strokeInfo.width.convertToUnit("pt").value
			if (width!=0.4) {
				strokeStr.push("line width="+width+"pt")
			}
		}

		let optionsStr = strokeStr.length>0||fillStr.length>0?`[${fillStr.concat(strokeStr).join(", ")}]`:""
		return `\\path${optionsStr} ${this.firstPoint.toTikzString()} rectangle ${this.secondPoint.toTikzString()};`
	}
	public copyForPlacement(): CircuitComponent {
		return new RectangleComponent()
	}
	public remove(): void {
		for (const [dir,viz] of this.resizeVisualizations) {
			AdjustDragHandler.snapDrag(this, viz, false)
			viz.remove()
		}
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
			textPos = pos.add(bboxHalfSize.mul(basicDirections.find((item)=>item.key==this.positionChoice.value.key).direction))
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
		}else{
			labelRef = basicDirections.find((item)=>item.key==this.anchorChoice.value.key).direction
		}
		
		let ref = labelRef.add(1).div(2).mul(new SVG.Point(labelBBox.w,labelBBox.h)).add(labelRef.mul(labelDist))
		
		// acutally move the label
		let movePos = textPos.sub(ref)
		labelSVG.transform(new SVG.Matrix({translate:[movePos.x,movePos.y]}))
	}

	private updateText(){
		console.log("update");
		
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value
		this.textForeign.move(this.bbox.x+strokeWidth/2,this.bbox.y+strokeWidth/2)
		this.textForeign.size(this.bbox.w-strokeWidth, this.bbox.h-strokeWidth)
		this.textForeign.node.setAttribute("width",(this.bbox.w-strokeWidth).toString())
		this.textForeign.node.setAttribute("height",(this.bbox.h-strokeWidth).toString())
	}
}