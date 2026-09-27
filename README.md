# anderooc.github.io

Personal site for [Andrew Chang](https://github.com/anderooc), played as a volleyball rally.
Flick the ball up to dig (Work), sideways to set (Projects), or down to spike (Contact).
On Projects, each project is an attacker on a 3D court; call a set (Go, 3, 1, Red, Pipe) to see it.
Arrow keys do the same, and Escape calls a timeout back to warmups.

**Live site:** [anderooc.github.io](https://anderooc.github.io)

## Local preview

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Structure

- `index.html` — scoreboard, court, and the four scenes (warmups, dig, set, spike)
- `css/style.css` — gym, court, ball, and scene styles
- `js/main.js` — flick gestures, ball flights, scene swaps, touch and score rules
- `images/` — portrait and project screenshots
- `AndrewChangResume.pdf` — downloadable résumé
