// Lets the dock stay put instead of hiding when a window overlaps it.
// Fullscreen windows still cover it, since the shell hides chrome for them.
export class AutohideController {
  constructor(extension, settings) {
    this._extension = extension;
    this._settings = settings;

    const shouldHide = extension._shouldHideForFocusedWindow;
    extension._shouldHideForFocusedWindow = function () {
      if (!settings.get_boolean("autohide")) return false;
      return shouldHide.call(this);
    };

    settings.connectObject(
      "changed::autohide",
      () => extension._onFocusWindowChangedDelayed(),
      this,
    );
  }

  destroy() {
    this._settings.disconnectObject(this);
    delete this._extension._shouldHideForFocusedWindow;
    this._extension = null;
    this._settings = null;
  }
}
