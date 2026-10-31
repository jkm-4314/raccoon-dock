import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Which monitor the dock lives on. Remembered by connector name (like
// "HDMI-1") since monitor numbers change as screens come and go. Falls back
// to the primary monitor when the chosen one isn't connected.
export class MonitorChoiceController {
  constructor(extension, settings) {
    this._settings = settings;

    settings.connectObject(
      "changed::dock-monitor",
      () => {
        extension._updatePosition();
        extension._onFocusWindowChangedDelayed();
      },
      this,
    );
  }

  get index() {
    const connector = this._settings.get_string("dock-monitor");
    if (connector) {
      const manager = global.backend.get_monitor_manager();
      const index = manager.get_monitor_for_connector(connector);
      if (index >= 0 && index < Main.layoutManager.monitors.length)
        return index;
    }
    return Main.layoutManager.primaryIndex;
  }

  destroy() {
    this._settings.disconnectObject(this);
    this._settings = null;
  }
}
