import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

if (process.platform !== "darwin") {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const glimpseMain = require.resolve("glimpseui");
const glimpseRoot = dirname(dirname(glimpseMain));
const swiftPath = join(glimpseRoot, "src", "glimpse.swift");

let source = readFileSync(swiftPath, "utf8");
let patched = source;

function replaceOnce(needle, replacement, description) {
  if (patched.includes(replacement)) return;
  if (!patched.includes(needle)) {
    throw new Error(`Could not patch glimpse.swift (${description}); expected text not found.`);
  }
  patched = patched.replace(needle, replacement);
}

replaceOnce(
  `class GlimpsePanel: NSWindow {\n    override var canBecomeKey: Bool { true }\n    override var canBecomeMain: Bool { true }\n}`,
  `class GlimpsePanel: NSPanel {\n    override var canBecomeKey: Bool { true }\n    override var canBecomeMain: Bool { true }\n}`,
  "make GlimpsePanel an NSPanel",
);

replaceOnce(
  `        let styleMask: NSWindow.StyleMask = config.frameless\n            ? [.borderless]\n            : [.titled, .closable, .miniaturizable, .resizable]`,
  `        var styleMask: NSWindow.StyleMask = config.frameless\n            ? [.borderless]\n            : [.titled, .closable, .miniaturizable, .resizable]\n        if config.floating {\n            styleMask.insert(.nonactivatingPanel)\n        }`,
  "use non-activating panel style for floating windows",
);

replaceOnce(
  `    // MARK: - Setup\n\n    private func setupWindow() {`,
  `    // MARK: - Setup\n\n    private func forceActivate() {\n        NSApp.setActivationPolicy(.regular)\n        window.makeKeyAndOrderFront(nil)\n        window.makeFirstResponder(webView)\n        NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])\n        NSApp.activate(ignoringOtherApps: true)\n    }\n\n    private func setupWindow() {`,
  "add forceActivate helper",
);

replaceOnce(
  `        } else {\n            window.makeKeyAndOrderFront(nil)\n            NSApp.activate(ignoringOtherApps: true)\n        }\n    }\n`,
  `        } else {\n            window.makeKeyAndOrderFront(nil)\n            NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])\n            NSApp.activate(ignoringOtherApps: true)\n        }\n    }\n`,
  "activate with NSRunningApplication during setup",
);

replaceOnce(
  `                window.makeKeyAndOrderFront(nil)\n                window.makeFirstResponder(webView)\n                NSApp.activate(ignoringOtherApps: true)`,
  `                forceActivate()`,
  "use forceActivate for show command",
);

if (patched !== source) {
  writeFileSync(swiftPath, patched);
}

const result = spawnSync("npm", ["run", "build:macos"], {
  cwd: glimpseRoot,
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

chmodSync(join(glimpseRoot, "src", "glimpse"), 0o755);
