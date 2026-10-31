import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Shell from "gi://Shell";
import { AppIcon } from "resource:///org/gnome/shell/ui/appDisplay.js";
import { holdUnclipped, releaseUnclipped } from "./boxClip.js";

// Time for one hop up or back down, in milliseconds
const HOP_TIME = 280;

// How high the icon hops, as a share of the icon size
const HOP_HEIGHT = 0.4;

// Gives up on apps that never open a window
const MAX_BOUNCE_TIME = 15000;

// Bounces a dock icon while its app starts, instead of the zoom the shell
// plays elsewhere, until the app opens a new window.
export class LaunchBounceController {
  constructor(dash, settings) {
    this._dash = dash;
    this._settings = settings;
    this._bounces = new Map();

    const controller = this;
    const animateLaunch = AppIcon.prototype.animateLaunch;
    this._animateLaunch = animateLaunch;
    AppIcon.prototype.animateLaunch = function () {
      if (controller._isDockIcon(this) && settings.get_boolean("launch-bounce"))
        controller._start(this);
      else animateLaunch.call(this);
    };
  }

  _isDockIcon(appIcon) {
    return this._dash._box.contains(appIcon);
  }

  _start(appIcon) {
    if (this._bounces.has(appIcon)) return;

    const app = appIcon.app;
    const windows = app.get_n_windows();
    const bounce = {
      appIcon,
      // Hop the icon inside the tile, so the running dot stays put
      actor: appIcon.icon,
      timeoutId: GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        MAX_BOUNCE_TIME,
        () => {
          bounce.timeoutId = 0;
          this._stop(appIcon);
          return GLib.SOURCE_REMOVE;
        },
      ),
    };
    this._bounces.set(appIcon, bounce);

    app.connectObject(
      "windows-changed",
      () => {
        if (app.get_n_windows() > windows) this._stop(appIcon);
      },
      "notify::state",
      () => {
        if (app.state === Shell.AppState.STOPPED) this._stop(appIcon);
      },
      this,
    );
    appIcon.connectObject("destroy", () => this._stop(appIcon, false), this);

    holdUnclipped(this._dash._box, this);
    this._hop(bounce);
  }

  _hop(bounce) {
    const height = Math.round(this._dash.iconSize * HOP_HEIGHT);
    bounce.actor.ease({
      translation_y: -height,
      duration: HOP_TIME,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onStopped: (isFinished) => {
        if (!isFinished) return;
        bounce.actor.ease({
          translation_y: 0,
          duration: HOP_TIME,
          mode: Clutter.AnimationMode.EASE_IN_QUAD,
          onStopped: (landed) => {
            if (landed && this._bounces.get(bounce.appIcon) === bounce)
              this._hop(bounce);
          },
        });
      },
    });
  }

  _stop(appIcon, animate = true) {
    const bounce = this._bounces.get(appIcon);
    if (!bounce) return;

    this._bounces.delete(appIcon);
    if (bounce.timeoutId) GLib.source_remove(bounce.timeoutId);
    appIcon.app.disconnectObject(this);
    appIcon.disconnectObject(this);

    bounce.actor.remove_all_transitions();
    if (!animate) {
      bounce.actor.translation_y = 0;
      this._releaseClip();
      return;
    }

    // Let the icon drop back down instead of snapping
    bounce.actor.ease({
      translation_y: 0,
      duration: HOP_TIME,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onStopped: () => this._releaseClip(),
    });
  }

  _releaseClip() {
    if (this._dash && this._bounces.size === 0)
      releaseUnclipped(this._dash._box, this);
  }

  destroy() {
    AppIcon.prototype.animateLaunch = this._animateLaunch;
    this._animateLaunch = null;

    for (const appIcon of [...this._bounces.keys()]) this._stop(appIcon, false);
    this._dash = null;
    this._settings = null;
  }
}
