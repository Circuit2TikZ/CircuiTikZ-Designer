/**
 * @module propertyController
 */

import { MainController, SelectionController } from "../internal";

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
			//TODO
		}
	}

	/**
	 * 
	 * @param {FormEntry[]} formEntries 
	 */
	#setForm(component,formEntries){
		this.#clearForm()

		this.#objectName.innerText = component.symbol.displayName
		
	}
	
	#setFormGrid(){
		this.#clearForm()

		let minorSlider = document.getElementById("minorSliderInput")
		
		// slider.oninput = 
		minorSlider.addEventListener('input',(ev)=>{
			console.log(minorSlider.value)
		})
	}

	#clearForm(){
		
		while (this.#otherProperties.lastChild) {
			this.#otherProperties.removeChild(this.#otherProperties.lastChild)
		}
	}
}