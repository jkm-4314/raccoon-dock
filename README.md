# Raccoon Dock

A small, macOS-style dock for GNOME, built from GNOME Shell's own Dash.

Raccoon Dock puts the Dash you already know from the Activities overview on your
desktop: the same pinned apps, running indicators and app grid button. On top of
that it adds a short list of carefully chosen options: smaller icons,
magnification, a frosted glass background and control over auto-hide.

It's named after Ubuntu 26.04 "Resolute Raccoon", the release it was born on.

<!-- screenshot: the dock at rest and magnified -->

## Features

- **The real Dash.** No rebuilt dock. Your favorites, running apps and the
  app grid button behave exactly as they do in the overview.
- **Icon size.** Any size from 16 to 96 px. Icons still shrink if too many are open to fit.
- **Magnification.** Icons swell under the pointer and the dock grows evenly from
  its center, like on macOS. Icons stay sharp at full size.
- **Frosted glass.** A translucent, blurred background tinted to match your theme.
- **Raccoon app grid icon.** Swap the grid for the raccoon, or keep the grid.
- **Auto-hide, your way.** By default the dock steps aside for maximized, tiled
  and overlapping windows, and comes back when you push the pointer against the
  bottom edge. You choose how hard that push is, or turn auto-hide off entirely.
- **Smooth with the overview.** The dock follows overview transitions and
  touchpad gestures one-to-one.

## Preferences

| Setting | What it does |
|---|---|
| Icon Size | Largest icon size in the dock |
| Raccoon App Grid Icon | Raccoon or the standard grid on the app grid button |
| Glass Background | Frosted glass or the theme's solid color |
| Auto-Hide | Hide when a window overlaps the dock (fullscreen always hides it) |
| Reveal Pressure | How hard to push against the bottom edge to show a hidden dock |
| Magnify Icons / Magnified Size | Turn magnification on and set the size of the icon under the pointer |

## Installation

1. Clone the `jkm` branch into your extensions folder:
   ```bash
   git clone -b jkm https://github.com/jkm-4314/native-dock.git \
     ~/.local/share/gnome-shell/extensions/raccoon-dock@jkm-4314.github.io
   ```
2. Compile the settings schema:
   ```bash
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/raccoon-dock@jkm-4314.github.io/schemas/
   ```
3. Log out and back in (GNOME on Wayland only discovers new extensions at login).
4. Enable it:
   ```bash
   gnome-extensions enable raccoon-dock@jkm-4314.github.io
   ```

Turn off Ubuntu Dock, Dash to Dock or Native Dock first, since they all take over the Dash.

## Requirements

GNOME Shell 50 or 51 on Wayland. Developed and tested on Ubuntu 26.04 with GNOME 50.

## Known limitations

- The glass blurs your wallpaper, not windows behind the dock.

## Credits

Raccoon Dock was inspired by [Native Dock](https://github.com/DEM0NAssissan7/native-dock)
by DEM0NAssissan7, and started as a fork of it. Native Dock does the hard work of
turning the Dash into a dock. If you'd rather have the original zero-configuration
experience, use Native Dock. Fixes that suit the original are contributed back upstream.

The Resolute Raccoon artwork is by [Josh McFall](https://github.com/jkm-4314).

Raccoon Dock is an independent project and isn't affiliated with Canonical or Ubuntu.

## License

GPL-3.0-or-later
