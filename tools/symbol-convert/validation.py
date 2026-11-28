"""
Reads and checks the component files, nodes.jsonc and paths.jsonc.
"""

import collections
import json
import pathlib

import jsonschema
import referencing
from jsonc_parser.errors import ParserError
from jsonc_parser.parser import JsoncParser

from errors import ConverterError

CONVERTER_DIR = pathlib.Path(__file__).resolve().parent

# each file has one list of components, its key is also the name of the file and of its schema
SECTIONS = ["nodes", "paths"]


def _read_file(section: str):
	file = CONVERTER_DIR / f"{section}.jsonc"
	try:
		return JsoncParser.parse_file(str(file))
	except ParserError as error:
		raise ConverterError(f"{file.name} can't be read: {error}") from error


def load_components() -> dict[str, list]:
	"""
	The components of all files, e.g. {"nodes": [...], "paths": [...]}
	"""
	return {section: _read_file(section)[section] for section in SECTIONS}


def _read_schema(name: str):
	return json.loads((CONVERTER_DIR / name).read_text(encoding="utf-8"))


def _describe_location(data, path: list) -> str:
	"""
	Turns the path of a schema error into e.g. 'nodes[40] ("nmos") > options > 2'
	"""
	if len(path) < 2 or path[0] not in SECTIONS:
		return " > ".join(str(part) for part in path) or "top level"
	section, index = path[0], path[1]
	entry = data[section][index]
	name = entry.get("name" if section == "nodes" else "drawName") if isinstance(entry, dict) else None
	location = f"{section}[{index}]" + (f' ("{name}")' if name else "")
	return " > ".join([location, *(str(part) for part in path[2:])])


def _schema_problems(section: str, data) -> list[str]:
	common = referencing.Resource.from_contents(_read_schema("common.schema.json"))
	registry = referencing.Registry().with_resource("common.schema.json", common)
	validator = jsonschema.Draft7Validator(_read_schema(f"{section}.schema.json"), registry=registry)
	problems = []
	for error in sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.path]):
		# for "one of" the errors of the closest alternative say what is actually wrong
		cause = jsonschema.exceptions.best_match([error])
		problems.append(f"{section}.jsonc: {_describe_location(data, list(cause.absolute_path))}: {cause.message}")
	return problems


def _duplicate_id_problems() -> list[str]:
	"""
	Two components or options must not result in the same symbol ID, one of them would get lost.
	"""
	# imported here, because utils reads the component files when it is imported
	from utils import NODES_AND_PATHS, component_name_from_info, options_object_to_array

	sources = collections.defaultdict(list)
	for section, name_key in (("nodes", "name"), ("paths", "drawName")):
		for index, entry in enumerate(NODES_AND_PATHS[section]):
			for options in options_object_to_array(entry.get("options", [])):
				display_names = [option.get("displayName", option["name"]) for option in options]
				symbol_id = component_name_from_info(None, entry[name_key], section == "nodes", display_names)
				sources[symbol_id].append(f'{section}[{index}] ("{entry["displayName"]}")')

	return [
		f"the symbol ID '{symbol_id}' is created more than once, by {' and '.join(entries)}"
		for symbol_id, entries in sources.items()
		if len(entries) > 1
	]


def check_components() -> list[str]:
	"""
	Returns the problems found in the component files.
	"""
	problems = []
	for section in SECTIONS:
		problems.extend(_schema_problems(section, _read_file(section)))
	return problems or _duplicate_id_problems()
