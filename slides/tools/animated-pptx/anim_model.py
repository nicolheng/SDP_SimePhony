"""Turn sampled element timelines into animation specs.

Each sample: [t, dx, dy, sw, sh, opacity, changed] where dx/dy are offsets from the final rect (px),
sw/sh the size ratio to final, `changed` = clip-path / stroke-dashoffset differs from final.
"""

def analyse(item, seen_at):
    pts = [p for p in item['pts'] if p[0] >= seen_at]
    if not pts:
        return None
    t_first = pts[0][0]
    rel = lambda t: t - t_first
    o_end = pts[-1][5]
    spec = {'static': True}
    # --- opacity entrance
    start = next((p for p in pts if p[5] > 0.04), None)
    full = next((p for p in pts if p[5] >= 0.95 * o_end), None)
    if start is None or full is None:
        return spec
    hidden_at_first = pts[0][5] < 0.5 * o_end
    # --- reveal by clip / stroke
    clip_change = [p for p in pts if p[6]]
    if hidden_at_first:
        spec = {'static': False, 'kind': 'fade', 'begin': rel(start[0]), 'dur': max(250, min(900, full[0] - start[0] + 60)),
                'dx': start[1], 'dy': start[2], 'sw': start[3], 'sh': start[4]}
    elif clip_change and clip_change[0][0] - t_first < 4000:
        # visible but drawn in by a clip / stroke animation: wipe in from the left
        last_changed = clip_change[-1][0]
        first_changed = clip_change[0][0]
        spec = {'static': False, 'kind': 'wipe', 'begin': rel(first_changed), 'dur': max(300, min(1500, last_changed - first_changed + 60))}
    # --- motion after (or without) the entrance: big moves become a keyframed path
    tail = pts[-12:]
    still_moving = any(abs(p[1]) > 2 or abs(p[2]) > 2 for p in tail)
    big = max((max(abs(p[1]), abs(p[2])) for p in pts if p[5] > 0.04), default=0)
    if big > 30 and not still_moving:
        keys, last = [], None
        for p in pts:
            if p[5] <= 0.04:
                continue
            k = (round(p[1]), round(p[2]))
            if last is None or abs(k[0] - last[1]) + abs(k[1] - last[2]) > 6 or p is pts[-1]:
                keys.append((rel(p[0]), k[0], k[1]))
                last = (p[0], k[0], k[1])
        # hold the final position
        if keys and (keys[-1][1], keys[-1][2]) != (0, 0):
            keys.append((keys[-1][0] + 60, 0, 0))
        spec['path'] = keys
        spec['static'] = False
        spec.setdefault('kind', 'none')
    if spec.get('kind') == 'fade' and 'path' in spec:
        spec['dx'] = spec['dy'] = 0
    return spec
