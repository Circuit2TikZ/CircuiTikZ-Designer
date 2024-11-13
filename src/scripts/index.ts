/**
 * The main source file. Does only include {@link MainController}, which does the actual work.
 */

import { MainController } from "./internal"

// @ts-ignore
window.mainController = MainController.instance
