"""Make the demo video playable from the exported PDF.

python tools/pdf-video.py <in.pdf> <video.mp4> <page-number> <out.pdf>

PDF viewers cannot play video inline any more (the old Flash player is gone), so this:
1. embeds the MP4 inside the PDF (it travels with the file, no internet needed),
2. draws a play button over the demo poster, and
3. makes the poster clickable: in Adobe Acrobat / Reader a click opens the embedded video in the
   computer's video player. The video is also listed under the PDF's attachments (paperclip panel).
Browser PDF viewers (Chrome, Edge) ignore the click; there, open it from the attachments panel or use the HTML.
"""
import sys

import fitz  # PyMuPDF

src, video, page_no, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
URL = sys.argv[5] if len(sys.argv) > 5 else None  # optional online copy (YouTube / Drive): works in every viewer
NAME = 'Simephony-demo.mp4'
doc = fitz.open(src)
page = doc[page_no - 1]
k = page.rect.width / 1920  # canvas px -> PDF points

# the demo poster on the slide: 1500 x 675 px, centred, top at 262 px (see the Demo page)
x, y, w, h = (1920 - 1500) / 2, 262, 1500, 675
rect = fitz.Rect(x * k, y * k, (x + w) * k, (y + h) * k)

# 1. embed the video (document level, shows in the attachments panel)
if NAME in doc.embfile_names():
    doc.embfile_del(NAME)
doc.embfile_add(NAME, open(video, 'rb').read(), filename=NAME, desc='Simephony demo video')

# 2. play button
c = fitz.Point((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
r = 46 * k * 1.6
shape = page.new_shape()
shape.draw_circle(c, r)
shape.finish(color=None, fill=(0.776, 0.29, 0.122), fill_opacity=0.92)
t = r * 0.42
shape.draw_polyline([fitz.Point(c.x - t * 0.7, c.y - t), fitz.Point(c.x + t, c.y), fitz.Point(c.x - t * 0.7, c.y + t)])
shape.finish(color=None, fill=(1, 1, 1), closePath=True)
shape.commit()
label = 'Click to play the demo' if URL else 'Click to play the demo (Adobe Acrobat / Reader)'
fs = 15
tw = fitz.get_text_length(label, fontname='helv', fontsize=fs)
pill = fitz.Rect(c.x - tw / 2 - 14, c.y + r + 12, c.x + tw / 2 + 14, c.y + r + 12 + fs + 14)
shape = page.new_shape()
shape.draw_rect(pill, radius=0.5)
shape.finish(color=None, fill=(0.11, 0.094, 0.078), fill_opacity=0.85)
shape.commit()
page.insert_text(fitz.Point(c.x - tw / 2, pill.y1 - 10), label, fontsize=fs, fontname='helv', color=(1, 1, 1))

# 3. clickable poster: Acrobat JavaScript that launches the embedded file
#    With a URL: a plain web link (every viewer). Without: Acrobat JavaScript that opens the embedded file.
if URL:
    safe = URL.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    action = f'<</S/URI/URI({safe})>>'
else:
    js = f'this.exportDataObject({{ cName: "{NAME}", nLaunch: 2 }});'
    action = f'<</S/JavaScript/JS({js})>>'
annot = doc.get_new_xref()
doc.update_object(annot, (
    f'<</Type/Annot/Subtype/Link/Rect[{rect.x0:.2f} {page.rect.height - rect.y1:.2f} {rect.x1:.2f} {page.rect.height - rect.y0:.2f}]'
    f'/Border[0 0 0]/F 4/A{action}>>'))
kind, annots = doc.xref_get_key(page.xref, 'Annots')
if kind == 'array':
    doc.xref_set_key(page.xref, 'Annots', annots[:-1] + f' {annot} 0 R]')
elif kind == 'xref':
    arr_xref = int(annots.split()[0])
    arr = doc.xref_object(arr_xref).strip()
    doc.update_object(arr_xref, arr[:-1] + f' {annot} 0 R]')
else:
    doc.xref_set_key(page.xref, 'Annots', f'[{annot} 0 R]')

doc.save(out, garbage=3, deflate=True)
print('saved', out)
