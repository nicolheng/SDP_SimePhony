"""Add native PowerPoint animations to open-slide's editable PPTX export.

python animate_pptx.py <in.pptx> <samples.json> <out.pptx>

For every shape on every slide, find the deck element it was drawn from (the smallest sampled
element whose final rect contains the shape) and copy that element's entrance timing as a native
effect: fade (+ the small rise / slide-in it had), wipe for drawn-in strokes, scale for zooms,
and a keyframed path for elements that glide. Everything starts by itself when the slide opens
(no clicks); every slide gets a fade transition.
"""
import json
import re
import sys
import zipfile

sys.path.insert(0, __import__('os').path.dirname(__file__))
from anim_model import analyse

SRC, SAMPLES, OUT = sys.argv[1:4]
OPTS = sys.argv[4:]
FONT_DIR = OPTS[OPTS.index('--fonts') + 1] if '--fonts' in OPTS else None
VIDEOS = {}  # slide number -> mp4 path
for _i, _a in enumerate(OPTS):
    if _a == '--video':
        _n, _path = OPTS[_i + 1].split('=', 1)
        VIDEOS[int(_n)] = _path
EMU = 6350  # per px on the 1920x1080 canvas
SHIFT = 250  # ms; the deck starts animating during its page fade, PowerPoint after the transition
W, H = 1920.0, 1080.0


def is_loop(item, seen_at):
    pts = [p for p in item['pts'] if p[0] >= seen_at][-15:]
    if len(pts) < 3:
        return False
    xs = [p[1] for p in pts]; ys = [p[2] for p in pts]; ws = [p[3] for p in pts]; hs = [p[4] for p in pts]
    return max(xs) - min(xs) > 1.5 or max(ys) - min(ys) > 1.5 or max(ws) - min(ws) > 0.01 or max(hs) - min(hs) > 0.01


def contains(item, r, tol=6):
    x, y, w, h = r
    return (item['x'] - tol <= x and item['y'] - tol <= y and
            item['x'] + item['w'] + tol >= x + w and item['y'] + item['h'] + tol >= y + h)


def iou(item, r):
    x, y, w, h = r
    ix = max(0, min(item['x'] + item['w'], x + w) - max(item['x'], x))
    iy = max(0, min(item['y'] + item['h'], y + h) - max(item['y'], y))
    inter = ix * iy
    union = item['w'] * item['h'] + w * h - inter
    return inter / union if union else 0


def match(items, r):
    # elements that contain the shape, or overlap it closely (text boxes can sit a little off their element)
    cands = [it for it in items if contains(it, r) or iou(it, r) > 0.7]
    if cands:
        return min(cands, key=lambda it: it['w'] * it['h'])
    best = max(items, key=lambda it: iou(it, r), default=None)
    return best if best and iou(best, r) > 0.5 else None


class Ids:
    def __init__(self):
        self.n = 2  # 1 = root, 2 = main sequence

    def __call__(self):
        self.n += 1
        return self.n


