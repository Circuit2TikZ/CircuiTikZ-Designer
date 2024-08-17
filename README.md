<!-- TODO change README and adjust URLs -->
# CircuiCanvas

PWA GUI for CircuiTikZ. A current build is available at [https://ussi.e-technik.uni-erlangen.de/tikz/](https://git.lte.e-technik.uni-erlangen.de/circuitikz-gui/circuitikz-pwa) and can be used for your designs.

See the whole project explanation under [https://ussi.e-technik.uni-erlangen.de/
](https://git.lte.e-technik.uni-erlangen.de/circuitikz-gui/circuitikz-pwa)

## Bugs and Features

see under `Issues` for now

## Hotkeys

* Change tool:
    * Pan and zoom (Esc)
    * Draw wire (W)
    * Erase component/wire (E/Del)
* Draw wire:
    * Cancel drawing (right mouse click)
    * Finish drawing (double left mouse click)
* Add components when in Pan/zoom mode:
    * Ground (G)
    * Resistor (R)
    * Capacitor (C)
    * (American) inductor (L)
    * NPN transistor (T)
    * Jump crossing (Z)
    * Plain crossing (X)
    * Circle crossing (.)
* Manipulate components:
    * Rotate clockwise (Ctrl+R)
    * Rotate counter clockwise (Shift+Ctrl+R)
    * Flip at horizontal axis (Shift+X)
    * Flip at vertical axis (Shift+Y)

## How to use locally (e.g. in VSCode)

* install node.js from <http://nodejs.org>
* clone repo
* run `npm install` in the terminal in project directory to install dependencies
* run `npm run start` in the terminal to host the website on localhost

## How to build for server

* run `npm run build`
* copy created directory to server  (build/ oder dist/)

It is possible to test the build localy before upload to the server by:

* `npm install -g http-server`
* `cd path/to/your/dist`
* run `http-server`
* running build can be found here: <http://localhost:8080>

Detailed explanation: <https://chat.openai.com/share/285fc488-fbef-44b4-9c4f-6f40c970f413>
