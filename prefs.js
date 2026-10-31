import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class NativeDockPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    window._settings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "preferences-system-symbolic",
    });

    const appearance = new Adw.PreferencesGroup({
      title: "Appearance",
    });
    appearance.add(this._createIconSizeRow(window._settings));
    page.add(appearance);

    window.add(page);
  }

  _createIconSizeRow(settings) {
    const key = settings.settings_schema.get_key("icon-size");
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
      draw_value: true,
      value_pos: Gtk.PositionType.RIGHT,
      hexpand: true,
      width_request: 260,
      valign: Gtk.Align.CENTER,
    });
    scale.set_format_value_func((_scale, value) => `${value} px`);
    for (const mark of [32, 48, 64]) {
      if (mark > min && mark < max)
        scale.add_mark(mark, Gtk.PositionType.BOTTOM, null);
    }

    settings.bind(
      "icon-size",
      scale.adjustment,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const row = new Adw.ActionRow({
      title: "Icon Size",
      subtitle: "Icons shrink further if there are too many to fit",
      activatable_widget: scale,
    });
    row.add_suffix(scale);

    const reset = new Gtk.Button({
      icon_name: "edit-undo-symbolic",
      tooltip_text: "Reset to Default",
      valign: Gtk.Align.CENTER,
      css_classes: ["flat"],
    });
    reset.connect("clicked", () => settings.reset("icon-size"));
    const syncReset = () => {
      reset.sensitive = settings.get_user_value("icon-size") !== null;
    };
    settings.connect("changed::icon-size", syncReset);
    syncReset();
    row.add_suffix(reset);

    return row;
  }
}
