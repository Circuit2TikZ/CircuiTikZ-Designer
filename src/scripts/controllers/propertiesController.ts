import { AlignmentMode, ButtonGridProperty, CanvasController, CircuitComponent, SelectionController } from "../internal";

export type FormEntry = {
	originalObject: object;
	propertyName: string;
	inputType: string;
	currentValue: any;
}

export class PropertyController{
	private static _instance: PropertyController;
	public static get instance(): PropertyController {
		if (!PropertyController._instance) {
			PropertyController._instance = new PropertyController()
		}
		return PropertyController._instance;
	}

	private gridProperties: HTMLDivElement
	private propertiesEntries: HTMLDivElement
	private propertiesTitle: HTMLElement

	private constructor(){
		this.propertiesTitle = document.getElementById("propertiesTitle") as HTMLElement
		this.gridProperties = document.getElementById("grid-properties") as HTMLDivElement
		this.propertiesEntries = document.getElementById("propertiesEntries") as HTMLDivElement
	}

	update(){
		let components = SelectionController.instance.currentlySelectedComponents
		this.clearForm()

		if (components.length>1) {
			this.setMultiForm(components)
		}else if (components.length===1) {
			this.setForm(components[0]);
		}else{
			this.setFormGrid()
		}
	}

	private setMultiForm(components:CircuitComponent[]){
		//TODO multicomponent edit
		//TODO alignment and distribution tools

		this.propertiesEntries.classList.remove("d-none")
		this.propertiesTitle.innerText = "Selection"

		let rows:HTMLElement[]=[]
		let positioning = new ButtonGridProperty(2,[["Rotate CW","rotate_right"],["Rotate CCW","rotate_left"],["Flip X",["flip","rotateText"]],["Flip Y","flip"]],[
			(ev)=>SelectionController.instance.rotateSelection(-90),
			(ev)=>SelectionController.instance.rotateSelection(90),
			(ev)=>SelectionController.instance.flipSelection(true),
			(ev)=>SelectionController.instance.flipSelection(false)
		])
		rows.push(positioning.buildHTML())

		let ordering = new ButtonGridProperty(2,[["To Foreground",""],["To Background",""],["Move Forward",""],["Move Backward",""]],[
			(ev)=>CanvasController.instance.componentsToForeground(SelectionController.instance.currentlySelectedComponents),
			(ev)=>CanvasController.instance.componentsToBackground(SelectionController.instance.currentlySelectedComponents),
			(ev)=>CanvasController.instance.moveComponentsForward(SelectionController.instance.currentlySelectedComponents),
			(ev)=>CanvasController.instance.moveComponentsBackward(SelectionController.instance.currentlySelectedComponents)
		])
		rows.push(ordering.buildHTML())

		let alignment = new ButtonGridProperty(2,[["Align left",""],["Align right",""]],[
			(ev)=>SelectionController.instance.alignSelection(AlignmentMode.START,true),
			(ev)=>SelectionController.instance.alignSelection(AlignmentMode.END,true),
		])
		rows.push(alignment.buildHTML())

		this.propertiesEntries.append(...rows)
	}

	private setForm(component:CircuitComponent){		
		this.propertiesEntries.classList.remove("d-none")
		this.propertiesTitle.innerText = component.displayName
		this.propertiesEntries.append(...component.propertiesHTMLRows)
	}
	
	private setFormGrid(){
		this.gridProperties.classList.remove("d-none")
		this.propertiesTitle.innerText = "Grid settings"

		let minorSlider = document.getElementById("minorSliderInput") as HTMLInputElement
		minorSlider.value = CanvasController.instance.majorGridSubdivisions.toString()

		let majorSlider = document.getElementById("majorSliderInput") as HTMLInputElement
		majorSlider.value = CanvasController.instance.majorGridSizecm.toString()

		minorSlider.addEventListener('input',(ev)=>{
			this.changeGrid(CanvasController.instance.majorGridSizecm, Number.parseFloat(minorSlider.value))
		})

		majorSlider.addEventListener('input',(ev)=>{
			this.changeGrid(Number.parseFloat(majorSlider.value), CanvasController.instance.majorGridSubdivisions)
		})

		this.changeGrid(CanvasController.instance.majorGridSizecm, CanvasController.instance.majorGridSubdivisions)		
	}

	private changeGrid(majorSizecm: number, majorSubdivisions: number){
		CanvasController.instance.changeGrid(majorSizecm, majorSubdivisions)

		let majorLabel = document.getElementById("majorLabel")
		majorLabel.innerText = majorSizecm+" cm"

		let minorLabel = document.getElementById("minorLabel")		
		minorLabel.innerText = majorSubdivisions.toString()

		let gridInfo = document.getElementById("gridInfo")		
		gridInfo.innerText = (majorSizecm/majorSubdivisions).toLocaleString(undefined, {maximumFractionDigits:2}) + " cm"
	}

	private clearForm(){
		this.propertiesTitle.innerText = "Properties"
		this.gridProperties.classList.add("d-none")
		this.propertiesEntries.classList.add("d-none")
		this.propertiesEntries.innerText=""


		while (this.propertiesEntries.lastElementChild) {
			this.propertiesEntries.removeChild(this.propertiesEntries.lastElementChild)
		}
	}
}