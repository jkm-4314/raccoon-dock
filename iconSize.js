import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { DASH_ANIMATION_TIME } from "resource:///org/gnome/shell/ui/dash.js";

// Lets the dash use any icon size up to the "icon-size" setting, instead of
// the shell's fixed steps (64/48/32/22/16). Mirrors Dash._adjustIconSize.
export class IconSizeController {
  constructor(dash, settings) {
    this._dash = dash;
    this._settings = settings;

    const controller = this;
    this._dash._adjustIconSize = function () {
      controller._adjustIconSize();
    };

    this._settings.connectObject(
      "changed::icon-size",
      () => this._dash._queueRedisplay(),
      this,
    );
    this._dash._queueRedisplay();
  }

  _adjustIconSize() {
    const dash = this._dash;

    // Only proper icons count, not drag placeholders or icons animating out
    const iconChildren = dash._box.get_children().filter((actor) => {
      return actor.child?._delegate?.icon && !actor.animatingOut;
    });
    iconChildren.push(dash._showAppsIcon);

    if (dash._maxWidth === -1 || dash._maxHeight === -1) return;

    const themeNode = dash.get_theme_node();
    const maxAllocation = new Clutter.ActorBox({
      x1: 0,
      y1: 0,
      x2: dash._maxWidth,
      y2: 42,
    });
    const maxContent = themeNode.get_content_box(maxAllocation);
    let availWidth = maxContent.x2 - maxContent.x1;
    const spacing = themeNode.get_length("spacing");

    const firstButton = iconChildren[0].child;
    const firstIcon = firstButton._delegate.icon;

    firstIcon.icon.ensure_style();
    const [, , iconWidth, iconHeight] = firstIcon.icon.get_preferred_size();
    const [, , buttonWidth, buttonHeight] = firstButton.get_preferred_size();

    availWidth -=
      iconChildren.length * (buttonWidth - iconWidth) +
      (iconChildren.length - 1) * spacing;

    let availHeight = dash._maxHeight;
    availHeight -= dash.margin_top + dash.margin_bottom;
    availHeight -= dash._background.get_theme_node().get_vertical_padding();
    availHeight -= themeNode.get_vertical_padding();
    availHeight -= buttonHeight - iconHeight;

    // Theme lengths are in physical pixels, icon sizes in logical pixels
    const scaleFactor = St.ThemeContext.get_for_stage(
      global.stage,
    ).scale_factor;
    const fitSize = Math.floor(
      Math.min(availWidth / iconChildren.length, availHeight) / scaleFactor,
    );
    const newIconSize = Math.max(
      Main.smallestIconSize,
      Math.min(this._settings.get_int("icon-size"), fitSize),
    );

    if (newIconSize === dash.iconSize) return;

    const oldIconSize = dash.iconSize;
    dash.iconSize = newIconSize;
    dash.emit("icon-size-changed");

    const animate =
      Main.overview.visible &&
      !Main.overview.animationInProgress &&
      dash._shownInitially;
    const scale = oldIconSize / newIconSize;

    for (const child of iconChildren) {
      const icon = child.child._delegate.icon;
      icon.setIconSize(newIconSize);

      if (!animate) continue;

      const [targetWidth, targetHeight] = icon.icon.get_size();
      icon.icon.set_size(icon.icon.width * scale, icon.icon.height * scale);
      icon.icon.ease({
        width: targetWidth,
        height: targetHeight,
        duration: DASH_ANIMATION_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }

    if (dash._separator) {
      dash._separator.ease({
        height: newIconSize,
        duration: animate ? DASH_ANIMATION_TIME : 0,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
  }

  destroy() {
    this._settings.disconnectObject(this);

    // Fall back to the shell's own sizing
    delete this._dash._adjustIconSize;
    this._dash._queueRedisplay();

    this._dash = null;
    this._settings = null;
  }
}
