"""
Errors of the converter which are shown to the user without a Python traceback.
"""

import pathlib
from dataclasses import dataclass

# how many failed symbols are printed, the error log always contains all of them
MAX_PRINTED_FAILURES = 5


class ConverterError(Exception):
	pass


@dataclass
class Failure:
	component: str
	message: str
	details: str = ""


def raise_failures(step: str, failures: list[Failure], total: int, log_file: pathlib.Path):
	"""
	Writes all failures to the log file and raises an error which summarizes them.
	"""
	log_file = log_file.resolve()
	log_file.write_text(
		"\n\n".join(f"{f.component}\n{f.message}\n{f.details}".rstrip() for f in failures) + "\n", encoding="utf-8"
	)

	lines = [f"{len(failures)} of {total} symbols failed while {step}:"]
	for failure in failures[:MAX_PRINTED_FAILURES]:
		indented = failure.message.replace("\n", "\n    ")
		lines.append(f"\n  {failure.component}\n    {indented}")
	if len(failures) > MAX_PRINTED_FAILURES:
		lines.append(f"\n  ... and {len(failures) - MAX_PRINTED_FAILURES} more")
	lines.append(f"\nDetails of all failures: {log_file}")
	raise ConverterError("\n".join(lines))
