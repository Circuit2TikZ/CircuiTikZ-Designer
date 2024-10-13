/**
 * @module propertyController
 */

import { CanvasController, CircuitComponent, SelectionController } from "../internal";

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
			//TODO multicomponent edit
			//TODO alignment and distribution tools
			//TODO flip,rotate selection
			this.propertiesEntries.classList.remove("d-none")
			this.propertiesEntries.innerText = "Please select only one component to view its properties"
		}else if (components.length===1) {
			this.setForm(components[0]);
		}else{
			this.setFormGrid()
		}
	}

	private setForm(component:CircuitComponent){		
		this.propertiesEntries.classList.remove("d-none")
		this.propertiesTitle.innerText = component.displayName
		
		for (const property of component.editableProperties) {
			property.buildHTML(this.propertiesEntries)
		}
					
		// if (component instanceof NodeComponentInstance) {
		// 	let anchorDiv = document.createElement("div")
		// 	anchorDiv.classList.add("d-flex","flex-row","justify-content-between","w-100","gap-3","mt-2")
		// 	anchorDiv.innerHTML = "<div class=\"fs-6 align-self-center\">Text position</div>\
		// 		<select class=\"form-select w-50\" name=\"anchor\" id=\"labelAnchor\">\
		// 			<option value=\"default\" selected>default</option>\
		// 			<option value=\"center\">center</option>\
		// 			<option value=\"north\">north</option>\
		// 			<option value=\"south\">south</option>\
		// 			<option value=\"east\">east</option>\
		// 			<option value=\"west\">west</option>\
		// 			<option value=\"north east\">north east</option>\
		// 			<option value=\"north west\">north west</option>\
		// 			<option value=\"south east\">south east</option>\
		// 			<option value=\"south west\">south west</option>\
		// 		</select>"
		// 	entryNode.appendChild(anchorDiv)
			
		// 	let labelAnchorSelect = (entryNode as Element).querySelector("select") as HTMLSelectElement
		// 	labelAnchorSelect.addEventListener("change", (ev)=>{
		// 		component.labelAnchor = labelAnchorSelect.value
		// 		component.updateLabelPosition()
		// 	})
		// }		
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