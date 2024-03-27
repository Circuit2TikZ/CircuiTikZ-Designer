
# CircuiCanvas

PWA GUI for CircuiTikZ available at https://ussi.e-technik.uni-erlangen.de/tikz/

## Bugs and Features

see under `Issues`

## How to use locally (e.g. in VSCode)

* install node.js from http://nodejs.org
* clone repo
* run `npm install` in the terminal in project directory to install dependencies
* run `npm run start` in the terminal to host the website on localhost

## How to build for server


* run `npm run build`
* copy created directory to server  (build/ oder dist/) 

It is possible to test it localy before upload to server by:

* `npm install -g http-server`
* `cd path/to/your/dist`
* `run "http-server`
* open server at `http://localhost:8080`

Detailed explanation: https://chat.openai.com/share/285fc488-fbef-44b4-9c4f-6f40c970f413