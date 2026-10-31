// Drives Raccoon Dock inside the throwaway shell started by tests/run.sh and
// prints one RDTEST line per check. Only ever loaded by that script.
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Shell from "gi://Shell";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const DOCK_UUID = "raccoon-dock@jkm-4314.github.io";
const TEST_APP_ID = "io.github.jkm_4314.RaccoonDockTest.desktop";

const wait = (ms) =>
  new Promise((resolve) =>
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve();
      return GLib.SOURCE_REMOVE;
    }),
  );

async function waitFor(what, check, timeout = 5000) {
  for (let waited = 0; waited < timeout; waited += 50) {
    if (check()) return;
    await wait(50);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function expect(what, value) {
  if (!value) throw new Error(what);
}

export default class SelfTestExtension extends Extension {
  enable() {
    this._pointer = null;
    this._startId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
      this._startId = 0;
      this._run().catch((e) => print(`RDTEST FAIL harness: ${e}\n${e.stack}`));
      return GLib.SOURCE_REMOVE;
    });
  }

  disable() {
    if (this._startId) GLib.source_remove(this._startId);
    this._startId = 0;
    this._pointer = null;
  }

  get _dock() {
    return Main.extensionManager.lookup(DOCK_UUID)?.stateObj;
  }

  get _settings() {
    return this._dock._settings;
  }

  async _run() {
    const mode = GLib.getenv("RACCOON_DOCK_MODE") ?? "test";
    await waitFor("the dock", () => this._dock?._dockBox?.get_stage());

    // A fresh session starts in the overview; the tests want the desktop
    Main.overview.hide();
    await waitFor("the desktop", () => !Main.overview.visible, 10000);
    await wait(500);

    if (mode === "screenshots") await this._screenshots();
    else await this._tests();

    print("RDTEST DONE");
    global.context.terminate();
  }

  async _tests() {
    const tests = [
      ["dock is shown at the bottom", () => this._testShown()],
      ["icon bounces while its app launches", () => this._testBounce()],
      ["clicking the app in front minimizes it", () => this._testMinimize()],
      ["click to minimize can be turned off", () => this._testMinimizeOff()],
      ["dock hides for an overlapping window", () => this._testOverlapHides()],
      ["edge push reveals it", () => this._testReveal()],
      ["auto-hide can be turned off", () => this._testAutohideOff()],
      ["dock moves to the chosen monitor", () => this._testMonitor()],
      ["glass can be turned off and on", () => this._testGlass()],
      ["preferences open", () => this._testPrefs()],
      ["disabling restores the shell", () => this._testDisable()],
    ];
    const only = GLib.getenv("RACCOON_DOCK_TESTS");
    for (const [name, test] of tests) {
      if (only && !only.split(",").some((part) => name.includes(part)))
        continue;
      try {
        await test();
        print(`RDTEST PASS ${name}`);
      } catch (e) {
        print(`RDTEST FAIL ${name}: ${e.message}`);
      }
    }
  }

  // Helpers

  _isDockShown() {
    const { _dockBox: box, _dash: dash } = this._dock;
    return dash.visible && box.translation_y === 0 && box.opacity === 255;
  }

  _isDockHidden() {
    return !this._dock._dash.visible;
  }

  _testIcon() {
    return this._dock._dash._box
      .get_children()
      .map((item) => item.child)
      .find((icon) => icon?.app?.get_id() === TEST_APP_ID);
  }

  _testApp() {
    return Shell.AppSystem.get_default().lookup_app(TEST_APP_ID);
  }

  async _testWindow() {
    const app = this._testApp();
    if (app.get_n_windows() === 0) {
      app.activate();
      await waitFor("the test window", () => app.get_n_windows() > 0, 10000);
    }
    const window = app.get_windows()[0];
    window.unminimize();
    window.activate(global.get_current_time());
    await waitFor("focus", () => global.display.focus_window === window);
    return window;
  }

  // Centers the window on the dock's monitor, clear of the dock or over it.
  // The size changes too, since a resize or a drag is what makes the dock
  // look again, as when a person moves the window.
  async _placeWindow(window, overDock) {
    const monitor = this._dock._getMonitor();
    const height = overDock ? 400 : 300;
    const x = monitor.x + Math.round(monitor.width / 2) - 400;
    const y = monitor.y + (overDock ? monitor.height - 300 : 100);
    window.move_resize_frame(false, x, y, 800, height);
    await wait(800);
  }

  _getPointer() {
    if (!this._pointer) {
      const seat = Clutter.get_default_backend().get_default_seat();
      this._pointer = seat.create_virtual_device(
        Clutter.InputDeviceType.POINTER_DEVICE,
      );
    }
    return this._pointer;
  }

  _movePointer(x, y) {
    this._getPointer().notify_absolute_motion(GLib.get_monotonic_time(), x, y);
  }

  // A real click, so the shell sees an event with a proper timestamp
  async _click(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    this._movePointer(x + width / 2, y + height / 2);
    await wait(100);
    const pointer = this._getPointer();
    for (const state of [
      Clutter.ButtonState.PRESSED,
      Clutter.ButtonState.RELEASED,
    ]) {
      pointer.notify_button(
        GLib.get_monotonic_time(),
        Clutter.BUTTON_PRIMARY,
        state,
      );
      await wait(30);
    }
  }

  // Parks the pointer mid-screen, away from the dock
  async _parkPointer() {
    const monitor = this._dock._getMonitor();
    this._movePointer(monitor.x + monitor.width / 2, monitor.y + 200);
    await wait(100);
  }

  // Runs the pointer down into the bottom edge and pushes until the dock
  // starts to show
  async _pushBottomEdge(x) {
    const monitor = this._dock._getMonitor();
    this._movePointer(monitor.x + x, monitor.y + monitor.height - 200);
    await wait(100);
    for (let i = 0; i < 60 && !this._dock._dash.visible; i++) {
      this._getPointer().notify_relative_motion(
        GLib.get_monotonic_time(),
        0,
        10,
      );
      await wait(16);
    }
  }

  // Tests

  async _testShown() {
    const box = this._dock._dockBox;
    const monitor = Main.layoutManager.primaryMonitor;
    await waitFor("the dock to show", () => this._isDockShown());
    expect(
      "dock box isn't on the bottom edge",
      box.y + box.height === monitor.y + monitor.height,
    );
    expect("test app isn't pinned", this._testIcon());
  }

  async _testBounce() {
    const app = this._testApp();
    const icon = this._testIcon();
    const box = this._dock._dash._box;
    expect("test app is already running", app.get_n_windows() === 0);

    await this._click(icon);
    await wait(150);
    expect("icon didn't lift", icon.icon.translation_y < 0);
    expect("icon box still clips the bounce", !box.clip_to_allocation);

    await waitFor("the test window", () => app.get_n_windows() > 0, 10000);
    await this._parkPointer();
    await wait(700);
    expect("icon didn't land", icon.icon.translation_y === 0);
    expect("icon box clip wasn't restored", box.clip_to_allocation);
  }

  async _testMinimize() {
    const window = await this._testWindow();
    const icon = this._testIcon();

    try {
      await this._click(icon);
      await wait(300);
      expect("window wasn't minimized", window.minimized);

      await this._click(icon);
      await waitFor("the window to come back", () => !window.minimized);
    } finally {
      await this._parkPointer();
    }
  }

  async _testMinimizeOff() {
    const window = await this._testWindow();
    this._settings.set_boolean("click-minimize", false);
    try {
      await this._click(this._testIcon());
      await wait(300);
      expect("window was minimized anyway", !window.minimized);
    } finally {
      this._settings.reset("click-minimize");
      await this._parkPointer();
    }
  }

  async _testOverlapHides() {
    const window = await this._testWindow();
    await this._placeWindow(window, false);
    await waitFor("the dock to show", () => this._isDockShown());

    await this._placeWindow(window, true);
    await waitFor("the dock to hide", () => this._isDockHidden());
  }

  async _testReveal() {
    const window = await this._testWindow();
    await this._placeWindow(window, true);
    await waitFor("the dock to hide", () => this._isDockHidden());

    // Push well away from the dash, so the pointer doesn't hover it
    await this._pushBottomEdge(20);
    await waitFor("the dock to reveal", () => this._isDockShown(), 1000);

    // Unrelated window activity must not cancel the reveal. Without the fix
    // the dock starts hiding well within this wait.
    global.display.emit("restacked");
    await wait(200);
    expect("reveal was cancelled by a window event", this._isDockShown());

    await waitFor("the reveal to time out", () => this._isDockHidden(), 2000);
    await this._parkPointer();
  }

  async _testAutohideOff() {
    const window = await this._testWindow();
    await this._placeWindow(window, true);
    await waitFor("the dock to hide", () => this._isDockHidden());

    this._settings.set_boolean("autohide", false);
    try {
      await waitFor("the dock to show", () => this._isDockShown());
    } finally {
      this._settings.reset("autohide");
    }
    await waitFor("the dock to hide again", () => this._isDockHidden());
  }

  async _testMonitor() {
    const monitors = Main.layoutManager.monitors;
    expect("needs two monitors", monitors.length >= 2);
    const manager = global.backend.get_monitor_manager();
    const other = monitors.find(
      (m) => m.index !== Main.layoutManager.primaryIndex,
    );
    const connector = ["Virtual-1", "Virtual-2", "Meta-0", "Meta-1"].find(
      (name) => manager.get_monitor_for_connector(name) === other.index,
    );
    expect("couldn't find the second monitor's connector", connector);

    // A window over the old spot shouldn't matter once the dock has moved
    const window = await this._testWindow();
    await this._placeWindow(window, true);

    const box = this._dock._dockBox;
    this._settings.set_string("dock-monitor", connector);
    try {
      await waitFor("the dock to move", () => box.x === other.x);
      expect(
        "dock isn't on the second monitor's bottom edge",
        box.y + box.height === other.y + other.height,
      );
      await waitFor("the dock to show", () => this._isDockShown());
    } finally {
      this._settings.reset("dock-monitor");
    }
    const primary = Main.layoutManager.primaryMonitor;
    await waitFor("the dock to move back", () => box.x === primary.x);
  }

  async _testGlass() {
    const hasGlass = () => !!this._dock._glass?._glass?.get_stage();

    expect("glass is missing", hasGlass());
    this._settings.set_boolean("glass", false);
    try {
      await wait(100);
      expect("glass is still there", !hasGlass());
    } finally {
      this._settings.reset("glass");
    }
    await wait(100);
    expect("glass didn't come back", hasGlass());
  }

  async _testPrefs() {
    const isPrefs = (window) => window.get_title()?.includes("Raccoon Dock");
    Main.extensionManager.openExtensionPrefs(DOCK_UUID, "", {});
    await waitFor(
      "the preferences window",
      () => global.display.list_all_windows().some((window) => isPrefs(window)),
      15000,
    );
    for (const window of global.display.list_all_windows())
      if (isPrefs(window)) window.delete(global.get_current_time());
  }

  async _testDisable() {
    const controls = Main.overview._overview._controls;
    const dash = Main.overview.dash;

    Main.extensionManager.disableExtension(DOCK_UUID);
    await wait(300);
    expect(
      "dash wasn't returned to the overview",
      dash.get_parent() === controls,
    );
    expect("dash box still unclipped", dash._box.clip_to_allocation);

    Main.extensionManager.enableExtension(DOCK_UUID);
    await waitFor("the dock to come back", () =>
      this._dock?._dockBox?.get_stage(),
    );
  }

  // README screenshots: the dock at rest and magnified, over the wallpaper

  async _screenshots() {
    const dir = GLib.getenv("RACCOON_DOCK_SHOTS");
    this._settings.set_boolean("magnification", true);
    await waitFor("the dock to show", () => this._isDockShown());
    await this._parkPointer();
    await wait(1500);
    await this._shoot(`${dir}/dock.png`);

    const items = this._dock._magnification._getItems();
    const item = items[Math.floor(items.length / 2) - 1];
    const [x, y] = item.get_transformed_position();
    this._movePointer(x + item.width / 2, y + item.height / 2);
    await wait(800);
    await this._shoot(`${dir}/dock-magnified.png`);
    print("RDTEST PASS screenshots");
  }

  _shoot(path) {
    const dash = this._dock._dash;
    const monitor = this._dock._getMonitor();
    const [dashX] = dash.get_transformed_position();
    const margin = 120;
    const height = 260;
    const x = Math.max(monitor.x, Math.round(dashX) - margin);
    const width = Math.round(dash.width) + 2 * margin;
    const y = monitor.y + monitor.height - height;

    const stream = Gio.File.new_for_path(path).replace(
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null,
    );
    return new Promise((resolve, reject) => {
      new Shell.Screenshot().screenshot_area(
        x,
        y,
        width,
        height,
        stream,
        (screenshot, result) => {
          try {
            screenshot.screenshot_area_finish(result);
            resolve();
          } catch (e) {
            reject(e);
          } finally {
            stream.close(null);
          }
        },
      );
    });
  }
}
