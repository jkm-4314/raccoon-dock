import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { DashItemContainer } from "resource:///org/gnome/shell/ui/dash.js";
import { holdUnclipped, releaseUnclipped } from "./boxClip.js";

const ENTER_TIME = 120;
const LEAVE_TIME = 200;

// How far the effect reaches on each side of the pointer, in item widths
const SPREAD = 2.5;

// macOS-style magnification. Icons are scaled and pushed apart with transforms
// only, so the dash never relayouts while the pointer moves over it.
export class MagnificationController {
  constructor(dash, settings) {
    this._dash = dash;
    this._settings = settings;
    this._pointerX = null;
    this._target = 0;
    this._dragging = false;

    // Eased between 0 (at rest) and 1 (fully magnified)
    this._strength = new St.Adjustment({
      actor: dash,
      lower: 0,
      upper: 1,
      value: 0,
    });
    this._strength.connectObject("notify::value", () => this._update(), this);

    // Keeps the area above the dock in the input region while magnified, so
    // the top of a big icon still belongs to the dash instead of the window
    // behind it.
    this._zone = new St.Widget({ name: "raccoon-dock-magnification-zone" });
    Main.layoutManager.addTopChrome(this._zone);

    dash.connectObject(
      "motion-event",
      (_actor, event) => {
        this._onMotion(event);
        return Clutter.EVENT_PROPAGATE;
      },
      "notify::hover",
      () => {
        if (!dash.hover) this._end();
      },
      this,
    );

    Main.overview.connectObject(
      "item-drag-begin",
      () => {
        this._dragging = true;
        this._end(true);
      },
      "item-drag-end",
      () => (this._dragging = false),
      "item-drag-cancelled",
      () => (this._dragging = false),
      this,
    );

    settings.connectObject(
      "changed",
      () => this._end(true),
      "changed::magnification",
      () => {
        this._syncStyle();
        this._updateSharpIcons();
      },
      "changed::magnification-size",
      () => this._updateSharpIcons(),
      this,
    );

    // Load icon images at the magnified size so they stay sharp when scaled
    // up. Maps each sharpened BaseIcon to its original createIcon.
    this._sharpIcons = new Map();
    for (const item of this._getItems()) this._sharpen(item);
    this._syncStyle();
    dash._box.connectObject(
      "child-added",
      (_box, item) => this._sharpen(item),
      this,
    );

    // Labels are placed from the resting item, so move them above the
    // magnified icon instead
    const controller = this;
    this._origShowLabel = DashItemContainer.prototype.showLabel;
    DashItemContainer.prototype.showLabel = function () {
      controller._origShowLabel.call(this);
      if (controller._strength.value > 0 && controller._ownsItem(this))
        controller._placeLabel(this);
    };
  }

  _getRenderSize(size) {
    if (!this._settings.get_boolean("magnification")) return size;
    return Math.max(size, this._settings.get_int("magnification-size"));
  }

  _sharpen(item) {
    const icon = item.child?._delegate?.icon;
    if (!icon?.update || !Object.hasOwn(icon, "createIcon")) return;
    if (this._sharpIcons.has(icon)) return;

    const createIcon = icon.createIcon;
    this._sharpIcons.set(icon, createIcon);

    // The image is loaded at the render size, but the icon is pinned to the
    // requested size, so the layout doesn't change
    icon.createIcon = (size) => {
      const renderSize = this._getRenderSize(size);
      const texture = createIcon.call(icon, renderSize);
      if (renderSize !== size) texture.set_size(size, size);
      return texture;
    };
    icon.connectObject("destroy", () => this._sharpIcons.delete(icon), this);
    icon.update();
  }

  // Lets stylesheet.css drop the tiles behind icons while magnifying
  _syncStyle() {
    if (this._settings.get_boolean("magnification"))
      this._dash.add_style_class_name("raccoon-dock-magnify");
    else this._dash.remove_style_class_name("raccoon-dock-magnify");
  }

  _updateSharpIcons() {
    for (const icon of this._sharpIcons.keys()) icon.update();
  }

  _isEnabled() {
    return (
      this._settings.get_boolean("magnification") &&
      this._getMaxScale() > 1 &&
      !this._dragging
    );
  }

  _getMaxScale() {
    return this._settings.get_int("magnification-size") / this._dash.iconSize;
  }

  _ownsItem(item) {
    return (
      item.get_parent() === this._dash._box || item === this._dash._showAppsIcon
    );
  }

  _getItems() {
    const items = this._dash._box
      .get_children()
      .filter((item) => !item.animatingOut);
    items.push(this._dash._showAppsIcon);
    return items;
  }

