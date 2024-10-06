/**
 * @module propertyController
 */

import { CanvasController, MainController, NodeComponentInstance, SelectionController, Undo } from "../internal";

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

	#propertiesContainer;
	#objectName;
	#gridProperties
	#propertiesEntries
	#propertiesTitle

	private constructor(){
		this.#propertiesContainer = document.getElementById("properties-content")
		this.#objectName = document.getElementById("objectName")
		this.#gridProperties = document.getElementById("grid-properties")
		this.#propertiesEntries = document.getElementById("propertiesEntries")
		this.#propertiesTitle = document.getElementById("propertiesTitle")
	}

	update(){
		
		let components = SelectionController.instance.currentlySelectedComponents
		let lines = SelectionController.instance.currentlySelectedLines
		this.#clearForm()

		if (components.length+lines.length>1) {
			this.#objectName.classList.remove("d-none")
			this.#objectName.innerText = "Please select only one component to view its properties"
		}else if (components.length+lines.length===0) {
			this.#setFormGrid()
		}else{
			if (components.length===1) {
				let component = components[0]
				this.#setForm(component,component.getFormEntries());
			} else {
				//show line
				let component = lines[0]	
				this.#setLineForm(component);
			}
		}
	}

	#setLineForm(line){
		this.#propertiesEntries.classList.remove("d-none")
		this.#objectName.classList.remove("d-none")
		this.#objectName.innerText = "Wire"

		let zorderControls = document.getElementById("zorder-controls").cloneNode(true)
		zorderControls.firstElementChild.addEventListener("click",()=>{
			CanvasController.instance.bringComponentToFront(line)
		})
		zorderControls.lastElementChild.addEventListener("click",()=>{
			CanvasController.instance.moveComponentToBack(line)
		})
		this.#propertiesEntries.appendChild(zorderControls)
	}

	/**
	 * 
	 * @param {ComponentInstance||Line} component 
	 * @param {FormEntry[]} formEntries 
	 */
	#setForm(component,formEntries){
		this.#propertiesEntries.classList.remove("d-none")
		this.#objectName.classList.remove("d-none")

		this.#objectName.innerText = component.symbol.displayName
		
		const formMap = {
			"string":{
				id:"blueprintText",
				canInvalid:true,
				value:"value"
			},
			"boolean":{
				id:"blueprintCheck",
				canInvalid:false,
				value:"checked"
			},
			"mathJax":{
				id:"blueprintMathJax",
				value:"value"
			}
		}

		/**@type {Element} */
		let tikzIDNode = document.getElementById("blueprintInfo").cloneNode(true)
		tikzIDNode.firstElementChild.innerHTML = "ID"
		tikzIDNode.lastElementChild.innerHTML = component.symbol.tikzName
		this.#propertiesEntries.appendChild(tikzIDNode)

		let tikzOptions = Array.from(component.symbol._tikzOptions.keys()).join(", ")
		if (tikzOptions) {
			let tikzOptionsNode = document.getElementById("blueprintInfo").cloneNode(true)
			tikzOptionsNode.firstElementChild.innerHTML = "Options"
			tikzOptionsNode.lastElementChild.innerHTML = tikzOptions
			this.#propertiesEntries.appendChild(tikzOptionsNode)
		}

		let zorderControls = document.getElementById("zorder-controls").cloneNode(true)
		zorderControls.firstElementChild.addEventListener("click",()=>{
			CanvasController.instance.bringComponentToFront(component)
		})
		zorderControls.lastElementChild.addEventListener("click",()=>{
			CanvasController.instance.moveComponentToBack(component)
		})
		this.#propertiesEntries.appendChild(zorderControls)

		for (const formEntry of formEntries) {
			let formSettings = formMap[formEntry.inputType]

			let entryBlueprint = document.getElementById(formSettings.id)
			let entryNode = entryBlueprint.cloneNode(true)

			let label = entryNode.querySelector("span");
			label.innerText = formEntry.propertyName

			let input = entryNode.querySelector("input");
			let invalidDiv = entryNode.querySelector(".invalid-feedback");
			
			// check if the name changed and if so, add an undo state
			let oldValue;
			let newValue;

			let changeValidStatus = (msg) =>{
				if (invalidDiv) {
					if (msg==="") {
						newValue = input[formSettings.value]
						invalidDiv.classList.add("d-none")
						input.classList.remove("is-invalid")
					}else{
						invalidDiv.classList.remove("d-none")
						invalidDiv.innerText = "Invalid! " + msg
						input.classList.add("is-invalid")
					}
				}
			}

			switch (formEntry.inputType) {
				case "string":
				
					input.addEventListener("focusin",(ev)=>{
						oldValue = input[formSettings.value]
					})
		
					input[formSettings.value] = formEntry.currentValue
					input.addEventListener("input",(ev)=>{
						formEntry.changeCallback(input[formSettings.value],changeValidStatus)
					})
	
					input.addEventListener("focusout",(ev)=>{
						if (oldValue!==undefined&&newValue!==undefined&&oldValue!==newValue) {
							Undo.addState()					
						}
					})
					break;
				case "boolean":
					input[formSettings.value] = formEntry.currentValue
					input.addEventListener("input",(ev)=>{
						formEntry.changeCallback(input[formSettings.value])					
					})
					break;
				case "mathJax":
					input.value = formEntry.currentValue
					const submitButton = (entryNode as Element).querySelector("button");
					const rerender = ()=>{
						formEntry.changeCallback(input.value,submitButton,changeValidStatus)
					}
					submitButton.addEventListener("click",(ev)=>{
						rerender()
					})
					
					if (component instanceof NodeComponentInstance) {
						let anchorDiv = document.createElement("div")
						anchorDiv.classList.add("d-flex","flex-row","justify-content-between","w-100","gap-3","mt-2")
						anchorDiv.innerHTML = "<div class=\"fs-6 align-self-center\">Text position</div>\
							<select class=\"form-select w-50\" name=\"anchor\" id=\"labelAnchor\">\
								<option value=\"default\" selected>default</option>\
								<option value=\"center\">center</option>\
								<option value=\"north\">north</option>\
								<option value=\"south\">south</option>\
								<option value=\"east\">east</option>\
								<option value=\"west\">west</option>\
								<option value=\"north east\">north east</option>\
								<option value=\"north west\">north west</option>\
								<option value=\"south east\">south east</option>\
								<option value=\"south west\">south west</option>\
							</select>"
						entryNode.appendChild(anchorDiv)
						
						let labelAnchorSelect = (entryNode as Element).querySelector("select") as HTMLSelectElement
						labelAnchorSelect.addEventListener("change", (ev)=>{
							component.labelAnchor = labelAnchorSelect.value
							component.updateLabelPosition()
						})
					}
					
					input.addEventListener("keydown",(/** @type {KeyboardEvent}*/ev)=>{						
						if (ev.key==="Enter"&&!submitButton.disabled) {
							rerender()	
						}
					})
					break;
				default:
					break;
			}
			
			this.#propertiesEntries.appendChild(entryNode)
		}
		
	}
	
	#setFormGrid(){
		this.#gridProperties.classList.remove("d-none")
		this.#propertiesTitle.innerText = "Grid settings"

		let minorSlider = document.getElementById("minorSliderInput")
		minorSlider.value = CanvasController.instance.majorGridSubdivisions

		let majorSlider = document.getElementById("majorSliderInput")
		majorSlider.value = CanvasController.instance.majorGridSizecm

		minorSlider.addEventListener('input',(ev)=>{
			this.#changeGrid(CanvasController.instance.majorGridSizecm, Number.parseFloat(minorSlider.value))
		})

		majorSlider.addEventListener('input',(ev)=>{
			this.#changeGrid(Number.parseFloat(majorSlider.value), CanvasController.instance.majorGridSubdivisions)
		})

		this.#changeGrid(CanvasController.instance.majorGridSizecm, CanvasController.instance.majorGridSubdivisions)		
	}

	#changeGrid(majorSizecm, majorSubdivisions){
		CanvasController.instance.changeGrid(majorSizecm, majorSubdivisions)

		let majorLabel = document.getElementById("majorLabel")
		majorLabel.innerText = majorSizecm+" cm"

		let minorLabel = document.getElementById("minorLabel")		
		minorLabel.innerText = majorSubdivisions

		let gridInfo = document.getElementById("gridInfo")		
		gridInfo.innerText = (majorSizecm/majorSubdivisions).toLocaleString(undefined, {maximumFractionDigits:2}) + " cm"
	}

	#clearForm(){
		this.#propertiesTitle.innerText = "Properties"
		this.#gridProperties.classList.add("d-none")
		this.#propertiesEntries.classList.add("d-none")
		this.#objectName.classList.add("d-none")

		while (this.#propertiesEntries.lastElementChild) {
			this.#propertiesEntries.removeChild(this.#propertiesEntries.lastElementChild)
		}
	}
}