# load "normal" (user) bashrc, if it exists
[[ -f ~/.bashrc ]] && source ~/.bashrc

# load vscode customizations, if TERM set accordingly
[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path bash)"

# get the workspace root folder (absolute path without trailing slash)
WORKSPACE="$(realpath "${BASH_SOURCE[0]}")"
WORKSPACE="${WORKSPACE%/*/*}"
export WORKSPACE

# use a workspace specific (command) history file
export HISTFILE="${WORKSPACE}/.vscode/.bash_history"

# extend the PATH variable with the node bin folder, if not already set
NODE_BIN="${WORKSPACE}/node_modules/.bin"

if [[ -d "$NODE_BIN" && ":$PATH:" != *":$NODE_BIN:"* ]]; then
	export PATH="$PATH:$NODE_BIN"
fi

unset NODE_BIN