import Gio from "gi://Gio";

// Swaps the app grid button's icon for a custom image
export class LauncherIconController {
  constructor(dash, file, settings) {
    this._icon = dash._showAppsIcon.icon;
    this._createIcon = this._icon.createIcon;
    this._settings = settings;

    const gicon = new Gio.FileIcon({ file });
    this._icon.createIcon = (size) => {
      const icon = this._createIcon(size);
      if (settings.get_boolean("custom-launcher-icon")) icon.gicon = gicon;
      return icon;
    };
    this._icon.update();

    settings.connectObject(
      "changed::custom-launcher-icon",
      () => this._icon.update(),
      this,
    );
  }

  destroy() {
    this._settings.disconnectObject(this);
    this._icon.createIcon = this._createIcon;
    this._icon.update();
    this._icon = null;
    this._createIcon = null;
    this._settings = null;
  }
}
