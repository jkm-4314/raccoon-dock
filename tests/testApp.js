// A plain window for the tests to launch, focus, move and minimize
import Gtk from "gi://Gtk?version=4.0";
import System from "system";

const app = new Gtk.Application({
  application_id: "io.github.jkm_4314.RaccoonDockTest",
});
app.connect("activate", () => {
  new Gtk.ApplicationWindow({
    application: app,
    title: "Raccoon Dock Test",
    default_width: 640,
    default_height: 400,
  }).present();
});
app.runAsync([System.programInvocationName, ...System.programArgs]);
