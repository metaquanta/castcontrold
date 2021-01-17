# castcontrold
### The Chromecast's missing controller

**castcontrold** can pause, seek, and adjust the volume of your Chromecast when playing any content with support for the `urn:x-cast:com.google.cast.media` namespace.¹ 
It's fast too. Requests to adjust the volume complete the round trip in under 20ms. 
Resume and seek usually copmlete in well under half a second.² 

Once you start `castcontrold` in the background, it will quietly note your Chromecast's status, ready to:

- Pause
- Resume
- Stop
- Seek
- Change volume

at a moments notice. Regardless of the state of the sender app.

**castcontrold** can not locate Chromecasts via the `_googlecast._tcp` mDNS service. 
It must be provided an IP address. 
`launch_castcontrold.sh` is a provided shell script to locate Chromecasts on Linux via Avahi. 

**castcontrold** is a work in progress and does not yet have a user interface to speak of. Currently, the developer scaffold responds to keystrokes in the terminal. 
Start `castcontrold` in an unused terminal emulator (maybe with `tmux`) and control your Chromecast with the following:

- `u`: Increase volume
- `d`: Decrease volume
- `f`: Seek forward 10s
- `b`: Rewind 10s
- `<space>`: Toggle play/paused
- `s`: Stop. (Can not be resumed)

A proper system tray widget is planned (at least for Linux). However, there is no current time table.

**castcontrold** does not initiate playback. Try [Cast All The Things](https://github.com/skorokithakis/catt) or your phone.

¹ According to [Google's developer documentation](https://developers.google.com/cast/docs/reference/messages), all compliant relevant senders support `urn:x-cast:com.google.cast.media`.

² MUCH faster than `catt volumedown`.
