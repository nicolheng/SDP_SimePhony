# Animated PPTX

Builds an **editable** PowerPoint copy of the deck in which every slide animates by itself the way it
does in Present mode. These are PowerPoint's own animations (fade, rise, wipe, glide), not videos.

How it works:

1. `export.mjs` runs open-slide's own **Export as PPTX** in headless Edge. You get editable text boxes and shapes, but no animation.
2. `sample.mjs` plays the deck in Present mode. For every element it records when it appears and how it moves.
3. `animate_pptx.py` matches each PowerPoint shape to the element it came from and writes that timing into the file as native
   entrance effects that start on their own, plus a fade transition on every slide.

Run it from the `slides/` folder, with the dev server (`npm run dev`, port 5179) running:

```bash
node tools/animated-pptx/export.mjs pptx "%CD%\exports\native"
node tools/animated-pptx/sample.mjs exports/samples.json 26 5000
python tools/animated-pptx/animate_pptx.py exports/native/simephony-finals.pptx exports/samples.json exports/simephony-finals-animated.pptx
```

Not carried over: effects that loop (globe, news ticker, rain drips), number count-ups, colour
changes (slide 9 circles), and anything open-slide flattens into one picture.
