import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";

const PI_LENS_WIDGET = "pi-lens";
const STATUS_ID = "pi-lens-summary";
const ANSI_PATTERN =
	/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

type Theme = ExtensionContext["ui"]["theme"];
type Widget = Component & { dispose?(): void };
type WidgetContent =
	| string[]
	| ((tui: TUI, theme: Theme) => Widget)
	| undefined;
type WidgetOptions = { placement?: "aboveEditor" | "belowEditor" };
type SetWidget = (
	key: string,
	content: WidgetContent,
	options?: WidgetOptions,
) => void;

function plain(text: string) {
	return text.replace(ANSI_PATTERN, "").replace(/\s+/g, " ").trim();
}

function footerStatus(lines: string[], theme: Theme) {
	const header = plain(lines[0] ?? "");
	if (!header) return undefined;
	if (header.includes("✓ clean")) return theme.fg("success", "✓ clean");

	const errors = Number(header.match(/●\s*(\d+)E/)?.[1] ?? 0);
	const warnings = Number(header.match(/▲\s*(\d+)W/)?.[1] ?? 0);
	const parts = [
		errors > 0 ? theme.fg("error", `E ${errors}`) : undefined,
		warnings > 0 ? theme.fg("warning", `W ${warnings}`) : undefined,
	].filter(Boolean);

	return parts.length ? parts.join(" ") : undefined;
}

function hideAndMirrorWidget(ctx: ExtensionContext, content: WidgetContent) {
	if (!content) {
		ctx.ui.setStatus(STATUS_ID, undefined);
		return undefined;
	}

	if (Array.isArray(content)) {
		ctx.ui.setStatus(STATUS_ID, footerStatus(content, ctx.ui.theme));
		return [];
	}

	return (tui: TUI, theme: Theme): Widget => {
		const widget = content(tui, theme);
		return {
			render(width) {
				ctx.ui.setStatus(STATUS_ID, footerStatus(widget.render(width), theme));
				return [];
			},
			invalidate() {
				widget.invalidate();
				tui.requestRender();
			},
			dispose: () => widget.dispose?.(),
		};
	};
}

export default function (pi: ExtensionAPI) {
	let restoreSetWidget: (() => void) | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || restoreSetWidget) return;

		const setWidget = ctx.ui.setWidget.bind(ctx.ui) as SetWidget;
		ctx.ui.setWidget = ((key, content, options) =>
			setWidget(
				key,
				key === PI_LENS_WIDGET ? hideAndMirrorWidget(ctx, content) : content,
				options,
			)) as SetWidget;

		restoreSetWidget = () => {
			ctx.ui.setWidget = setWidget;
		};
	});

	pi.on("session_shutdown", (_event, ctx) => {
		restoreSetWidget?.();
		restoreSetWidget = undefined;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_ID, undefined);
	});
}
