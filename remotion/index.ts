import { registerRoot } from "remotion";
import { waitForFonts } from "./fonts";
import { Root } from "./Root";

waitForFonts();
registerRoot(Root);
