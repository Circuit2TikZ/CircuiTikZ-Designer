/**
 * @typedef {object} ButtonDescription
 * @property {string} icon
 * @property {string} [iconClass="material-symbols-outlined"]
 * @property {string} [buttonClass]
 * @property {string} [color]
 * @property {string} [backgroundColor]
 * @property {string} [tooltip]
 * @property {function} onclick
 */

//TODO update FAB

/**
 * Internal class for managing individual FABs (floating action button).
 *
 * Used by {@link FABcontroller}
 */
class FloatingActionButton {
	/** @type {HTMLAnchorElement} */
	#instance
	/** @type {?HTMLLIElement} */
	#wrapperElement
	/** @type {HTMLElement} */
	#container
	/** @type {HTMLSpanElement|HTMLElement} */
	#iconInstance
	/** @type {?string} */
	#additionalButtonClass
	/** @type {?function} */
	#onclick

	/**
	 * Create a new floating action button (FAB) or wrap an existing FAB DOM.
	 *
	 * @param {HTMLElement|HTMLAnchorElement} instance - the existing FAB (HTMLAnchorElement) or the container used to create a new FAB
	 * @param {boolean} [isSubButton=true] - `true` creates a small/sub FAB
	 * @param {ButtonDescription} [desc] - optionally set the button parameters using {@link buttonDescription}
	 */
	constructor(instance, isSubButton = true, desc) {
		if (instance instanceof HTMLAnchorElement && instance.classList.contains("btn-floating")) {
			// existing button
			this.#instance = instance
			this.#wrapperElement = null
			this.#container = this.#instance.parentElement
			this.#iconInstance = Array.prototype.find.call(
				this.#instance.children,
				(element) => element instanceof HTMLSpanElement || element.tagName === "I"
			)
		} else {
			// create button
			this.#container = instance
			this.#instance = document.createElement("a")
			this.#instance.classList.add("btn", "btn-floating")
			this.#iconInstance = this.#instance.appendChild(document.createElement("i"))
			if (isSubButton) {
				// this.#instance.classList.add("btn-sm"); // small
				this.#wrapperElement = this.#container.appendChild(document.createElement("li"))
				this.#wrapperElement.appendChild(this.#instance)
			} else {
				this.#wrapperElement = null
				this.#container.appendChild(this.#instance)
			}
		}
		if (desc) this.buttonDescription = desc
	}

	/**
	 * Set the button parameters
	 *
	 * @param {ButtonDescription} desc
	 */
	set buttonDescription(desc) {
		this.#iconInstance.textContent = desc.icon || ""
		this.#iconInstance.className = desc.iconClass || "material-symbols-outlined"

		if (this.#additionalButtonClass) this.#instance.classList.remove(this.#additionalButtonClass)
		if (desc.buttonClass) this.#instance.classList.add(desc.buttonClass)

		this.#instance.style.color = desc.color || null
		this.#instance.style.backgroundColor = desc.backgroundColor || null
		this.#instance.title = desc.tooltip || ""

		this.onclick = desc.onclick
	}

	/**
	 * Remove this FAB from its container.
	 */
	removeButton() {
		this.#container.removeChild(this.#wrapperElement || this.#instance)
	}

	/**
	 * Set or reset the click listener.
	 * @param {?(this: HTMLAnchorElement, ev: MouseEvent) => *} callback - the new callback
	 */
	set onclick(callback) {
		if (this.#onclick !== callback) {
			if (this.#onclick) this.#instance.removeEventListener("click", this.#onclick)
			this.#onclick = callback || null
			if (this.#onclick) this.#instance.addEventListener("click", this.#onclick)
		}
	}
}

/**
 * Controller for the floating action buttons (FAB).
 * @class
 */
export class FABcontroller {
	/** @type {FABcontroller} */
	static #instance
	/** @type {HTMLDivElement} */
	#container
	/** @type {HTMLUListElement} */
	#subContainer
	/** @type {FloatingActionButton} */
	#mainFAB
	/** @type {FloatingActionButton[]} */
	#subFABs = []
	/** @type {boolean} */
	#visible = false

	/**
	 * Do not call this constructor directly. Use {@see controller} instead, to get the singleton instance.
	 */
	constructor() {
		this.#container = document.getElementById("floatingActionButtonContainer")
		this.#subContainer = document.getElementById("subFloatingActionButtonContainer")
		this.#mainFAB = new FloatingActionButton(document.getElementById("mainFAB", false))
	}

	/**
	 * Getter for the singleton instance.
	 * @returns {FABcontroller}
	 */
	static get controller() {
		return FABcontroller.#instance || (FABcontroller.#instance = new FABcontroller())
	}

	/**
	 * Get the visibility.
	 * @returns {boolean}
	 */
	get visible() {
		return this.#visible
	}

	/**
	 * Show or hide all FABs.
	 * @param {boolean} value
	 */
	set visible(value) {
		if (this.#visible !== value) {
			this.#container.style.display = value ? "unset" : "none"
			this.#visible = value
		}
	}

	/**
	 * Set the main FAB and (optionally) sub FABs.
	 *
	 * @param {ButtonDescription} mainButton
	 * @param {ButtonDescription[]} [subButtons]
	 */
	setButtons(mainButton, subButtons) {
		this.#mainFAB.buttonDescription = mainButton

		if (!subButtons) subButtons = []

		// remove sub buttons, if too many
		if (subButtons.length < this.#subFABs.length) {
			for (let button of this.#subFABs.splice(subButtons.length)) button.removeButton()
		}

		// update old sub-buttons
		for (let i = 0; i < this.#subFABs.length; i++) this.#subFABs[i].buttonDescription = subButtons[i]

		// add sub buttons, if more than old state
		for (let i = this.#subFABs.length; i < subButtons.length; i++)
			this.#subFABs.push(new FloatingActionButton(this.#subContainer, true, subButtons[i]))
	}

	/**
	 * Remove the callbacks/onclick(s) of the buttons.
	 */
	removeAllCallbacks() {
		for (let button of [this.#mainFAB, ...this.#subFABs]) button.onclick = null
	}
}
