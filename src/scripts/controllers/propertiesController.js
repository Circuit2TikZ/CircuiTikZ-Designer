/**
 * @module propertyController
 */

import { CanvasController, MainController, SelectionController, Undo } from "../internal";

/**
 * @typedef {Object} FormEntry
 * @property {object} originalObject
 * @property {string} propertyName
 * @property {string} inputType
 * @property {any} currentValue
 * @property {function(newValue:any):string} changeCallback
 */

export class PropertyController{

	/** @type {PropertyController} */
	static controller;

	#propertiesContainer;
	#objectName;
	#gridProperties
	#basicProperties
	#otherProperties
	#propertiesTitle

	constructor(){
		this.#propertiesContainer = document.getElementById("properties-content")
		this.#objectName = document.getElementById("objectName")
		this.#gridProperties = document.getElementById("grid-properties")
		this.#basicProperties = document.getElementById("basic-properties")
		this.#otherProperties = document.getElementById("other-properties")
		this.#propertiesTitle = document.getElementById("propertiesTitle")

		PropertyController.controller = this;
	}

	update(){
		
		let components = SelectionController.controller.currentlySelectedComponents
		let lines = SelectionController.controller.currentlySelectedLines
		this.#clearForm()

		if (components.length==0) {
			if (lines.length==0) {
				// nothing selected, show grid properties
				this.#setFormGrid()
			}
		}else if(components.length==1){

			let component = components[0]			

			this.#setForm(component,component.getFormEntries());
		}else{
			this.#objectName.innerText = "Please select only one component to view its properties"
		}
	}

	/**
	 * 
	 * @param {FormEntry[]} formEntries 
	 */
	#setForm(component,formEntries){
		this.#basicProperties.classList.remove("d-none")
		this.#objectName.classList.remove("d-none")

		this.#objectName.innerText = component.symbol.displayName

		let entryBlueprint = this.#basicProperties.querySelector("#basicBlueprint")
		
		for (const formEntry of formEntries) {
			let entryNode = entryBlueprint.cloneNode(true)
			entryNode.classList.remove("d-none")
			let label = entryNode.querySelector("span");
			let input = entryNode.querySelector("input");
			let invalidDiv = entryNode.querySelector("div");

			// check if the name changed and if so, add an undo state
			let oldValue;
			input.addEventListener("focusin",(ev)=>{
				oldValue = input.value
			})

			let newValue;
			input.value = formEntry.currentValue
			input.addEventListener("input",(ev)=>{
				let invalidReason = formEntry.changeCallback(input.value)
				if (invalidReason==="") {
					newValue = input.value
					invalidDiv.classList.add("d-none")
					input.classList.remove("is-invalid")
				}else{
					invalidDiv.classList.remove("d-none")
					invalidDiv.innerText = "Invalid! " + invalidReason
					input.classList.add("is-invalid")
				}
			})

			input.addEventListener("focusout",(ev)=>{
				if (oldValue!==undefined&&newValue!==undefined&&oldValue!==newValue) {
					Undo.addState()					
				}
			})


			label.innerText = formEntry.propertyName
			input.setAttribute("type",formEntry.inputType)		
			
			this.#basicProperties.appendChild(entryNode)
		}
		
	}
	
	#setFormGrid(){
		this.#gridProperties.classList.remove("d-none")
		this.#propertiesTitle.innerText = "Grid settings"

		let minorSlider = document.getElementById("minorSliderInput")
		minorSlider.value = CanvasController.controller.majorGridSubdivisions

		let majorSlider = document.getElementById("majorSliderInput")
		majorSlider.value = CanvasController.controller.majorGridSizecm

		minorSlider.addEventListener('input',(ev)=>{
			this.#changeGrid(CanvasController.controller.majorGridSizecm, Number.parseFloat(minorSlider.value))
		})

		majorSlider.addEventListener('input',(ev)=>{
			this.#changeGrid(Number.parseFloat(majorSlider.value), CanvasController.controller.majorGridSubdivisions)
		})

		this.#changeGrid(CanvasController.controller.majorGridSizecm, CanvasController.controller.majorGridSubdivisions)		
	}

	#changeGrid(majorSizecm, majorSubdivisions){
		CanvasController.controller.changeGrid(majorSizecm, majorSubdivisions)

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
		this.#basicProperties.classList.add("d-none")
		this.#otherProperties.classList.add("d-none")
		this.#objectName.classList.add("d-none")
		
		while (this.#otherProperties.lastChild) {
			this.#otherProperties.removeChild(this.#otherProperties.lastChild)
		}

		while (this.#basicProperties.children.length>1) {
			this.#basicProperties.removeChild(this.#basicProperties.lastChild)
		}
	}
}