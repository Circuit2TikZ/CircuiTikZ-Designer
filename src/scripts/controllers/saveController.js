/**
 * @module saveController
 */

import { Modal, Tooltip } from "bootstrap";

/**
 * Controller for saving and loading the progress in json format
 * @class
 */
export default class SaveController {
	/**
	 * Static variable holding the instance.
	 * @type {SaveController}
	 */
	static controller;

	/** @type {HTMLDivElement}  */
	#modalElement;
	/** @type {Modal} */
	#loadModal;

	/** @type {HTMLInputElement} */
	#loadInput;
	/** @type {HTMLSpanElement} */
	#loadMessage

	/** @type {HTMLButtonElement} */
	#loadButton

	constructor(mainController) {
		this.#loadModal = new Modal(document.getElementById("loadModal"))
		this.#loadInput = document.getElementById("file-input")
		this.#loadMessage = document.getElementById("load-message")
		this.#loadButton = document.getElementById("loadJSONButton")
		
	}

	save(){

	}

	load(){

		//open modal for file selection
		this.#loadModal.show()

		this.#loadInput.addEventListener("change",(ev)=>{
			console.log(this.#loadInput.value);
			
			this.#loadMessage.textContent = this.#loadInput.value.split("\\").pop()
			console.log(this.#loadInput.files[0].text());
		})


		//delete current state

		//iterate

	}
}