  _onMotion(event) {
    if (!this._isEnabled()) return;

    [this._pointerX] = event.get_coords();

    if (this._target !== 1) {
      this._target = 1;
      this._syncZone();
      this._strength.ease(1, {
        duration: ENTER_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
    this._update();
  }

  _end(immediate = false) {
    if (this._target === 0 && !immediate) return;

    this._target = 0;
    this._strength.remove_transition("value");
    if (immediate || this._strength.value === 0) {
      this._strength.value = 0;
      this._update();
      return;
    }
    this._strength.ease(0, {
      duration: LEAVE_TIME,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
  }

  _update() {
    const strength = this._strength.value;
    const items = this._getItems();

    if (strength === 0 || this._pointerX === null) {
      this._reset(items);
      this._syncZone();
      return;
    }

    const p = this._pointerX;
    const maxScale = Math.max(1, this._getMaxScale());

    // The icon box clips to its resting size, which would cut off icons
    // that grow upwards or get pushed past its ends
    holdUnclipped(this._dash._box, this);

    // Resting geometry, in stage coordinates
    const geometry = items.map((item) => {
      const [x] = item.get_transformed_position();
      return { item, x, width: item.allocation.get_width() };
    });
    const reach = SPREAD * (geometry[0]?.width || 1);

    // Each icon's scale falls off smoothly with distance from the pointer.
    // "extra" is how much wider it gets. Only the icon itself counts, not the
    // padding around it, so magnified icons keep their resting gaps.
    let total = 0;
    for (const g of geometry) {
      const distance = Math.abs(p - (g.x + g.width / 2)) / reach;
      const falloff = distance < 1 ? (Math.cos(Math.PI * distance) + 1) / 2 : 0;
      g.scale = g.item.child ? 1 + (maxScale - 1) * falloff * strength : 1;
      g.extra = this._dash.iconSize * (g.scale - 1);
      total += g.extra;
    }

    // Spread the row evenly from the middle so the dock stays centered
    let before = 0;
    for (const g of geometry) {
      const shift = before + g.extra / 2 - total / 2;
      before += g.extra;

      const child = g.item.child;
      if (child) {
        child.pivot_point = new Graphene.Point({ x: 0.5, y: 1 });
        child.scale_x = g.scale;
        child.scale_y = g.scale;
        child.translation_x = shift;
      } else {
        // The separator has no child and never scales
        g.item.translation_x = shift;
      }

      if (g.item.label?.visible) this._placeLabel(g.item);
    }

    // Widen the background to match. Setting its width (rather than scaling
    // it) keeps the rounded corners intact; the dash is centered in the dock,
    // so it grows equally on both sides.
    const background = this._dash._background;
    background.width =
      this._dash._dashContainer.width +
      background.get_theme_node().get_horizontal_padding() +
      Math.round(total / 2) * 2;
  }

  _reset(items) {
    for (const item of items) {
      const target = item.child ?? item;
      target.scale_x = 1;
      target.scale_y = 1;
      target.translation_x = 0;
    }
    this._dash._background.width = -1;
    releaseUnclipped(this._dash._box, this);
  }

  _placeLabel(item) {
    const label = item.label;
    const child = item.child;
    if (!label || !child) return;

    const [childX, childY] = child.get_transformed_position();
    const [childWidth] = child.get_transformed_size();
    const yOffset = label.get_theme_node().get_length("-y-offset");

    const x = Math.clamp(
      Math.floor(childX + (childWidth - label.width) / 2),
      0,
      global.stage.width - label.width,
    );
    label.set_position(x, Math.floor(childY - label.height - yOffset));
  }

  _syncZone() {
    if (this._target === 0 && this._strength.value === 0) {
      this._zone.set_size(0, 0);
      return;
    }

    const monitor = Main.layoutManager.findMonitorForActor(this._dash);
    const [, dashY] = this._dash.get_transformed_position();
    const height = Math.ceil(
      (this._getMaxScale() - 1) * this._dash.iconSize * 1.25,
    );
    this._zone.set_position(monitor.x, dashY - height);
    this._zone.set_size(monitor.width, Math.max(0, height));
  }

  destroy() {
    DashItemContainer.prototype.showLabel = this._origShowLabel;
    this._origShowLabel = null;

    this._settings.disconnectObject(this);
    Main.overview.disconnectObject(this);
    this._dash.disconnectObject(this);

    this._strength.disconnectObject(this);
    this._strength.remove_transition("value");
    this._reset(this._getItems());

    this._dash._box.disconnectObject(this);
    for (const [icon, createIcon] of this._sharpIcons) {
      icon.disconnectObject(this);
      icon.createIcon = createIcon;
      icon.update();
    }
    this._sharpIcons.clear();
    this._dash.remove_style_class_name("raccoon-dock-magnify");

    Main.layoutManager.removeChrome(this._zone);
    this._zone.destroy();
    this._zone = null;

    this._dash = null;
    this._settings = null;
  }
}
