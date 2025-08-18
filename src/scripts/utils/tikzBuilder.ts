import * as SVG from "@svgdotjs/svg.js"

export type TikzNodeCommand = {
	options: string[]
	name?: string
	position?: string | SVG.Point
	content?: string
	additionalNodes: TikzNodeCommand[]
}

export type CircuitikzTo = {
	options: string[]
	name?: string
}

export type TikzPathCommand = {
	options: string[]
	coordinates: (string | SVG.Point)[]
	connectors: (string | CircuitikzTo)[]
	additionalNodes: TikzNodeCommand[]
}

export function buildTikzStringFromNodeCommand(command: TikzNodeCommand): string {
	return "\\" + convertNodeCommand(command) + ";"
}

function convertNodeCommand(command: TikzNodeCommand): string {
	let outputString: string[] = ["node"]

	if (command.options.length > 0) {
		outputString.push("[" + command.options.join(", ") + "]")
	}

	if (command.name) {
		outputString.push("(" + command.name + ")")
	}
	outputString.push(" at ")
	outputString.push(coordToString(command.position))
	outputString.push("{" + (command.content ?? "") + "}")

	for (const additionalCommand of command.additionalNodes) {
		outputString.push(" " + convertNodeCommand(additionalCommand))
	}

	return outputString.join("")
}

export function buildTikzStringFromPathCommand(command: TikzPathCommand): string {
	return "\\" + convertPathCommand(command) + ";"
}

function convertPathCommand(command: TikzPathCommand): string {
	if (command.coordinates.length !== command.connectors.length + 1) {
		throw new Error(
			"Building path command failed! Number of coordinates has to be one more than number of coordinate connectors"
		)
	}
	if (command.coordinates.length < 2) {
		throw new Error("Building path command failed! Number of coordinates has to be at least 2")
	}
	let outputString: string[] = []
	let drawIndex = command.options.indexOf("draw")
	if (drawIndex >= 0) {
		outputString.push("draw")
		command.options.splice(drawIndex, 1)
	} else {
		outputString.push("path")
	}

	if (command.options.length > 0) {
		outputString.push("[" + command.options.join(", ") + "]")
	}

	for (let index = 0; index < command.connectors.length; index++) {
		const coordinate = command.coordinates[index]
		const connector = command.connectors[index]

		outputString.push(" " + coordToString(coordinate))
		if (typeof connector == "string") {
			outputString.push(" " + connector)
		} else {
			outputString.push(" " + buildCircuitikzTo(connector))
		}
	}

	outputString.push(" " + coordToString(command.coordinates.at(-1)))

	for (const additionalCommand of command.additionalNodes) {
		// check that additionalCommand is not null
		if (additionalCommand) {
			outputString.push(" " + convertNodeCommand(additionalCommand))
		}
	}

	return outputString.join("")
}

function coordToString(coord: string | SVG.Point) {
	if (typeof coord == "string") {
		return coord
	} else {
		return coord.toTikzString()
	}
}

function buildCircuitikzTo(command: CircuitikzTo): string {
	let outputString: string[] = [...command.options]

	if (command.name) {
		outputString.push("name=" + command.name)
	}

	return "to[" + outputString.join(", ") + "]"
}
