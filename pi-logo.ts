import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const LOGO = [
	"  ██████╗  ██╗ ",
	"  ██╔══██╗ ██║ ",
	"  ██████╔╝ ██║ ",
	"  ██╔═══╝  ██║ ",
	"  ██║      ██║ ",
	"  ╚═╝      ╚═╝ ",
];

function randomColor() {
	// Use the stable ANSI 256-color range, skipping terminal-defined colors 0-15.
	return 16 + Math.floor(Math.random() * 240);
}

function color(colorId: number, text: string) {
	return `\x1b[38;5;${colorId}m${text}${RESET}`;
}

function center(text: string, width: number) {
	const padding = Math.floor((width - [...text].length) / 2);
	return padding > 0 ? `${" ".repeat(padding)}${text}` : text;
}

export default function (pi: ExtensionAPI) {
	let rerender: (() => void) | undefined;
	let enabled = true;
	let colorIds = Array.from({ length: LOGO.length + 1 }, randomColor);
	let model = "no model selected";
	let thinking = "off";
	let project = path.basename(process.cwd()) || "session";

	function rerollColors() {
		colorIds = Array.from({ length: LOGO.length + 1 }, randomColor);
	}

	function render(width: number) {
		const subtitle = `${model} · ${thinking} · ${project}`;
		return [
			"",
			...LOGO.map((line, index) => color(colorIds[index], center(line, width))),
			`${BOLD}${color(colorIds[LOGO.length], center(subtitle, width))}${RESET}`,
		];
	}

	function install(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		model = ctx.model?.id ?? "no model selected";
		thinking = pi.getThinkingLevel();
		project = path.basename(ctx.cwd) || "session";

		ctx.ui.setHeader((tui) => {
			rerender = () => tui.requestRender();
			return {
				render,
				invalidate: rerender,
			};
		});
	}

	pi.on("session_start", (_event, ctx) => {
		rerollColors();
		if (enabled) install(ctx);
	});

	pi.on("model_select", (event) => {
		model = event.model.id;
		rerender?.();
	});

	pi.on("thinking_level_select", (event) => {
		thinking = event.level;
		rerender?.();
	});

	pi.on("session_shutdown", (_event, ctx) => {
		rerender = undefined;
		if (ctx.hasUI) ctx.ui.setHeader(undefined);
	});

	pi.registerCommand("pi-logo", {
		description: "Toggle the random 256-color Pi logo session header",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			rerender = undefined;
			if (!ctx.hasUI) return;

			if (enabled) {
				rerollColors();
				install(ctx);
				ctx.ui.notify("Pi logo header enabled", "info");
			} else {
				ctx.ui.setHeader(undefined);
				ctx.ui.notify("Pi logo header disabled", "info");
			}
		},
	});
}
