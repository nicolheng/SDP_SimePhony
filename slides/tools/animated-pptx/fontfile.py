"""Minimal font helpers (standard library only): WOFF 1.0 -> TTF, read name / OS/2 fields, build EOT.

PowerPoint stores embedded fonts as `ppt/fonts/*.fntdata`, which is Embedded OpenType (EOT):
a small header followed by the raw TrueType data (uncompressed, version 0x00020001).
"""
import struct
import zlib


def woff_to_ttf(data: bytes) -> bytes:
    sig, flavor, length, num_tables = struct.unpack('>4sIIH', data[:14])
    assert sig == b'wOFF', 'not a WOFF 1.0 file'
    entries = []
    for i in range(num_tables):
        tag, off, comp, orig, chk = struct.unpack('>4sIIII', data[44 + i * 20: 64 + i * 20])
        raw = data[off:off + comp]
        entries.append((tag, zlib.decompress(raw) if comp < orig else raw, chk))
    entries.sort(key=lambda e: e[0])
    # sfnt header
    sr = 1
    es = 0
    while sr * 2 <= num_tables:
        sr *= 2
        es += 1
    out = bytearray(struct.pack('>IHHHH', flavor, num_tables, sr * 16, es, num_tables * 16 - sr * 16))
    offset = 12 + 16 * num_tables
    body = bytearray()
    dir_ = bytearray()
    for tag, table, chk in entries:
        dir_ += struct.pack('>4sIII', tag, chk, offset + len(body), len(table))
        body += table + b'\0' * ((4 - len(table) % 4) % 4)
    return bytes(out + dir_ + body)


def tables(ttf: bytes) -> dict:
    n = struct.unpack('>H', ttf[4:6])[0]
    t = {}
    for i in range(n):
        tag, _, off, ln = struct.unpack('>4sIII', ttf[12 + i * 16: 28 + i * 16])
        t[tag.decode('latin-1')] = ttf[off:off + ln]
    return t


def names(ttf: bytes) -> dict:
    nm = tables(ttf)['name']
    _, count, str_off = struct.unpack('>HHH', nm[:6])
    out = {}
    for i in range(count):
        pid, eid, lid, nid, ln, off = struct.unpack('>HHHHHH', nm[6 + i * 12: 18 + i * 12])
        raw = nm[str_off + off: str_off + off + ln]
        if pid == 3 and lid == 0x409:
            out[nid] = raw.decode('utf-16-be')
        elif pid == 1 and nid not in out:
            out[nid] = raw.decode('latin-1')
    return out


def to_eot(ttf: bytes) -> bytes:
    t = tables(ttf)
    os2 = t['OS/2']
    weight = struct.unpack('>H', os2[4:6])[0]
    fs_type = struct.unpack('>H', os2[8:10])[0]
    panose = os2[32:42]
    ur = struct.unpack('>IIII', os2[42:58])
    fs_sel = struct.unpack('>H', os2[62:64])[0]
    cpr = struct.unpack('>II', os2[78:86]) if len(os2) >= 86 else (0, 0)
    checksum_adj = struct.unpack('>I', t['head'][8:12])[0]
    nm = names(ttf)

    def s(text):
        b = text.encode('utf-16-le')
        return struct.pack('<H', len(b)) + b

    head = bytearray()
    head += struct.pack('<I', len(ttf))           # FontDataSize
    head += struct.pack('<I', 0x00020001)         # Version
    head += struct.pack('<I', 0)                  # Flags (no compression, no XOR)
    head += panose                                # FontPANOSE[10]
    head += struct.pack('<B', 1)                  # Charset DEFAULT_CHARSET
    head += struct.pack('<B', 1 if fs_sel & 1 else 0)  # Italic
    head += struct.pack('<I', weight)
    head += struct.pack('<H', fs_type)
    head += struct.pack('<H', 0x504C)             # MagicNumber
    head += struct.pack('<IIII', *ur)
    head += struct.pack('<II', *cpr)
    head += struct.pack('<I', checksum_adj)
    head += struct.pack('<IIII', 0, 0, 0, 0)      # Reserved1-4
    head += struct.pack('<H', 0) + s(nm.get(1, ''))   # Padding1, FamilyName
    head += struct.pack('<H', 0) + s(nm.get(2, ''))   # Padding2, StyleName
    head += struct.pack('<H', 0) + s(nm.get(5, ''))   # Padding3, VersionName
    head += struct.pack('<H', 0) + s(nm.get(4, ''))   # Padding4, FullName
    head += struct.pack('<H', 0) + struct.pack('<H', 0)  # Padding5, RootStringSize = 0 (no root string)
    total = 4 + len(head) + len(ttf)
    return struct.pack('<I', total) + bytes(head) + ttf
