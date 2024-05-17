/**
 * @module exportController
 */

import { Modal, Tooltip } from "bootstrap";
import FileSaver from "file-saver";

/** @typedef {import("./mainController").default} MainController */

/**
 * Contains export functions and controls the "exportModal" (~dialog).
 * @class
 */
export default class ExportController {
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

	/**
	 * Shows the exportModal with the CitcuiTikZ code.
	 */
	exportCircuiTikZ() {
		/** @type {string} */
		let textContent;

		// copy text and adjust tooltip for feedback
		const copyText = () => {
			navigator.clipboard.writeText(textContent)
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
				new Blob([textContent], { type: "text/x-tex;charset=utf-8" }),
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
		this.#fileExtension.value = ".pgf";
		const extensions = [".pgf", ".tex", ".tikz"];
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
			this.#exportedContent.value = textContent = arr.join("\n");
		}

		// add listeners & show modal
		this.#copyButton.addEventListener("click", copyText, { passive: true });
		this.#saveButton.addEventListener("click", saveFile, { passive: true });

		this.#modal.show();
	}
}
