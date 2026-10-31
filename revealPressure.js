// Sets how hard the pointer has to push against the bottom edge to reveal a
// hidden dock. The shell's PressureBarrier reads its threshold on every push,
// so changes apply right away.
export class RevealPressureController {
  constructor(extension, settings) {
    this._extension = extension;
    this._settings = settings;

    const controller = this;
    const initBarrier = extension._initBarrier;
    extension._initBarrier = function () {
      initBarrier.call(this);
      controller._apply();
    };

    settings.connectObject(
      "changed::reveal-pressure",
      () => this._apply(),
      this,
    );
    this._apply();
  }

  _apply() {
    const barrier = this._extension._pressureBarrier;
    if (barrier) barrier._threshold = this._settings.get_int("reveal-pressure");
  }

  destroy() {
    this._settings.disconnectObject(this);
    delete this._extension._initBarrier;
    this._extension = null;
    this._settings = null;
  }
}
