/**
 * @module contextMenu
 */

/**
 * @typedef {object} ContextMenuEntry
 * @property {string} result
 * @property {?string} [iconText]
 * @property {?string} [iconClass = "material-symbols-outlined dropdown-item-icon"]
 * @property {string} text
 * @property {boolean} [disabled=false]
 */

export class ContextMenu {
	/** @type {HTMLUListElement} */
	menuElement

	/** @type {?(result: string) => *} */
	#onSuccessCallback = null
	/** @type {?() => *} */
	#onCancelCallback = null

	/**
	 *
	 * @param {ContextMenuEntry[]} menuEntries
	 */
	constructor(menuEntries) {
		this.onMenuEntryClick = this.onMenuEntryClick.bind(this)
		this.onCancel = this.onCancel.bind(this)

		// <ul class="dropdown-menu dropdown-menu-end" id="exportModalFileExtensionDropdown"></ul>
		this.menuElement = document.createElement("ul")
		this.menuElement.classList.add("dropdown-menu")
		this.menuElement.style.position = "absolute"
		document.body.appendChild(this.menuElement)

		this.menuElement.append(
			...menuEntries.map((entry) => {
				const icon = document.createElement("span")
				icon.textContent = entry.iconText || ""
				icon.className = entry.iconClass || "material-symbols-outlined dropdown-item-icon"

				const button = document.createElement("button")
				button.value = entry.result
				button.classList.add("dropdown-item")
				if (entry.disabled === true) {
					button.disabled = true
					button.ariaDisabled = true
				}
				button.append(icon, entry.text)

				button.addEventListener("click", this.onMenuEntryClick, { passive: true })

				const listElement = document.createElement("li")
				listElement.appendChild(button)
				return listElement
			})
		)
	}

	/**
	 *
	 * @param {MouseEvent|TouchEvent} evt
	 */
	onMenuEntryClick(evt) {
		if (evt.target === this.menuElement) return
		if (!evt.target?.value || evt.target.ariaDisabled) {
			this.onCancel()
			return
		} else if (window.TouchEvent && evt instanceof TouchEvent) evt.preventDefault() // prevent following click event

		let callback = this.#onSuccessCallback
		this.#reset()
		if (callback) callback(evt.target.value)
	}

	onCancel() {
		let callback = this.#onCancelCallback
		this.#reset()
		if (callback) callback()
	}

	#reset() {
		this.#onSuccessCallback = null
		this.#onCancelCallback = null
		document.body.removeEventListener("click", this.onMenuEntryClick)
		document.body.removeEventListener("touchend", this.onMenuEntryClick)
		this.menuElement.classList.remove("show")
	}

	/**
	 *
	 * @param {number} x
	 * @param {number} y
	 * @returns {Promise<string>}
	 */
	openForResult(x, y) {
		// close last instance, if any
		this.onCancel()

		/** @type {Promise<string>} */
		let promise = new Promise((resolve, reject) => {
			this.#onSuccessCallback = resolve
			this.#onCancelCallback = reject
		})

		// if user clicks anywhere except the contextMenu
		document.body.addEventListener("click", this.onMenuEntryClick, { passive: true })
		document.body.addEventListener("touchend", this.onMenuEntryClick, { passive: false }) // needed to recognize touches outside the contextmenu

		this.menuElement.style.left = x + "px"
		this.menuElement.style.top = y + "px"
		this.menuElement.classList.add("show")
		this.menuElement.focus()

		return promise
	}
}
