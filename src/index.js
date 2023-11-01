import * as SVG from "@svgdotjs/svg.js/dist/svg.esm";
/// <reference types="@svgdotjs/svg.js" />
// import * as bootstrap from "bootstrap";
import { Collapse, Offcanvas } from "bootstrap";
// import "mdb-ui-kit";
import { Button } from "mdb-ui-kit";

import "./impSVGNumber.js";
import { waitForElementLoaded } from "./domWatcher.js";

import componentSymbol from "./componentSymbol.js";
import CanvasController from "./canvasController.js";
import LineDrawer from "./lineDrawer.js";

class MainController {
	/** @type {?CanvasController} */
	canvasController = null;
	/** @type {?LineDrawer} */
	lineDrawer = null;
	/** @type {SVG.Svg} */
	symbolsSVG;
	/** @type {componentSymbol[]} */
	symbols;
	/** @type {Promise} */
	initPromise;
	/** @type {boolean} */
	isInitDone = false;

	constructor() {
		let canvasPromise = this.#initCanvas();
		let symbolsDBPromise = this.#initSymbolDB();
		canvasPromise.then(() => (this.lineDrawer = new LineDrawer(this.canvasController)));
		this.initPromise = Promise.all([canvasPromise, symbolsDBPromise])
			.then(() => this.#initButtons())
			.then(() => {
				this.isInitDone = true;
			});
	}

	async #initCanvas() {
		let canvasElement = await waitForElementLoaded("canvas");
		if (canvasElement) this.canvasController = new CanvasController(new SVG.Svg(canvasElement));
	}

	async #initSymbolDB() {
		// Fetch symbol DB
		/** @type {HTMLLinkElement} */
		const symbolDBlink = await waitForElementLoaded("symbolDBlink");
		const response = await fetch(symbolDBlink.href, {
			method: "GET",
			mode: "no-cors", // "no-cors" needed to actually use the preloaded file
		});
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
		const leftToolbar = document.getElementById("leftToolbar");
		const leftToolbarOC = new Offcanvas(leftToolbar);
		/** @type {HTMLDivElement} */
		//const leftToolbarBody = document.getElementById("leftToolbar-body");
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

		/** @type {SVGSVGElement[]} */
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
					leftToolbarOC.hide();
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
	}
}

window.mainController = new MainController();
