/**
 * @module propertyController
 */

import { CanvasController, SelectionController } from "../internal";

export class PropertyController{

	/** @type {PropertyController} */
	static controller;

	#propertiesContainer;
	#objectName;
	#gridProperties
	#basicProperties
	#otherProperties

	constructor(){
		this.#propertiesContainer = document.getElementById("properties-content")
		this.#objectName = document.getElementById("objectName")
		this.#gridProperties = document.getElementById("grid-properties")
		this.#basicProperties = document.getElementById("basic-properties")
		this.#otherProperties = document.getElementById("other-properties")

		PropertyController.controller = this;
	}

	/**
	 * @typedef {Object} FormEntry
	 * @property {object} originalObject
	 * @property {string} propertyName
	 * @property {string} type
	 * @property {any} currentValue
	 * @property {function(ev:Event):void} changeCallback
	 */

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

			let form_entries = []
			let component = components[0]

			this.#setForm(component,form_entries);
		}else{
			this.#objectName.innerText = "Please select only one component to view its properties"
		}
	}

	/**
	 * 
	 * @param {FormEntry[]} formEntries 
	 */
	#setForm(component,formEntries){
		this.#clearForm()
		this.#basicProperties.classList.remove("d-none")

		this.#objectName.innerText = component.symbol.displayName
		
	}
	
	#setFormGrid(){
		this.#clearForm()
		this.#gridProperties.classList.remove("d-none")
		this.#objectName.innerText = "Grid settings"

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
		gridInfo.innerText = "Current grid spacing: " + (majorSizecm/majorSubdivisions).toLocaleString(undefined, {maximumFractionDigits:2}) + " cm"
	}

	#clearForm(){
		this.#gridProperties.classList.add("d-none")
		this.#basicProperties.classList.add("d-none")
		this.#otherProperties.classList.add("d-none")
		
		while (this.#otherProperties.lastChild) {
			this.#otherProperties.removeChild(this.#otherProperties.lastChild)
		}
	}
}