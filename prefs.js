import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class NativeDockPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    window._settings = this.getSettings();
    const settings = window._settings;

    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "preferences-system-symbolic",
    });

    const appearance = new Adw.PreferencesGroup({
      title: "Appearance",
    });
    appearance.add(
      this._createSliderRow(settings, "icon-size", {
        title: "Icon Size",
        subtitle: "Icons shrink further if there are too many to fit",
        marks: [32, 48, 64],
      }),
    );
    const launcherIconSwitch = new Adw.SwitchRow({
      title: "Raccoon App Grid Icon",
      subtitle: "Show the raccoon instead of the grid on the app grid button",
    });
    settings.bind(
      "custom-launcher-icon",
      launcherIconSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    appearance.add(launcherIconSwitch);
    const glassSwitch = new Adw.SwitchRow({
      title: "Glass Background",
      subtitle: "Translucent frosted glass over a blurred wallpaper",
    });
    settings.bind(
      "glass",
      glassSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    appearance.add(glassSwitch);
    page.add(appearance);

    const behavior = new Adw.PreferencesGroup({
      title: "Behavior",
    });
    behavior.add(this._createMonitorRow(settings));

    const autohideSwitch = new Adw.SwitchRow({
      title: "Auto-Hide",
      subtitle:
        "Hide the dock when a window overlaps it. Push the pointer against the bottom edge to reveal it.",
    });
    settings.bind(
      "autohide",
      autohideSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behavior.add(autohideSwitch);

    const pressureRow = this._createSliderRow(settings, "reveal-pressure", {
      title: "Reveal Pressure",
      subtitle:
        "How hard to push against the bottom edge to show a hidden dock",
      marks: [
        [10, "Light"],
        [100, "Default"],
        [300, "Firm"],
      ],
      unit: null,
    });
    settings.bind(
      "autohide",
      pressureRow,
      "sensitive",
      Gio.SettingsBindFlags.GET,
    );
    behavior.add(pressureRow);

    const clickMinimizeSwitch = new Adw.SwitchRow({
      title: "Click to Minimize",
      subtitle: "Clicking the app in front minimizes its windows",
    });
    settings.bind(
      "click-minimize",
      clickMinimizeSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behavior.add(clickMinimizeSwitch);

    const launchBounceSwitch = new Adw.SwitchRow({
      title: "Bounce While Launching",
      subtitle: "Bounce an app's icon until its window opens",
    });
    settings.bind(
      "launch-bounce",
      launchBounceSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behavior.add(launchBounceSwitch);
    page.add(behavior);

    const magnification = new Adw.PreferencesGroup({
      title: "Magnification",
    });
    const magnificationSwitch = new Adw.SwitchRow({
      title: "Magnify Icons",
      subtitle: "Enlarge icons under the pointer",
    });
    settings.bind(
      "magnification",
      magnificationSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    magnification.add(magnificationSwitch);

    const magnifiedSizeRow = this._createSliderRow(
      settings,
      "magnification-size",
      {
        title: "Magnified Size",
        subtitle: "Size of the icon under the pointer",
        marks: [64, 96, 128],
      },
    );
    settings.bind(
      "magnification",
      magnifiedSizeRow,
      "sensitive",
      Gio.SettingsBindFlags.GET,
    );
    magnification.add(magnifiedSizeRow);
    page.add(magnification);

    window.add(page);
  }

  // Lists the connected monitors, plus the saved one if it's unplugged, so
  // the choice survives a laptop being undocked.
  _createMonitorRow(settings) {
    const connectors = [""];
    const labels = ["Primary Monitor"];
    const monitors = Gdk.Display.get_default().get_monitors();
    for (let i = 0; i < monitors.get_n_items(); i++) {
      const monitor = monitors.get_item(i);
      const connector = monitor.get_connector();
      if (!connector) continue;
      const name = monitor.get_description() || monitor.get_model();
      connectors.push(connector);
      labels.push(name ? `${name} (${connector})` : connector);
    }
    const saved = settings.get_string("dock-monitor");
    if (!connectors.includes(saved)) {
      connectors.push(saved);
      labels.push(`${saved} (not connected)`);
    }

    const row = new Adw.ComboRow({
      title: "Monitor",
      subtitle: "Which screen shows the dock",
      model: Gtk.StringList.new(labels),
    });
    const sync = () => {
      const index = connectors.indexOf(settings.get_string("dock-monitor"));
      if (index >= 0) row.selected = index;
    };
    sync();
    settings.connect("changed::dock-monitor", sync);
    row.connect("notify::selected", () => {
      const connector = connectors[row.selected] ?? "";
      if (connector !== settings.get_string("dock-monitor"))
        settings.set_string("dock-monitor", connector);
    });
    return row;
  }

  // marks are values, or [value, label] pairs. Without a unit, the slider
  // shows only its marks, for settings where the number means little.
  _createSliderRow(settings, keyName, { title, subtitle, marks, unit = "px" }) {
    const key = settings.settings_schema.get_key(keyName);
    const [, range] = key.get_range().recursiveUnpack();
    const [min, max] = range;

    const scale = new Gtk.Scale({
      orientation: Gtk.Orientation.HORIZONTAL,
      adjustment: new Gtk.Adjustment({
        lower: min,
        upper: max,
        step_increment: 1,
        page_increment: 8,
      }),
      digits: 0,
      round_digits: 0,
      draw_value: unit !== null,
      value_pos: Gtk.PositionType.RIGHT,
      hexpand: true,
      width_request: 260,
      valign: Gtk.Align.CENTER,
    });
    if (unit !== null)
      scale.set_format_value_func((_scale, value) => `${value} ${unit}`);
    for (const mark of marks) {
      const [value, label] = Array.isArray(mark) ? mark : [mark, null];
      if (value >= min && value <= max)
        scale.add_mark(value, Gtk.PositionType.BOTTOM, label);
    }

    settings.bind(
      keyName,
      scale.adjustment,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const row = new Adw.ActionRow({
      title,
      subtitle,
      activatable_widget: scale,
    });
    row.add_suffix(scale);

    const reset = new Gtk.Button({
      icon_name: "edit-undo-symbolic",
      tooltip_text: "Reset to Default",
      valign: Gtk.Align.CENTER,
      css_classes: ["flat"],
    });
    reset.connect("clicked", () => settings.reset(keyName));
    const syncReset = () => {
      reset.sensitive = settings.get_user_value(keyName) !== null;
    };
    settings.connect(`changed::${keyName}`, syncReset);
    syncReset();
    row.add_suffix(reset);

    return row;
  }
}
