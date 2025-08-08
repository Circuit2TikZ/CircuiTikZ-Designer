import { MainController, SelectionController, SaveController, ComponentSaveObject, SelectionMode } from "../internal"

/**
 * Class handling undo and redo via save states
 * @class
 */
export class Undo {
	private static states: ComponentSaveObject[][] = []

	private static currentIndex = -1

	//TODO discuss if selections should be remembered or not???
	public static addState() {
		// get json object
		let currentState = []
		for (const component of MainController.instance.circuitComponents) {
			let componentObject = component.toJson()
			componentObject.selected = component.isSelected
			currentState.push(componentObject)
		}

		let shouldAddState = true
		if (Undo.states.length > 0) {
			let compareState = Undo.states.at(Undo.currentIndex)
			if (JSON.stringify(compareState) == JSON.stringify(currentState)) {
				// This and the last state are identical -> no new state
				// sometimes needed for more complicated scenarios
				shouldAddState = false
			}
		}

		// push state on stack
		if (shouldAddState) {
			Undo.states = Undo.states.slice(0, Undo.currentIndex + 1)
			Undo.states.push(currentState)
			Undo.currentIndex = Undo.states.length - 1
		}
	}

	public static getCurrentState() {
		return Undo.states[Undo.currentIndex]
	}

	public static undo() {
		Undo.currentIndex -= 1
		if (Undo.currentIndex < 0) {
			Undo.currentIndex = 0
			return
		}
		Undo.loadState()
	}

	public static redo() {
		Undo.currentIndex += 1
		if (Undo.currentIndex >= Undo.states.length) {
			Undo.currentIndex = Undo.states.length - 1
			return
		}
		Undo.loadState()
	}

	private static loadState() {
		// remove all components
		while (MainController.instance.circuitComponents.length > 0) {
			MainController.instance.removeComponent(MainController.instance.circuitComponents[0])
		}

		// load state
		let state = Undo.states[Undo.currentIndex]

		let components = []

		for (const component of state) {
			let initalializedComponenent = SaveController.fromJson(component)
			if (component.selected && initalializedComponenent) {
				components.push(initalializedComponenent)
			}
		}

		if (components.length > 0) {
			SelectionController.instance.selectComponents(components, SelectionMode.RESET)
		}
	}
}