def tgt(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def prop_anim(nid, spid, attr, keys, dur, delay=0, decel=True):
    """keys: [(fraction 0..1, value expression)]"""
    tavs = ''.join(f'<p:tav tm="{int(round(f * 100000))}"><p:val><p:strVal val="{v}"/></p:val></p:tav>' for f, v in keys)
    dec = ' decel="100000"' if decel else ''
    return (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="{nid()}" dur="{max(1, int(dur))}" fill="hold"{dec}>'
            f'<p:stCondLst><p:cond delay="{max(0, int(delay))}"/></p:stCondLst></p:cTn>{tgt(spid)}'
            f'<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>{tavs}</p:tavLst></p:anim>')


def effect(nid, spid, spec, first):
    begin = max(0, spec.get('begin', 0) - SHIFT)
    kind = spec.get('kind', 'none')
    dur = int(spec.get('dur', 500))
    kids = [f'<p:set><p:cBhvr><p:cTn id="{nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>{tgt(spid)}'
            '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>']
    preset = 1  # Appear
    if kind == 'fade':
        preset = 10
        kids.append(f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{nid()}" dur="{dur}"/>{tgt(spid)}</p:cBhvr></p:animEffect>')
        move = int(dur * 1.3)
        dx, dy = spec.get('dx', 0), spec.get('dy', 0)
        if abs(dx) >= 2:
            kids.append(prop_anim(nid, spid, 'ppt_x', [(0, f'#ppt_x{dx / W:+.5f}'), (1, '#ppt_x')], move))
        if abs(dy) >= 2:
            kids.append(prop_anim(nid, spid, 'ppt_y', [(0, f'#ppt_y{dy / H:+.5f}'), (1, '#ppt_y')], move))
        sw, sh = spec.get('sw', 1), spec.get('sh', 1)
        if sw < 0.92 and sh < 0.92:
            kids.append(prop_anim(nid, spid, 'ppt_w', [(0, f'#ppt_w*{sw:.3f}'), (1, '#ppt_w')], move))
            kids.append(prop_anim(nid, spid, 'ppt_h', [(0, f'#ppt_h*{sh:.3f}'), (1, '#ppt_h')], move))
    elif kind == 'wipe':
        preset = 22
        kids.append(f'<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="{nid()}" dur="{dur}"/>{tgt(spid)}</p:cBhvr></p:animEffect>')
    path = spec.get('path')
    if path and len(path) >= 2:
        t0 = path[0][0]
        span = max(1, path[-1][0] - t0)
        rel = max(0, t0 - spec.get('begin', 0)) if kind != 'none' else max(0, t0 - SHIFT) - begin
        kx = [((t - t0) / span, f'#ppt_x{dx / W:+.5f}') for t, dx, _ in path]
        ky = [((t - t0) / span, f'#ppt_y{dy / H:+.5f}') for t, _, dy in path]
        kids.append(prop_anim(nid, spid, 'ppt_x', kx, span, rel, decel=False))
        kids.append(prop_anim(nid, spid, 'ppt_y', ky, span, rel, decel=False))
    node = 'afterEffect' if first else 'withEffect'
    return (f'<p:par><p:cTn id="{nid()}" presetID="{preset}" presetClass="entr" presetSubtype="{4 if preset == 22 else 0}" fill="hold" grpId="0" nodeType="{node}">'
            f'<p:stCondLst><p:cond delay="{int(begin)}"/></p:stCondLst><p:childTnLst>{"".join(kids)}</p:childTnLst></p:cTn></p:par>')


def timing(effects_xml, bld):
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            '<p:par><p:cTn id="{A}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
            '<p:par><p:cTn id="{B}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            f'{effects_xml}'
            '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            f'</p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>{bld}</p:bldLst></p:timing>')


SHAPE_RE = re.compile(r'<p:(sp|pic|cxnSp)>(.*?)</p:\1>', re.S)

samples = json.load(open(SAMPLES, encoding='utf-8'))
zin = zipfile.ZipFile(SRC)
pres_rels = zin.read('ppt/_rels/presentation.xml.rels').decode('utf-8')
pres = zin.read('ppt/presentation.xml').decode('utf-8')
rid_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', pres_rels))
rid_target.update({a: b for b, a in re.findall(r'Target="([^"]+)"[^>]*Id="(rId\d+)"', pres_rels)})
order = [rid_target[r] for r in re.findall(r'<p:sldId [^>]*r:id="(rId\d+)"', pres)]
slide_files = ['ppt/' + t.lstrip('/').replace('ppt/', '') for t in order]
assert len(slide_files) == len(samples), (len(slide_files), len(samples))

new = {}
new_rels = {}
extra_files = {}
report = []


def video_ms(path):
    import subprocess
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
                         capture_output=True, text=True).stdout.strip()
    return int(float(out) * 1000)
for idx, (name, page) in enumerate(zip(slide_files, samples)):
    xml = zin.read(name).decode('utf-8')
    seen = page['seenAt']
    items = [it for it in page['items'] if not is_loop(it, seen)]
    specs = {id(it): analyse(it, seen) for it in items}
    nid = Ids()
    effects, bld, count = [], [], 0
    shapes = []
    for m in SHAPE_RE.finditer(xml):
        kind, body = m.group(1), m.group(2)
        sid = re.search(r'<p:cNvPr id="(\d+)"', body)
        off = re.search(r'<a:off x="(-?\d+)" y="(-?\d+)"/><a:ext cx="(\d+)" cy="(\d+)"/>', body)
        if not sid or not off:
            continue
        x, y, w, h = (int(v) / EMU for v in off.groups())
        it = match(items, (x, y, w, h))
        spec = specs.get(id(it)) if it else None
        if not spec or spec.get('static'):
            # a clip / stroke reveal on a containing element draws its children in too
            wipers = [c for c in items if (contains(c, (x, y, w, h)) or iou(c, (x, y, w, h)) > 0.7) and (specs.get(id(c)) or {}).get('kind') == 'wipe']
            if wipers:
                spec = specs[id(min(wipers, key=lambda c: c['w'] * c['h']))]
        if not spec or spec.get('static'):
            continue
        shapes.append((spec.get('begin', 0), sid.group(1), kind, spec))
    # ---- fonts: give every Inter run the family that matches its real weight
    def refont(m):
        body = m.group(0)
        if m.group(1) != 'sp' or 'typeface="Inter"' not in body:
            return body
        off = re.search(r'<a:off x="(-?\d+)" y="(-?\d+)"/><a:ext cx="(\d+)" cy="(\d+)"/>', body)
        it = match(items, tuple(int(v) / EMU for v in off.groups())) if off else None
        fw = (it or {}).get('fw', 400)

        def run(rm):
            r = rm.group(0)
            if 'typeface="Inter"' not in r:
                return r
            bold = ' b="1"' in r
            fam = 'Inter'
            if bold and fw >= 750:
                fam, r = 'Inter ExtraBold', r.replace(' b="1"', '')
            elif not bold and 450 < fw < 600:
                fam = 'Inter Medium'
            elif not bold and fw >= 750:
                fam = 'Inter ExtraBold'
            elif not bold and fw >= 600:
                r = r.replace('<a:rPr', '<a:rPr b="1"', 1)
            return r.replace('typeface="Inter"', f'typeface="{fam}"')
        return re.sub(r'<a:rPr[^>]*?(?:/>|>.*?</a:rPr>)', run, body, flags=re.S)
    if FONT_DIR:
        xml = SHAPE_RE.sub(refont, xml)

    # ---- video: turn the poster picture into a movie that starts by itself
    media = ''
    if idx + 1 in VIDEOS:
        pics = [(int(mm.group(3)) * int(mm.group(4)), mm) for mm in re.finditer(r'<p:pic>.*?<a:off x="(-?\d+)" y="(-?\d+)"/><a:ext cx="(\d+)" cy="(\d+)"/>.*?</p:pic>', xml, re.S)]
        _, pm = max(pics, key=lambda p: p[0])
        vid = re.search(r'<p:cNvPr id="(\d+)"', pm.group(0)).group(1)
        rels_name = name.replace('slides/', 'slides/_rels/') + '.rels'
        rels = new_rels.get(rels_name) or zin.read(rels_name).decode('utf-8')
        rels = rels.replace('</Relationships>',
            '<Relationship Id="rIdVid1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="../media/demo-video.mp4"/>'
            '<Relationship Id="rIdVid2" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/demo-video.mp4"/></Relationships>')
        new_rels[rels_name] = rels
        extra_files['ppt/media/demo-video.mp4'] = open(VIDEOS[idx + 1], 'rb').read()
        pic = pm.group(0)
        pic = re.sub(r'<p:cNvPr id="(\d+)" name="[^"]*"\s*/>', r'<p:cNvPr id="\1" name="Demo video"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>', pic, count=1)
        pic = re.sub(r'<p:nvPr\s*/>|<p:nvPr>.*?</p:nvPr>',
            '<p:nvPr><a:videoFile r:link="rIdVid1"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">'
            '<p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rIdVid2"/></p:ext></p:extLst></p:nvPr>', pic, count=1, flags=re.S)
        xml = xml.replace(pm.group(0), pic)
        shapes = [sh for sh in shapes if sh[1] != vid]
        dur = video_ms(VIDEOS[idx + 1])
        effects.append(f'<p:par><p:cTn id="{nid()}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect">'
                       '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
                       f'<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="{nid()}" dur="{dur}" fill="hold"/>{tgt(vid)}</p:cBhvr></p:cmd>'
                       '</p:childTnLst></p:cTn></p:par>')
        media = (f'<p:video><p:cMediaNode vol="80000"><p:cTn id="{nid()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>'
                 f'<p:endCondLst><p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst></p:cTn>{tgt(vid)}</p:cMediaNode></p:video>')
    shapes.sort(key=lambda s: s[0])
    for i, (_, spid, kind, spec) in enumerate(shapes):
        effects.append(effect(nid, spid, spec, first=(i == 0 and not media)))
        if kind == 'sp':
            bld.append(f'<p:bldP spid="{spid}" grpId="0" animBg="1"/>')
        count += 1
    a, b = nid(), nid()
    t = timing(''.join(effects), ''.join(bld)).replace('{A}', str(a)).replace('{B}', str(b)) if effects else ''
    if media:
        t = t.replace('</p:seq></p:childTnLst>', '</p:seq>' + media + '</p:childTnLst>', 1)
    # renumber time nodes in document order, the way PowerPoint writes them (root = 1, main sequence = 2)
    counter = iter(range(1, 100000))
    t = re.sub(r'<p:cTn id="\d+"', lambda _: f'<p:cTn id="{next(counter)}"', t)
    trans = '<p:transition spd="med"><p:fade/></p:transition>'
    xml = re.sub(r'<p:transition.*?</p:transition>|<p:transition[^>]*/>', '', xml, flags=re.S)
    xml = re.sub(r'<p:timing>.*?</p:timing>', '', xml, flags=re.S)
    anchor = '</p:clrMapOvr>' if '</p:clrMapOvr>' in xml else '</p:cSld>'
    xml = xml.replace(anchor, anchor + trans + t, 1)
    new[name] = xml
    report.append(f'slide {idx + 1}: {count} animated shapes')

# ---- embedded fonts (EOT .fntdata, the format PowerPoint itself writes)
FONT_FILES = [  # (typeface, style, file stem)
    ('Inter', 'regular', 'Inter-400'), ('Inter', 'bold', 'Inter-700'),
    ('Inter Medium', 'regular', 'Inter-500'), ('Inter ExtraBold', 'regular', 'Inter-800'),
    ('Allura', 'regular', 'Allura-400'),
]
ct = zin.read('[Content_Types].xml').decode('utf-8')
if FONT_DIR:
    import os
    from fontfile import to_eot, woff_to_ttf
    fams, rel_xml = {}, ''
    for i, (face, style, stem) in enumerate(FONT_FILES, 1):
        src = os.path.join(FONT_DIR, stem + '.ttf')
        ttf = open(src, 'rb').read() if os.path.exists(src) else woff_to_ttf(open(os.path.join(FONT_DIR, stem + '.woff'), 'rb').read())
        extra_files[f'ppt/fonts/font{i}.fntdata'] = to_eot(ttf)
        rel_xml += f'<Relationship Id="rIdFont{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font{i}.fntdata"/>'
        fams.setdefault(face, []).append((style, f'rIdFont{i}'))
    lst = ''.join(f'<p:embeddedFont><p:font typeface="{face}" pitchFamily="2" charset="0"/>'
                  + ''.join(f'<p:{st} r:id="{rid}"/>' for st, rid in sorted(v, key=lambda x: ['regular', 'bold'].index(x[0])))
                  + '</p:embeddedFont>' for face, v in fams.items())
    pres = re.sub(r'<p:embeddedFontLst>.*?</p:embeddedFontLst>', '', pres, flags=re.S)
    i_ns = pres.index('/>', pres.index('<p:notesSz')) + 2
    pres = pres[:i_ns] + '<p:embeddedFontLst>' + lst + '</p:embeddedFontLst>' + pres[i_ns:]
    if 'embedTrueTypeFonts' not in pres:
        pres = pres.replace('<p:presentation ', '<p:presentation embedTrueTypeFonts="1" ', 1)
    new['ppt/presentation.xml'] = pres
    new_rels['ppt/_rels/presentation.xml.rels'] = pres_rels.replace('</Relationships>', rel_xml + '</Relationships>')
    if 'Extension="fntdata"' not in ct:
        ct = ct.replace('<Default ', '<Default Extension="fntdata" ContentType="application/x-fontdata"/><Default ', 1)
if VIDEOS and 'Extension="mp4"' not in ct:
    ct = ct.replace('<Default ', '<Default Extension="mp4" ContentType="video/mp4"/><Default ', 1)
new['[Content_Types].xml'] = ct
new.update(new_rels)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        data = new[info.filename].encode('utf-8') if info.filename in new else zin.read(info.filename)
        zout.writestr(info, data)
    for fname, data in extra_files.items():
        zout.writestr(fname, data, zipfile.ZIP_STORED if fname.endswith('.mp4') else zipfile.ZIP_DEFLATED)
print('\n'.join(report))
