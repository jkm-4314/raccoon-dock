import Clutter from "gi://Clutter";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { AppIcon } from "resource:///org/gnome/shell/ui/appDisplay.js";

// Clicking the dock icon of the app in front minimizes its windows, so the
// same click that brought an app up can put it away again.
export class ClickMinimizeController {
  constructor(dash, settings) {
    this._dash = dash;
    this._settings = settings;

    const controller = this;
    const activate = AppIcon.prototype.activate;
    this._activate = activate;
    AppIcon.prototype.activate = function (button) {
      if (controller._shouldMinimize(this, button))
        controller._minimize(this.app);
      else activate.call(this, button);
    };
  }

  _shouldMinimize(appIcon, button) {
    if (!this._settings.get_boolean("click-minimize")) return false;
    if (Main.overview.visible || !this._dash._box.contains(appIcon))
      return false;

    // Middle and Ctrl clicks open a new window, as usual
    if (button && button !== Clutter.BUTTON_PRIMARY) return false;
    const event = Clutter.get_current_event();
    const modifiers = event ? event.get_state() : 0;
    if (modifiers & Clutter.ModifierType.CONTROL_MASK) return false;

    const focus = global.display.focus_window;
    if (!focus || focus.minimized) return false;
    const tracker = Shell.WindowTracker.get_default();
    return tracker.get_window_app(focus) === appIcon.app;
  }

  _minimize(app) {
    const workspace = global.workspace_manager.get_active_workspace();
    for (const window of app.get_windows()) {
      if (window.located_on_workspace(workspace) && !window.skip_taskbar)
        window.minimize();
    }
  }

  destroy() {
    AppIcon.prototype.activate = this._activate;
    this._activate = null;
    this._dash = null;
    this._settings = null;
  }
}
