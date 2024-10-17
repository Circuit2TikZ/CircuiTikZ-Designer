/**
 * @module exportController
 */
import * as SVG from "@svgdotjs/svg.js";
import { Modal, Tooltip } from "bootstrap";
import { SelectionController, MainController, CircuitikzComponent, CanvasController } from "../internal";
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

	private modalElement: HTMLDivElement;
	private modal: Modal;
	private heading: HTMLHeadingElement;
	private exportedContent: HTMLTextAreaElement;
	private fileBasename: HTMLInputElement;
	private fileExtension: HTMLInputElement;
	private fileExtensionDropdown: HTMLUListElement;
	private copyButton: HTMLDivElement;
	private saveButton: HTMLButtonElement;

	private copyTooltip: Tooltip;

	private defaultDisplay: string

	// TODO make this resilient to existing IDs
	private _exportID: number = 0;
	public get exportID(): number {
		this._exportID++
		return this._exportID;
	}

	/**
	 * Init the ExportController
	 */
	private constructor() {
		this.modalElement = document.getElementById("exportModal") as HTMLDivElement;
		this.modal = new Modal(this.modalElement);
		this.heading = document.getElementById("exportModalLabel") as HTMLHeadingElement;
		this.exportedContent = document.getElementById("exportedContent") as HTMLTextAreaElement;
		this.fileBasename = document.getElementById("exportModalFileBasename") as HTMLInputElement;
		this.fileExtension = document.getElementById("exportModalFileExtension") as HTMLInputElement;
		this.fileExtensionDropdown = document.getElementById("exportModalFileExtensionDropdown") as HTMLUListElement;
		this.copyButton = document.getElementById("copyExportedContent") as HTMLDivElement;
		this.saveButton = document.getElementById("exportModalSave") as HTMLButtonElement;

		
		this.defaultDisplay = this.exportedContent.parentElement.style.display;

		let copyButtonDefaultTooltipText = "Copy to clipboard!"
		this.copyButton.addEventListener("hidden.bs.tooltip",(evt)=>{
			this.copyButton.setAttribute("data-bs-title",copyButtonDefaultTooltipText);
			this.copyTooltip.dispose();
			this.copyTooltip = new Tooltip(this.copyButton);
		})
		this.copyButton.setAttribute("data-bs-toggle","tooltip");
		this.copyButton.setAttribute("data-bs-title",copyButtonDefaultTooltipText);
		this.copyTooltip = new Tooltip(this.copyButton);
	}

	exportJSON(text:string){
		this.heading.textContent = "Save JSON"
		// don't show json content. Should this stay like this or can we just show the json?
		// this.#exportedContent.parentElement.style.display = "none";
		// create extension select list
		const extensions = [".json", ".txt"];

		this.exportedContent.rows = Math.max(text.split("\n").length,2);
		this.exportedContent.value = text;

		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the CitcuiTikZ code.
	 */
	exportCircuiTikZ() {
		this.heading.innerHTML = "Export CircuiTi<i>k</i>Z code"
		this.exportedContent.parentElement.style.display = this.defaultDisplay;
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
			this.exportedContent.rows = arr.length;
			this.exportedContent.value = arr.join("\n");
		}
		this._exportID=0
		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the SVG code.
	 */
	exportSVG() {
		this.heading.textContent = "Export SVG"
		this.exportedContent.parentElement.style.display = this.defaultDisplay;
		// prepare selection and bounding box
		SelectionController.instance.selectAll()
		SelectionController.instance.deactivateSelection()
		
		let colorTheme = MainController.instance.darkMode;
		MainController.instance.darkMode = false;
		MainController.instance.updateTheme()
		
		//Get the canvas
		let svgObj = CanvasController.instance.canvas.clone(true,false)//document.getElementById("canvas").cloneNode(true) as SVGSVGElement		
		
		svgObj.node.removeAttribute("xmlns:svgjs")
		svgObj.node.removeAttribute("class")
		svgObj.node.removeAttribute("id")
		//remove not needed parts
		let defs: HTMLElement = svgObj.node.children[0] as HTMLElement
		defs.removeChild(svgObj.node.getElementById("smallGridPattern"))
		defs.removeChild(svgObj.node.getElementById("gridPattern"))
		defs.removeChild(svgObj.node.getElementById("snapCursor"))
		defs.removeChild(svgObj.node.getElementById("snapPoint"))
		// svgObj.node.removeChild(svgObj.node.children[0]) // defs for grid and axis
		svgObj.node.removeChild(svgObj.node.getElementById("grid"))
		svgObj.node.removeChild(svgObj.node.getElementById("xAxis"))
		svgObj.node.removeChild(svgObj.node.getElementById("yAxis"))
		svgObj.node.removeChild(svgObj.node.getElementById("selectionRectangle"))

		svgObj.node.removeChild(svgObj.node.getElementById("snapCursorUse"))
		
		// delete path points for moving paths around
		for (const element of svgObj.node.querySelectorAll(".draggable.pathPoint")) {
			element.remove()
		}

		// delete path points for moving paths around
		for (const element of svgObj.node.querySelectorAll("use")) {
			element.removeAttribute("class")
		}

		for (const elementGroup of svgObj.find("g") as SVG.List<SVG.G>) {
			if (elementGroup.node.getAttribute("stroke")=="currentColor") {
				elementGroup.node.removeAttribute("stroke")
			}
			if (elementGroup.node.getAttribute("fill")=="currentColor") {
				elementGroup.node.removeAttribute("fill")
			}
		}
		
		// change bounding box to include all elements
		let bbox = svgObj.bbox()
		if (bbox){
			//make bbox 1px larger in every direction to not cut of tiny bits of some objects
			bbox.x-=1
			bbox.y-=1
			bbox.width+=2
			bbox.height+=2
			svgObj.viewbox(bbox)
		}
		
		// get all used node/symbol names
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
		tempDiv.appendChild(svgObj.node);
		let textContent = pretty(tempDiv.innerHTML, {ocd: true});
		
		this.exportedContent.rows = textContent.split("\n").length
		this.exportedContent.value = textContent;
		const extensions = [".svg", ".txt"];
		MainController.instance.darkMode = colorTheme;
		MainController.instance.updateTheme()
		this.export(extensions)
		SelectionController.instance.activateSelection()
	}

	private export(extensions:string[]){

		// copy text and adjust tooltip for feedback
		const copyText = () => {
			navigator.clipboard.writeText(this.exportedContent.value)
			.then(()=>{
				this.copyButton.setAttribute("data-bs-title","Copied!");
				this.copyTooltip.dispose();
				this.copyTooltip = new Tooltip(this.copyButton);
				this.copyTooltip.show()
			});
		}
		// create listeners
		const saveFile = (() => {
			FileSaver.saveAs(
				new Blob([this.exportedContent.value], { type: "text/x-tex;charset=utf-8" }),
				(this.fileBasename.value.trim() || "Circuit") + this.fileExtension.value
			);
		}).bind(this);
		const hideListener = (() => {
			this.exportedContent.value = ""; // free memory
			this.copyButton.removeEventListener("click", copyText);
			this.saveButton.removeEventListener("click", saveFile);
			this.fileExtensionDropdown.replaceChildren();
			// "once" is not always supported:
			this.modalElement.removeEventListener("hidden.bs.modal", hideListener);
		}).bind(this);

		this.modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		});

		// create extension select list
		this.fileExtension.value = extensions[0];
		this.fileExtensionDropdown.replaceChildren(
			...extensions.map((ext) => {
				const link = document.createElement("a");
				link.textContent = ext;
				link.classList.add("dropdown-item");
				link.addEventListener("click", () => (this.fileExtension.value = ext), {
					passive: true,
				});
				const listElement = document.createElement("li");
				listElement.appendChild(link);
				return listElement;
			})
		);

		// add listeners & show modal
		this.copyButton.addEventListener("click", copyText, { passive: true });
		this.saveButton.addEventListener("click", saveFile, { passive: true });

		this.modal.show();
	}
}
