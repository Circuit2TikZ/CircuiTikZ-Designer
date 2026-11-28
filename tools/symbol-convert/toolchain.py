"""
The external tools of the converter and their versions. The generated symbols depend on them.
This module must only use the standard library and must not read the component files, it is used before the checks.
"""

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess

from errors import ConverterError

CONVERTER_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = CONVERTER_DIR.parents[1]

# npm installs the project's tools (svgo) here
NODE_BIN_DIR = REPO_ROOT / "node_modules" / ".bin"

# CircuiTikZ is installed for the converter only (npm run symbols:setup). Other versions draw some symbols differently.
CIRCUITIKZ_VERSION = "1.8.5"
# checksum of the files in the tex/ folder of the release, see directory_checksum
CIRCUITIKZ_CHECKSUM = "5fb5dc01947c29a2780d50acc6bb26cd7122982017245b3c480e8220ee71c459"
CIRCUITIKZ_DIR = CONVERTER_DIR / ".circuitikz" / CIRCUITIKZ_VERSION

# versions which are known to reproduce the committed symbols.svg. Others only cause a warning.
TESTED_TEXLIVE = "2026"
TESTED_DVISVGM = "3.6"


def find_tool(name: str) -> str:
	"""
	Returns the full path of an external tool, preferring the project's local npm installation.
	Resolving the path is required on Windows, where npm installs tools as .cmd files.
	"""
	tool = shutil.which(name, path=str(NODE_BIN_DIR)) or shutil.which(name)
	if tool is None:
		raise ConverterError(f"Required tool '{name}' not found in {NODE_BIN_DIR} or on PATH")
	return tool


def tex_environment() -> dict[str, str]:
	"""
	The environment for TeX, in which the converter's CircuiTikZ takes priority over all other installations.
	"""
	environment = os.environ.copy()
	# the trailing separator keeps the default search path of TeX
	environment["TEXINPUTS"] = f"{CIRCUITIKZ_DIR}{os.pathsep}{environment.get('TEXINPUTS', '')}"
	return environment


def directory_checksum(directory: pathlib.Path) -> str:
	checksum = hashlib.sha256()
	for file in sorted(directory.iterdir(), key=lambda f: f.name):
		checksum.update(file.name.encode() + b"\0" + hashlib.sha256(file.read_bytes()).digest())
	return checksum.hexdigest()


def is_circuitikz_installed() -> bool:
	return CIRCUITIKZ_DIR.is_dir() and directory_checksum(CIRCUITIKZ_DIR) == CIRCUITIKZ_CHECKSUM


def _output_of(command: list[str], environment: dict[str, str] | None = None) -> str:
	result = subprocess.run(command, capture_output=True, text=True, env=environment, check=False)
	return result.stdout.strip()


def _required_svgo_version() -> str:
	package = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
	return package["devDependencies"]["svgo"]


def check_tools() -> tuple[list[str], list[str]]:
	"""
	Checks that all tools are available in usable versions. Returns the problems and the warnings.
	"""
	problems = []
	warnings = []

	tools = {}
	for name in ["lualatex", "kpsewhich", "dvisvgm", "svgo"]:
		try:
			tools[name] = find_tool(name)
		except ConverterError as error:
			problems.append(str(error))

	if "svgo" in tools:
		required = _required_svgo_version()
		found = _output_of([tools["svgo"], "--version"])
		if found != required:
			problems.append(f"svgo {required} is required (see package.json), found '{found}'. Run `npm ci`.")

	if "lualatex" in tools:
		found = _output_of([tools["lualatex"], "--version"]).split("\n")[0]
		if f"TeX Live {TESTED_TEXLIVE}" not in found:
			warnings.append(f"Tested with TeX Live {TESTED_TEXLIVE}, found: {found}")

	if "dvisvgm" in tools:
		found = _output_of([tools["dvisvgm"], "--version"])
		if not re.search(rf"\b{re.escape(TESTED_DVISVGM)}$", found):
			warnings.append(f"Tested with dvisvgm {TESTED_DVISVGM}, found: {found}")

	if not is_circuitikz_installed():
		problems.append(
			f"CircuiTikZ {CIRCUITIKZ_VERSION} is not installed for the converter, or its files were changed. "
			"Run `npm run symbols:setup`."
		)
	elif "kpsewhich" in tools:
		# make sure TeX really picks up these files, one loaded as a package and one included by it
		for file in ["circuitikz.sty", "pgfcircpath.tex"]:
			found = _output_of([tools["kpsewhich"], "-progname=lualatex", file], tex_environment())
			if not found or pathlib.Path(found).resolve().parent != CIRCUITIKZ_DIR:
				problems.append(f"TeX uses '{found}' instead of the {file} in {CIRCUITIKZ_DIR}")

	return problems, warnings
