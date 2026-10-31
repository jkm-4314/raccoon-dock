import Clutter from "gi://Clutter";
import Cogl from "gi://Cogl";
import GObject from "gi://GObject";
import Shell from "gi://Shell";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const BLUR_RADIUS = 30;
const BLUR_BRIGHTNESS = 0.9;
const TINT_ALPHA = 0.45;

// The blurred area extends this far past the pill on each side, so its edges
// blur over real wallpaper instead of fading into transparency
const BLUR_MARGIN = BLUR_RADIUS;

const ROUNDED_DECLARATIONS = `
uniform vec2 size;
uniform float radius;
`;

// Signed distance to a rounded rectangle, used as an antialiased alpha mask
const ROUNDED_CODE = `
vec2 p = cogl_tex_coord_in[0].xy * size;
vec2 q = abs(p - 0.5 * size) - (0.5 * size - radius);
float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
cogl_color_out *= clamp(0.5 - d, 0.0, 1.0);
`;

const RoundedCornersEffect = GObject.registerClass(
  class RoundedCornersEffect extends Shell.GLSLEffect {
    _init(params) {
      super._init(params);
      this._sizeLocation = this.get_uniform_location("size");
      this._radiusLocation = this.get_uniform_location("radius");
    }

    vfunc_build_pipeline() {
      this.add_glsl_snippet(
        Cogl.SnippetHook.FRAGMENT,
        ROUNDED_DECLARATIONS,
        ROUNDED_CODE,
        false,
      );
    }

    setGeometry(width, height, radius) {
      this.set_uniform_float(this._sizeLocation, 2, [width, height]);
      this.set_uniform_float(this._radiusLocation, 1, [radius]);
      this.queue_repaint();
    }
  },
);

// Lays out the blurred wallpaper inside the glass. Doing it here, during
// allocation, avoids resizing actors from allocation signals, which would
// queue another relayout of the dash every frame.
const GlassActor = GObject.registerClass(
  class GlassActor extends Clutter.Actor {
    _init(params) {
      super._init(params);

      this._blurBox = new Clutter.Actor({ clip_to_allocation: true });
      this._blurBox.add_effect(
        new Shell.BlurEffect({
          mode: Shell.BlurMode.ACTOR,
          radius: BLUR_RADIUS,
          brightness: BLUR_BRIGHTNESS,
        }),
      );
      this._clone = new Clutter.Clone({
        source: Main.layoutManager._backgroundGroup,
      });
      this._blurBox.add_child(this._clone);
      this.add_child(this._blurBox);

      this.corners = new RoundedCornersEffect();
      this.add_effect(this.corners);
      this.radius = 0;
    }

    // Its own size stays 0, so it never affects the dash's size
    vfunc_get_preferred_width() {
      return [0, 0];
    }

    vfunc_get_preferred_height() {
      return [0, 0];
    }

    vfunc_allocate(box) {
      this.set_allocation(box);
      const width = box.get_width();
      const height = box.get_height();

      const blurBox = new Clutter.ActorBox();
      blurBox.set_origin(-BLUR_MARGIN, -BLUR_MARGIN);
      blurBox.set_size(width + 2 * BLUR_MARGIN, height + 2 * BLUR_MARGIN);
      this._blurBox.allocate(blurBox);

      const [cloneWidth, cloneHeight] = this._clone.get_preferred_size();
      const cloneBox = new Clutter.ActorBox();
      cloneBox.set_size(cloneWidth, cloneHeight);
      this._clone.allocate(cloneBox);

      this.corners.setGeometry(width, height, this.radius);
      this.alignWallpaper();
    }

    // Shifts the clone so the wallpaper lines up with the real one on screen.
    // Only a translation, so it can follow the dock's slide without relayouts.
    alignWallpaper() {
      const [x, y] = this.get_transformed_position();
      this._clone.translation_x = Math.round(BLUR_MARGIN - x);
      this._clone.translation_y = Math.round(BLUR_MARGIN - y);
    }
  },
);

// Frosted glass behind the dash: a blurred copy of the wallpaper, lined up
// with the real one, under a translucent tint of the theme's dash colour.
// Shell.BlurEffect can't round corners or sample live content from inside the
// dash (which paints offscreen), so this blurs a clone of the background group.
export class GlassController {
  constructor(dash, dockBox, settings) {
    this._dash = dash;
    this._dockBox = dockBox;
    this._settings = settings;
    this._glass = null;

    settings.connectObject("changed::glass", () => this._sync(), this);
    this._sync();
  }

  _sync() {
    if (this._settings.get_boolean("glass")) this._build();
    else this._teardown();
  }

  _build() {
    if (this._glass) return;

    const background = this._dash._background;
    const node = background.get_theme_node();
    const color = node.get_background_color();

    this._origStyle = background.get_style();
    background.set_style(
      `background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${TINT_ALPHA});` +
        "box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);",
    );

    // Sits right under the background, matching its box
    this._glass = new GlassActor({
      name: "native-dock-glass",
      clip_to_allocation: true,
    });
    this._glass.radius = node.get_border_radius(St.Corner.TOPLEFT);
    this._glass.add_constraint(
      new Clutter.BindConstraint({
        source: background,
        coordinate: Clutter.BindCoordinate.ALL,
      }),
    );
    this._dash.insert_child_below(this._glass, background);

    this._dockBox.connectObject(
      "notify::translation-y",
      () => this._glass.alignWallpaper(),
      this,
    );
  }

  _teardown() {
    if (!this._glass) return;

    this._dockBox.disconnectObject(this);
    this._glass.destroy();
    this._glass = null;

    this._dash._background.set_style(this._origStyle);
    this._origStyle = null;
  }

  destroy() {
    this._settings.disconnectObject(this);
    this._teardown();
    this._dash = null;
    this._dockBox = null;
    this._settings = null;
  }
}
