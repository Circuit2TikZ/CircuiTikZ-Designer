/**
 * @module exportController
 */

import { Modal, Tooltip } from "bootstrap";
import { FileSaver, SelectionController, MainController } from "../internal";
var pretty = require('pretty');

/**
 * Contains export functions and controls the "exportModal" (~dialog).
 * @class
 */
export class ExportController {
	/** @type {MainController} */
	#mainController;
	/** @type {HTMLDivElement}  */
	#modalElement;
	/** @type {Modal} */
	#modal;
	/** @type {HTMLHeadingElement} */
	#heading;
	/** @type {HTMLTextAreaElement} */
	#exportedContent;
	/** @type {HTMLInputElement} */
	#fileBasename;
	/** @type {HTMLInputElement} */
	#fileExtension;
	/** @type {HTMLUListElement} */
	#fileExtensionDropdown;
	/** @type {HTMLDivElement} */
	#copyButton;
	/** @type {HTMLButtonElement} */
	#saveButton;

	#copyTooltip;

	#defaultDisplay

	/**
	 * Init the ExportController
	 * @param {MainController} mainController - needed for exporting instances & lines
	 */
	constructor(mainController) {
		this.#mainController = mainController;
		this.#modalElement = document.getElementById("exportModal");
		this.#modal = new Modal(this.#modalElement);
		this.#heading = document.getElementById("exportModalLabel");
		this.#exportedContent = document.getElementById("exportedContent");
		this.#fileBasename = document.getElementById("exportModalFileBasename");
		this.#fileExtension = document.getElementById("exportModalFileExtension");
		this.#fileExtensionDropdown = document.getElementById("exportModalFileExtensionDropdown");
		this.#copyButton = document.getElementById("copyExportedContent");
		this.#saveButton = document.getElementById("exportModalSave");

		
		this.#defaultDisplay = this.#exportedContent.parentElement.style.display;

		let copyButtonDefaultTooltipText = "Copy to clipboard!"
		this.#copyButton.addEventListener("hidden.bs.tooltip",(evt)=>{
			this.#copyButton.setAttribute("data-bs-title",copyButtonDefaultTooltipText);
			this.#copyTooltip.dispose();
			this.#copyTooltip = new Tooltip(this.#copyButton);
		})
		this.#copyButton.setAttribute("data-bs-toggle","tooltip");
		this.#copyButton.setAttribute("data-bs-title",copyButtonDefaultTooltipText);
		this.#copyTooltip = new Tooltip(this.#copyButton);
	}

	exportJSON(text){
		this.#heading.textContent = "Save JSON"
		// don't show json content. Should this stay like this or can we just show the json?
		// this.#exportedContent.parentElement.style.display = "none";
		// create extension select list
		const extensions = [".json", ".txt"];

		this.#exportedContent.rows = Math.max(text.split("\n").length,2);
		this.#exportedContent.value = text;

		this.#export(extensions)
	}

	/**
	 * Shows the exportModal with the CitcuiTikZ code.
	 */
	exportCircuiTikZ() {
		this.#heading.textContent = "Export CircuiTikZ code"
		this.#exportedContent.parentElement.style.display = this.#defaultDisplay;
		// create extension select list
		const extensions = [".tikz", ".tex", ".pgf"];

		// actually export/create the string
		{
			const instanceLines = this.#mainController.instances.map((instance) => "\t" + instance.toTikzString());

			const lineLines = this.#mainController.lines.map((instance) => "\t" + instance.toTikzString());

			const arr = [
				"\\begin{tikzpicture}",
				"\t% Instances/Symbols:",
				...instanceLines,
				"",
				"\t% Lines:",
				...lineLines,
				"",
				"\\end{tikzpicture}",
			];
			this.#exportedContent.rows = arr.length;
			this.#exportedContent.value = arr.join("\n");
		}

		this.#export(extensions)
	}

	/**
	 * Shows the exportModal with the SVG code.
	 */
	exportSVG() {
		this.#heading.textContent = "Export SVG"
		this.#exportedContent.parentElement.style.display = this.#defaultDisplay;
		// prepare selection and bounding box
		SelectionController.controller.selectAll()
		let bbox = SelectionController.controller.getOverallBoundingBox()
		SelectionController.controller.deactivateSelection()

		//Get the canvas
		let svgObj = document.getElementById("canvas").cloneNode(true)
		svgObj.removeAttribute("xmlns:svgjs")
		svgObj.removeAttribute("class")
		svgObj.removeAttribute("id")

		// change bounding box to include all elements
		if (bbox){
			svgObj.setAttribute("viewBox", bbox.toString())
		}
		
		//remove not needed parts
		/**@type {HTMLElement} */
		let defs = svgObj.children[0]
		defs.innerHTML = '';
		// svgObj.removeChild(svgObj.children[0]) // defs for grid and axis
		svgObj.removeChild(svgObj.getElementById("grid"))
		svgObj.removeChild(svgObj.getElementById("xAxis"))
		svgObj.removeChild(svgObj.getElementById("yAxis"))
		svgObj.removeChild(svgObj.getElementById("selectionRectangle"))
		svgObj.removeChild(svgObj.getElementById("snapCursor"))
		
		// get all used node/symbol names
		let symbolDB = document.getElementById("symbolDB")
		let usedSymbols = []
		for (const instance of MainController.controller.instances) {
			let symbol = instance.symbol.node
			usedSymbols.push(symbolDB.getElementById(symbol.id))
		}
		// remove duplicates
		usedSymbols = [...new Set(usedSymbols)]
		
		// remove metadata tags
		let optimizedSymbols = []
		for (const symbol of usedSymbols) {
			let s = symbol.cloneNode(true)
			// probably only ever needs to remove one metadata tag
			for (const metadataElement of s.getElementsByTagName("metadata")) {
				s.removeChild(metadataElement)
			}
			// remove selection ellipse
			for (const ellipseElement of s.getElementsByTagName("ellipse")) {
				if (ellipseElement.getAttribute("stroke")=="none"&&ellipseElement.getAttribute("fill")=="transparent") {
					s.removeChild(ellipseElement)
				}
			}
			optimizedSymbols.push(s)
		}

		// add to defs
		for (const element of optimizedSymbols) {
			defs.appendChild(element)
		}

		// convert to text and make pretty
		let tempDiv = document.createElement("div");
		tempDiv.appendChild(svgObj);
		let textContent = pretty(tempDiv.innerHTML, {ocd: true});
		
		this.#exportedContent.rows = textContent.split("\n").length
		this.#exportedContent.value = textContent;
		const extensions = [".svg", ".txt"];
		this.#export(extensions)
		SelectionController.controller.activateSelection()
	}

	#export(extensions){

		// copy text and adjust tooltip for feedback
		const copyText = () => {
			navigator.clipboard.writeText(this.#exportedContent.value)
			.then(()=>{
				this.#copyButton.setAttribute("data-bs-title","Copied!");
				this.#copyTooltip.dispose();
				this.#copyTooltip = new Tooltip(this.#copyButton);
				this.#copyTooltip.show()
			});
		}
		// create listeners
		const saveFile = (() => {
			FileSaver.saveAs(
				new Blob([this.#exportedContent.value], { type: "text/x-tex;charset=utf-8" }),
				(this.#fileBasename.value.trim() || "Circuit") + this.#fileExtension.value
			);
		}).bind(this);
		const hideListener = (() => {
			this.#exportedContent.value = ""; // free memory
			this.#copyButton.removeEventListener("click", copyText);
			this.#saveButton.removeEventListener("click", saveFile);
			this.#fileExtensionDropdown.replaceChildren();
			// "once" is not always supported:
			this.#modalElement.removeEventListener("hidden.bs.modal", hideListener);
		}).bind(this);

		this.#modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		});

		// create extension select list
		this.#fileExtension.value = extensions[0];
		this.#fileExtensionDropdown.replaceChildren(
			...extensions.map((ext) => {
				const link = document.createElement("a");
				link.textContent = ext;
				link.classList.add("dropdown-item");
				link.addEventListener("click", () => (this.#fileExtension.value = ext), {
					passive: true,
				});
				const listElement = document.createElement("li");
				listElement.appendChild(link);
				return listElement;
			})
		);

		// add listeners & show modal
		this.#copyButton.addEventListener("click", copyText, { passive: true });
		this.#saveButton.addEventListener("click", saveFile, { passive: true });

		this.#modal.show();
	}
}
