"""
Checks nodes.jsonc before the conversion.
"""

import collections
import json
import pathlib

import jsonschema
from jsonc_parser.errors import ParserError
from jsonc_parser.parser import JsoncParser

from errors import ConverterError

CONVERTER_DIR = pathlib.Path(__file__).resolve().parent


def _describe_location(data, path: list) -> str:
	"""
	Turns the path of a schema error into e.g. 'nodes[40] ("nmos") > options > 2'
	"""
	if len(path) < 2 or path[0] not in ("nodes", "path"):
		return " > ".join(str(part) for part in path) or "top level"
	section, index = path[0], path[1]
	entry = data[section][index]
	name = entry.get("name" if section == "nodes" else "drawName") if isinstance(entry, dict) else None
	location = f"{section}[{index}]" + (f' ("{name}")' if name else "")
	return " > ".join([location, *(str(part) for part in path[2:])])


def _schema_problems(data) -> list[str]:
	schema = json.loads((CONVERTER_DIR / "nodes.schema.json").read_text(encoding="utf-8"))
	errors = sorted(jsonschema.Draft7Validator(schema).iter_errors(data), key=lambda e: [str(p) for p in e.path])
	problems = []
	for error in errors:
		# for "one of" the errors of the closest alternative say what is actually wrong
		cause = jsonschema.exceptions.best_match([error])
		problems.append(f"{_describe_location(data, list(cause.absolute_path))}: {cause.message}")
	return problems


def _duplicate_id_problems() -> list[str]:
	"""
	Two components or options must not result in the same symbol ID, one of them would get lost.
	"""
	# imported here, because utils reads nodes.jsonc when it is imported
	from utils import NODES_AND_PATHS, component_name_from_info, options_object_to_array

	sources = collections.defaultdict(list)
	for section, name_key in (("nodes", "name"), ("path", "drawName")):
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
	Returns the problems found in nodes.jsonc.
	"""
	try:
		data = JsoncParser.parse_file(str(CONVERTER_DIR / "nodes.jsonc"))
	except ParserError as error:
		raise ConverterError(f"nodes.jsonc can't be read: {error}") from error

	problems = _schema_problems(data) or _duplicate_id_problems()
	return [f"nodes.jsonc: {problem}" for problem in problems]
