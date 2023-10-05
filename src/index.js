import * as SVG from "@svgdotjs/svg.js/dist/svg.esm";
/// <reference types="@svgdotjs/svg.js" />
import "bootstrap";

import "./impSVGNumber.js";
import { waitForElementLoaded } from "./domWatcher.js";

import componentSymbol from "./componentSymbol.js";
import CanvasController from "./canvasController.js";

class MainController {
	/** @type {CanvasController|null} */
	canvasController = null;
	/** @type {SVG.Svg} */
	symbolsSVG;
	/** @type {componentSymbol[]} */
	symbols;

	constructor() {
		let canvasPromise = this.#initCanvas();
		let symbolsDBPromise = this.#initSymbolDB();
		Promise.all([canvasPromise, symbolsDBPromise]).then(() => this.#initButtons());
	}

	async #initCanvas() {
		let canvasElement = await waitForElementLoaded("canvas");
		if (canvasElement) this.canvasController = new CanvasController(new SVG.Svg(canvasElement));
	}

	async #initSymbolDB() {
		// Fetch symbol DB
		/** @type {HTMLLinkElement} */
		const symbolDBlink = await waitForElementLoaded("symbolDBlink");
		const response = await fetch(symbolDBlink.href);
		const textContent = await response.text();

		// Parse & add to DOM
		/** @type {XMLDocument} */
		const symbolsDocument = new DOMParser().parseFromString(textContent, "image/svg+xml");
		/** @type {SVGSVGElement} */
		const symbolsSVGSVGElement = document.adoptNode(symbolsDocument.firstElementChild);
		symbolsSVGSVGElement.style.display = "none";
		document.body.appendChild(symbolsSVGSVGElement);

		// Extract symbols
		this.symbolsSVG = new SVG.Svg(symbolsSVGSVGElement);
		/** @type {SVG.Defs} */
		const defs = this.symbolsSVG.defs();
		const symbols = Array.prototype.filter.call(defs.node.children, (def) => def instanceof SVGSymbolElement);
		// let symbols = defs.children().filter((/** @type {SVG.Element} */def) => def instanceof SVG.Symbol);
		this.symbols = symbols.map((symbol) => new componentSymbol(symbol));
	}

	async #initButtons() {
		/** @type {HTMLDivElement} */
		const leftToolbar = document.getElementById("leftToolbar-body");
		/** @type {HTMLDivElement} */
		const leftToolbarAccordion = document.getElementById("leftToolbarAccordion");

		/** @type {Map<string, componentSymbol[]>} */
		const groupedSymbols = this.symbols.reduce(
			/**
			 * @param {Map<string, componentSymbol[]>} groupedSymbols
			 * @param {componentSymbol} symbol
			 * @returns {Map<string, componentSymbol[]>}
			 */
			(groupedSymbols, symbol) => {
				const key = symbol.groupName || "Unsorted components";
				let group = groupedSymbols.get(key);
				if (group) group.push(symbol);
				else groupedSymbols.set(key, [symbol]);
				return groupedSymbols;
			},
			new Map()
		);

		let iconsWithoutViewBox = [];
		let firstGroup = true;
		for (const [groupName, symbols] of groupedSymbols.entries()) {
			const collapseGroupID = "collapseGroup-" + groupName.replace(/[^\d\w\-\_]+/gi, "-");

			const accordionGroup = leftToolbarAccordion.appendChild(document.createElement("div"));
			accordionGroup.classList.add("accordion-item");

			const accordionItemHeader = accordionGroup.appendChild(document.createElement("h2"));
			accordionItemHeader.classList.add("accordion-header");

			const accordionItemButton = accordionItemHeader.appendChild(document.createElement("button"));
			accordionItemButton.classList.add("accordion-button", firstGroup ? undefined : "collapsed");
			accordionItemButton.innerText = groupName;
			accordionItemButton.setAttribute("aria-controls", collapseGroupID);
			accordionItemButton.setAttribute("aria-expanded", firstGroup);
			accordionItemButton.setAttribute("data-bs-target", "#" + collapseGroupID);
			accordionItemButton.setAttribute("data-bs-toggle", "collapse");
			accordionItemButton.type = "button";

			const accordionItemCollapse = accordionGroup.appendChild(document.createElement("div"));
			accordionItemCollapse.classList.add("accordion-collapse", "collapse", firstGroup ? "show" : undefined);
			accordionItemCollapse.id = collapseGroupID;
			accordionItemCollapse.setAttribute("data-bs-parent", "#leftToolbarAccordion");

			const accordionItemBody = accordionItemCollapse.appendChild(document.createElement("div"));
			accordionItemBody.classList.add("accordion-body", "iconLibAccordionBody");

			for (const symbol of symbols) {
				/** @type {HTMLDivElement} */
				const addButton = accordionItemBody.appendChild(document.createElement("div"));
				addButton.classList.add("libComponent");
				addButton.ariaRoleDescription;
				const listener = (ev) => {
					let newInstance = symbol.addInstanceToContainer(this.canvasController.canvas, ev);
					// todo: add instance to list etc
				};

				addButton.addEventListener("mousedown", listener);
				addButton.addEventListener("touchstart", listener, { passive: false });

				/** @type {SVGSVGElement} */
				const svgIcon = addButton.appendChild(document.createElementNS(SVG.namespaces.svg, "svg"));
				if (symbol.viewBox) {
					svgIcon.setAttributeNS(
						null,
						"viewBox",
						symbol.viewBox.x +
							" " +
							symbol.viewBox.y +
							" " +
							symbol.viewBox.width +
							" " +
							symbol.viewBox.height
					);
					svgIcon.setAttributeNS(null, "width", symbol.viewBox.width);
					svgIcon.setAttributeNS(null, "height", symbol.viewBox.height);
				}

				const svgUse = svgIcon.appendChild(document.createElementNS(SVG.namespaces.svg, "use"));
				svgUse.setAttributeNS(SVG.namespaces.xlink, "href", "#" + symbol.id());

				if (!symbol.viewBox) iconsWithoutViewBox.append(svgIcon);
			}

			if (firstGroup) firstGroup = false;
		}

		/**
		 *
		 * @param {DOMRect|null|undefined} box
		 * @returns {boolean}
		 */
		function isNullishBox(box) {
			return !box || (!box.x && !box.y && !box.width && !box.height);
		}

		while (iconsWithoutViewBox.length > 0 && isNullishBox(iconsWithoutViewBox[0].getBBox()))
			await new Promise((resolve) => requestAnimationFrame(resolve));

		iconsWithoutViewBox.forEach(async (svgIcon) => {
			/** @type {DOMRect} */
			let box;
			// wait for browser rendering and setting the bounding box
			while (isNullishBox((box = svgIcon.getBBox({ clipped: false, fill: true, markers: true, stroke: true }))))
				await new Promise((resolve) => requestAnimationFrame(resolve));

			svgIcon.setAttributeNS(null, "viewBox", box.x + " " + box.y + " " + box.width + " " + box.height);
			svgIcon.setAttributeNS(null, "width", box.width);
			svgIcon.setAttributeNS(null, "height", box.height);
		});

		// /** @type {HTMLButtonElement} */
		// const nigfete_addButton = document.getElementById("nigfete_addButton");
		// const nigfete_template = this.symbols[0];

		// const listener = (ev) => {
		// 	let newInstance = nigfete_template.addInstanceToContainer(this.canvasController.canvas, ev);
		// };
		// nigfete_addButton.addEventListener("mousedown", listener);
		// nigfete_addButton.addEventListener("touchstart", listener, { passive: false });
	}
}

window.mainController = new MainController();
