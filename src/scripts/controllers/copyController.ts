import { Point } from "@svgdotjs/svg.js"
import {
	ComponentSaveObject,
	MainController,
	SaveController,
	SelectionController,
	SelectionMode,
	Undo,
} from "../internal"

type Clipboard = {
	components: ComponentSaveObject[]
	selectionPos: Point
}

/**
 * Class handling copy, paste and cut
 * @class
 */
export class CopyPaste {
	private static clipboard: Clipboard | null = null

	public static copy() {
		if (SelectionController.instance.hasSelection()) {
			let components: ComponentSaveObject[] = []
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				let componentObject = component.toJson()
				if ("name" in componentObject) {
					componentObject.name = ""
				}

				components.push(componentObject)
			}

			let bbox = SelectionController.instance.getOverallBoundingBox()

			CopyPaste.clipboard = {
				components: components,
				selectionPos: new Point(bbox.cx, bbox.cy),
			}

			MainController.instance.broadcastChannel.postMessage("clipboard=" + JSON.stringify(CopyPaste.clipboard))
		}
	}

	public static setClipboard(clipboard: Clipboard) {
		this.clipboard = clipboard
	}

	public static paste() {
		if (CopyPaste.clipboard && Object.keys(CopyPaste.clipboard).length === 0) {
			return
		}

		if (!CopyPaste.clipboard) {
			return
		}

		SelectionController.instance.deactivateSelection()
		SelectionController.instance.activateSelection()

		let allComponents = []

		for (const component of CopyPaste.clipboard.components) {
			allComponents.push(SaveController.fromJson(component))
		}

		if (allComponents.length > 0) {
			SelectionController.instance.selectComponents(allComponents, SelectionMode.RESET)
		}
		SelectionController.instance.moveSelectionTo(new Point(CopyPaste.clipboard.selectionPos).add(new Point(20, 20)))
		Undo.addState()
	}

	public static cut() {
		if (SelectionController.instance.hasSelection()) {
			CopyPaste.copy()

			for (const component of SelectionController.instance.currentlySelectedComponents) {
				MainController.instance.removeComponent(component)
			}
			Undo.addState()
		}
	}
}
