/**
 * @module exportController
 */

import { Modal, Tooltip } from "bootstrap";
import { SelectionController, MainController, CanvasController, NodeComponentInstance, PathComponentInstance, Line, CircuitikzComponent, CircuitComponent } from "../internal";
import FileSaver from "file-saver";
import pretty = require('pretty');

/**
 * Contains export functions and controls the "exportModal" (~dialog).
 * @class
 */
export class ExportController {
	private static _instance: ExportController;
	public static get instance(): ExportController {
		if (!ExportController._instance) {
			ExportController._instance = new ExportController()
		}
		return ExportController._instance;
	}

	#modalElement: HTMLDivElement;
	#modal: Modal;
	#heading: HTMLHeadingElement;
	#exportedContent: HTMLTextAreaElement;
	#fileBasename: HTMLInputElement;
	#fileExtension: HTMLInputElement;
	#fileExtensionDropdown: HTMLUListElement;
	#copyButton: HTMLDivElement;
	#saveButton: HTMLButtonElement;

	#copyTooltip: Tooltip;

	#defaultDisplay: string

	/**
	 * Init the ExportController
	 */
	private constructor() {
		this.#modalElement = document.getElementById("exportModal") as HTMLDivElement;
		this.#modal = new Modal(this.#modalElement);
		this.#heading = document.getElementById("exportModalLabel") as HTMLHeadingElement;
		this.#exportedContent = document.getElementById("exportedContent") as HTMLTextAreaElement;
		this.#fileBasename = document.getElementById("exportModalFileBasename") as HTMLInputElement;
		this.#fileExtension = document.getElementById("exportModalFileExtension") as HTMLInputElement;
		this.#fileExtensionDropdown = document.getElementById("exportModalFileExtensionDropdown") as HTMLUListElement;
		this.#copyButton = document.getElementById("copyExportedContent") as HTMLDivElement;
		this.#saveButton = document.getElementById("exportModalSave") as HTMLButtonElement;

		
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
		this.#heading.innerHTML = "Export CircuiTi<i>k</i>Z code"
		this.#exportedContent.parentElement.style.display = this.#defaultDisplay;
		// create extension select list
		const extensions = [".tikz", ".tex", ".pgf"];

		// actually export/create the string
		{
			let circuitElements = []
			for (const circuitElement of MainController.instance.circuitComponents) {
				circuitElements.push("\t"+circuitElement.toTikzString())
			}
			
			const arr = [
				"\\begin{tikzpicture}",
				"\t% Paths, nodes and wires:",
				...circuitElements,
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
		SelectionController.instance.selectAll()
		let bbox = SelectionController.instance.getOverallBoundingBox()
		SelectionController.instance.deactivateSelection()

		let colorTheme = MainController.instance.darkMode;
		MainController.instance.darkMode = false;
		MainController.instance.updateTheme()

		//Get the canvas
		let svgObj = document.getElementById("canvas").cloneNode(true) as SVGSVGElement
		svgObj.removeAttribute("xmlns:svgjs")
		svgObj.removeAttribute("class")
		svgObj.removeAttribute("id")

		// change bounding box to include all elements
		if (bbox){
			svgObj.setAttribute("viewBox", bbox.toString())
		}
		
		//remove not needed parts
		/**@type {HTMLElement} */
		let defs: HTMLElement = svgObj.children[0] as HTMLElement
		defs.innerHTML = '';
		// svgObj.removeChild(svgObj.children[0]) // defs for grid and axis
		svgObj.removeChild(svgObj.getElementById("grid"))
		svgObj.removeChild(svgObj.getElementById("xAxis"))
		svgObj.removeChild(svgObj.getElementById("yAxis"))
		svgObj.removeChild(svgObj.getElementById("selectionRectangle"))

		svgObj.removeChild(svgObj.getElementById("snapCursorUse"))

		// delete path points for moving paths around
		for (const element of svgObj.querySelectorAll(".draggable.pathPoint")) {
			element.remove()
		}

		// delete path points for moving paths around
		for (const element of svgObj.querySelectorAll("use")) {
			element.removeAttribute("class")
		}
		
		// get all used node/symbol names
		let symbolDB = document.getElementById("symbolDB")
		let usedSymbols = []
		for (const instance of MainController.instance.circuitComponents) {
			if (instance instanceof CircuitikzComponent) {
				let symbol = instance.referenceSymbol.node
				usedSymbols.push(document.getElementById(symbol.id))
			}
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
		MainController.instance.darkMode = colorTheme;
		MainController.instance.updateTheme()
		this.#export(extensions)
		SelectionController.instance.activateSelection()
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
