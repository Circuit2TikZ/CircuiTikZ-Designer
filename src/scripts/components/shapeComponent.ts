import * as SVG from "@svgdotjs/svg.js"
import { ChoiceProperty, CircuitComponent, ColorProperty, ComponentSaveObject, DirectionInfo, PositionedLabel, SliderProperty, TextProperty, CanvasController, SectionHeaderProperty, MathJaxProperty, basicDirections, defaultBasicDirection, invalidNameRegEx, MainController, CircuitikzComponent, SnappingInfo, SnapDragHandler, Undo } from "../internal";

export type ShapeSaveObject = ComponentSaveObject & {
	fill?:FillInfo,
	stroke?:StrokeInfo,
	label?:PositionedLabel,
	name?:string
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

export abstract class ShapeComponent extends CircuitComponent{
	protected strokeInfo:StrokeInfo;
	protected fillInfo:FillInfo;

	protected shapeVisualization:SVG.Element;
	protected size:SVG.Point;

	protected selectionElement:SVG.Element=null;
	protected dragElement:SVG.Element
	protected resizeVisualizations:Map<DirectionInfo,SVG.Element>

	public name:TextProperty

	protected fillColorProperty:ColorProperty
	protected fillOpacityProperty:SliderProperty
	protected strokeColorProperty:ColorProperty
	protected strokeOpacityProperty:SliderProperty
	protected strokeWidthProperty:SliderProperty

	protected anchorChoice:ChoiceProperty<DirectionInfo>
	protected positionChoice:ChoiceProperty<DirectionInfo>

	public constructor(){
		super()

		this.visualization = CanvasController.instance.canvas.group()
		this.resizeVisualizations = new Map<DirectionInfo,SVG.Element>()

		this.fillInfo={
			color:"default",
			opacity:0,
		}
		this.strokeInfo={
			color:"default",
			opacity:1,
			width:new SVG.Number("1pt"),
		}

		this.name = new TextProperty("Name","")
		this.name.addChangeListener((ev)=>{
			if (ev.value==="") {
				// no name is always valid
				this.name.changeInvalidStatus("")
				return
			}
			if (ev.value.match(invalidNameRegEx)) {
				// check if characters are valid
				this.name.changeInvalidStatus("Contains forbidden characters!")
				return 
			}
			for (const component of MainController.instance.circuitComponents) {
				// check if another component with the same name already exists
				if ((component instanceof CircuitikzComponent||component instanceof ShapeComponent) && component!=this) {
					if (ev.value!==""&&component.name.value==ev.value) {
						this.name.updateValue(ev.previousValue,false)
						this.name.changeInvalidStatus("Name is already taken!")
						return
					}
				}
			}
			this.name.changeInvalidStatus("")
		})
		this.propertiesHTMLRows.push(this.name.buildHTML())

		//add color property
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Fill").buildHTML())

		this.fillOpacityProperty = new SliderProperty("Opacity",0,100,1,new SVG.Number(this.fillInfo.opacity*100,"%"))
		this.fillOpacityProperty.addChangeListener(ev=>{
			this.fillInfo.opacity = ev.value.value/100
			this.updateTheme()
		})

		this.fillColorProperty  = new ColorProperty("Color",null)
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

			this.labelColor  = new ColorProperty("Color",null)
			this.labelColor.addChangeListener(ev=>{		
				this.updateTheme()
			})
			this.propertiesHTMLRows.push(this.labelColor.buildHTML())
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

		this.shapeVisualization.stroke({
			color:strokeColor,
			opacity:this.strokeInfo.opacity,
			width:this.strokeInfo.opacity==0?0:this.strokeInfo.width.convertToUnit("px").value,
		})
		this.shapeVisualization.fill({
			color:fillColor,
			opacity:this.fillInfo.opacity,
		})

		let labelColor = "var(--bs-emphasis-color)"
		if (this.labelColor.value) {
			labelColor = this.labelColor.value.toString()
		}
		
		this.labelRendering?.fill(labelColor)
	}

	
	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints:this.snappingPoints,
			additionalSnappingPoints:[],
		}
	}

	public draggable(drag: boolean): void {
		if (drag) {
			this.dragElement.node.classList.add("draggable")
		} else {
			this.dragElement.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this,drag,this.dragElement)
	}
}