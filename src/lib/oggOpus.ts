/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OGG/OPUS FOR WHATSAPP VOICE NOTES — a WebM→Ogg REMUX and an Ogg/Opus validator. No dependencies.

   ⛔ WHY A REMUX AND NOT A RENAME. Meta renders a voice note only from an Ogg container carrying
   mono Opus (src/lib/voiceNote.ts has the evidence). Chrome and Edge's MediaRecorder produce Opus
   inside WebM (Matroska). Renaming .webm to .ogg changes nothing about the bytes and Meta rejects
   or mis-renders it. The codec is already right, so no transcode is needed: this lifts each Opus
   packet out of the WebM blocks and writes it into Ogg pages per RFC 7845 (OpusHead page, OpusTags
   page, audio pages with granule positions counted from each packet's own TOC byte). The audio is
   copied bit for bit — nothing is decoded or re-encoded, so there is no quality loss and no codec
   library to ship to the browser or to the edge.

   ⛔ IT REFUSES RATHER THAN GUESSES. Anything that is not Opus, not mono, not one of the two
   containers, or does not parse cleanly returns a refusal with its reason; the caller sends
   nothing. An Ogg input is VALIDATED (every page's CRC, one stream, OpusHead, mono) and passed
   through unchanged.

   Pure and edge-reachable (relative imports only, CLAUDE.md §3). Runs in Deno and in Node tests.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type VoiceAudioRefusalReason = 'empty' | 'unrecognised_container' | 'not_opus' | 'not_mono' | 'malformed' | 'no_audio';

export type VoiceAudioResult =
  | { ok: true; ogg: Uint8Array; container: 'webm' | 'ogg'; channels: number; durationMs: number; packets: number }
  | { ok: false; reason: VoiceAudioRefusalReason; detail: string };

const refuse = (reason: VoiceAudioRefusalReason, detail: string): VoiceAudioResult => ({ ok: false, reason, detail });

/* ── Opus ─────────────────────────────────────────────────────────────────────────────────────── */

/** PCM samples (at 48 kHz, which Ogg Opus granules always count in) carried by one Opus packet,
 *  from its TOC byte (RFC 6716 §3.1). 0 for an empty or malformed packet. */
export function opusPacketSamples(packet: Uint8Array): number {
  if (!packet.length) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  let frame: number;
  if (config < 12) frame = [480, 960, 1920, 2880][config & 3];       // SILK 10/20/40/60 ms
  else if (config < 16) frame = [480, 960][config & 1];               // Hybrid 10/20 ms
  else frame = [120, 240, 480, 960][config & 3];                      // CELT 2.5/5/10/20 ms
  const code = toc & 3;
  let frames: number;
  if (code === 0) frames = 1;
  else if (code === 3) frames = packet.length < 2 ? 0 : packet[1] & 0x3f;
  else frames = 2;
  return frame * frames;
}

function isOpusHead(b: Uint8Array | null | undefined): b is Uint8Array {
  return !!b && b.length >= 19 && ascii(b, 0, 8) === 'OpusHead';
}

function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const h = new Uint8Array(19);
  h.set(bytes('OpusHead'), 0);
  const v = new DataView(h.buffer);
  h[8] = 1;                            // version
  h[9] = channels;
  v.setUint16(10, preSkip, true);
  v.setUint32(12, inputRate, true);
  v.setInt16(16, 0, true);             // output gain
  h[18] = 0;                           // mapping family 0: mono/stereo, no table
  return h;
}

function opusTags(): Uint8Array {
  const vendor = bytes('LeadFinderOS voice note');
  const t = new Uint8Array(8 + 4 + vendor.length + 4);
  t.set(bytes('OpusTags'), 0);
  const v = new DataView(t.buffer);
  v.setUint32(8, vendor.length, true);
  t.set(vendor, 12);
  v.setUint32(12 + vendor.length, 0, true); // no user comments
  return t;
}

/* ── Ogg pages ────────────────────────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    t[i] = r >>> 0;
  }
  return t;
})();

/** Ogg's CRC-32 (poly 0x04c11db7, no reflection, init 0, no final xor). */
export function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

const FLAG_CONTINUED = 0x01;
const FLAG_BOS = 0x02;
const FLAG_EOS = 0x04;

function oggPage(flags: number, granule: number, serial: number, seq: number, packets: Uint8Array[]): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) { lacing.push(255); n -= 255; }
    lacing.push(n);
  }
  if (lacing.length > 255) throw new Error('ogg page overflow');
  const bodyLen = packets.reduce((s, p) => s + p.length, 0);
  const page = new Uint8Array(27 + lacing.length + bodyLen);
  const v = new DataView(page.buffer);
  page.set(bytes('OggS'), 0);
  page[4] = 0;
  page[5] = flags;
  v.setUint32(6, granule % 0x100000000, true);
  v.setUint32(10, Math.floor(granule / 0x100000000), true);
  v.setUint32(14, serial, true);
  v.setUint32(18, seq, true);
  v.setUint32(22, 0, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packets) { page.set(p, o); o += p.length; }
  v.setUint32(22, oggCrc(page), true);
  return page;
}

/** Write an Ogg Opus stream from an OpusHead and the raw Opus packets, in order. */
export function writeOggOpus(head: Uint8Array, packets: Uint8Array[], serial = 0x4c464f53): Uint8Array {
  const pages: Uint8Array[] = [];
  let seq = 0;
  pages.push(oggPage(FLAG_BOS, 0, serial, seq++, [head]));
  pages.push(oggPage(0, 0, serial, seq++, [opusTags()]));
  let granule = 0;
  let batch: Uint8Array[] = [];
  let batchLacing = 0;
  const flush = (last: boolean) => {
    pages.push(oggPage(last ? FLAG_EOS : 0, granule, serial, seq++, batch));
    batch = []; batchLacing = 0;
  };
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    const lace = Math.floor(p.length / 255) + 1;
    if (batch.length && (batchLacing + lace > 255 || batch.length >= 50)) flush(false);
    batch.push(p);
    batchLacing += lace;
    granule += opusPacketSamples(p);
  }
  if (batch.length) flush(true);
  let total = 0;
  for (const p of pages) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) { out.set(p, o); o += p.length; }
  return out;
}

/** Validate an Ogg Opus stream: every page's CRC, a single logical stream, an OpusHead first.
 *  Returns channels, pre-skip and the final granule, from which the duration follows. */
export function inspectOggOpus(data: Uint8Array): VoiceAudioResult {
  if (!data.length) return refuse('empty', 'The recording is empty.');
  if (ascii(data, 0, 4) !== 'OggS') return refuse('unrecognised_container', 'Not an Ogg file.');
  let pos = 0;
  let serial: number | null = null;
  let firstPacket: Uint8Array | null = null;
  let lastGranule = 0;
  let pages = 0;
  let audioPackets = 0;
  let packetOpen = false;
  while (pos < data.length) {
    if (pos + 27 > data.length || ascii(data, pos, 4) !== 'OggS') return refuse('malformed', `Bad Ogg page at byte ${pos}.`);
    const v = new DataView(data.buffer, data.byteOffset + pos);
    const nSeg = data[pos + 26];
    const headerLen = 27 + nSeg;
    if (pos + headerLen > data.length) return refuse('malformed', 'Truncated Ogg page header.');
    let bodyLen = 0;
    for (let i = 0; i < nSeg; i++) bodyLen += data[pos + 27 + i];
    const end = pos + headerLen + bodyLen;
    if (end > data.length) return refuse('malformed', 'Truncated Ogg page.');
    const page = data.slice(pos, end);
    const stored = v.getUint32(22, true);
    page[22] = page[23] = page[24] = page[25] = 0;
    if (oggCrc(page) !== stored) return refuse('malformed', `Ogg page ${pages} failed its checksum.`);
    const s = v.getUint32(14, true);
    if (serial === null) serial = s;
    else if (s !== serial) return refuse('malformed', 'More than one stream in the Ogg file.');
    const lo = v.getUint32(6, true);
    const hi = v.getUint32(10, true);
    if (!(lo === 0xffffffff && hi === 0xffffffff)) lastGranule = Math.max(lastGranule, hi * 0x100000000 + lo);
    // Packet boundaries: a lacing value below 255 ends a packet.
    let o = pos + headerLen;
    for (let i = 0; i < nSeg; i++) {
      const len = data[pos + 27 + i];
      if (pages === 0 && firstPacket === null && i === 0) firstPacket = data.slice(o, o + bodyLen);
      o += len;
      packetOpen = len === 255;
      if (!packetOpen && pages >= 2) audioPackets++;
    }
    pages++;
    pos = end;
  }
  if (!isOpusHead(firstPacket)) return refuse('not_opus', 'The Ogg stream is not Opus.');
  const channels = firstPacket[9];
  const preSkip = firstPacket[10] | (firstPacket[11] << 8);
  if (channels !== 1) return refuse('not_mono', `The recording has ${channels} channels; a voice note must be mono.`);
  if (!audioPackets || lastGranule <= preSkip) return refuse('no_audio', 'The recording contains no audio.');
  return { ok: true, ogg: data, container: 'ogg', channels, durationMs: Math.round(((lastGranule - preSkip) / 48000) * 1000), packets: audioPackets };
}

/* ── WebM (Matroska) ──────────────────────────────────────────────────────────────────────────── */

const ID = {
  EBML: 0x1a45dfa3, Segment: 0x18538067, Cluster: 0x1f43b675, Tracks: 0x1654ae6b, TrackEntry: 0xae,
  BlockGroup: 0xa0, Audio: 0xe1, TrackNumber: 0xd7, TrackType: 0x83, CodecID: 0x86, CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa, Channels: 0x9f, SimpleBlock: 0xa3, Block: 0xa1,
};
/** Master elements whose children we need. Everything else is skipped by its size. */
const DESCEND = new Set([ID.Segment, ID.Cluster, ID.Tracks, ID.TrackEntry, ID.BlockGroup, ID.Audio]);

function readVint(d: Uint8Array, pos: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  if (pos >= d.length) return null;
  const first = d[pos];
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) { length++; mask >>= 1; }
  if (length > 8 || pos + length > d.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + d[pos + i];
    if (d[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readUint(d: Uint8Array, start: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + d[start + i];
  return v;
}

/** The frames inside one (Simple)Block payload, honouring all three lacing modes. */
function blockFrames(d: Uint8Array, start: number, end: number): { track: number; frames: Uint8Array[] } | null {
  const tn = readVint(d, start, false);
  if (!tn) return null;
  let p = start + tn.length + 2;           // + int16 relative timecode
  if (p >= end) return null;
  const flags = d[p++];
  const lacing = (flags >> 1) & 3;
  if (lacing === 0) return { track: tn.value, frames: [d.slice(p, end)] };
  const count = d[p++] + 1;
  const sizes: number[] = [];
  if (lacing === 1) {                      // Xiph
    for (let i = 0; i < count - 1; i++) {
      let s = 0;
      while (p < end && d[p] === 255) { s += 255; p++; }
      if (p >= end) return null;
      s += d[p++];
      sizes.push(s);
    }
  } else if (lacing === 3) {               // EBML
    const firstSize = readVint(d, p, false);
    if (!firstSize) return null;
    p += firstSize.length;
    sizes.push(firstSize.value);
    for (let i = 1; i < count - 1; i++) {
      const raw = readVint(d, p, false);
      if (!raw) return null;
      p += raw.length;
      const bias = Math.pow(2, 7 * raw.length - 1) - 1;
      sizes.push(sizes[i - 1] + (raw.value - bias));
    }
  }
  const remaining = end - p;
  if (lacing === 2) {                      // fixed
    if (remaining % count) return null;
    for (let i = 0; i < count; i++) sizes.push(remaining / count);
  } else {
    const used = sizes.reduce((s, x) => s + x, 0);
    if (used > remaining || sizes.some((s) => s < 0)) return null;
    sizes.push(remaining - used);
  }
  const frames: Uint8Array[] = [];
  for (const s of sizes) { frames.push(d.slice(p, p + s)); p += s; }
  return { track: tn.value, frames };
}

interface WebmTrack { number: number; type: number; codec: string; codecPrivate: Uint8Array | null; channels: number; codecDelayNs: number }

/** Re-wrap a WebM/Opus recording as Ogg/Opus. The Opus packets are copied unchanged. */
export function webmOpusToOgg(d: Uint8Array): VoiceAudioResult {
  if (!d.length) return refuse('empty', 'The recording is empty.');
  if (readUint(d, 0, Math.min(4, d.length)) !== ID.EBML) return refuse('unrecognised_container', 'Not a WebM file.');
  const tracks: WebmTrack[] = [];
  let current: WebmTrack | null = null;
  const blocks: Array<{ track: number; frames: Uint8Array[] }> = [];
  let pos = 0;
  while (pos < d.length) {
    const id = readVint(d, pos, true);
    if (!id) break;
    const size = readVint(d, pos + id.length, false);
    if (!size) break;                                   // a truncated tail — keep what we have
    const dataStart = pos + id.length + size.length;
    if (DESCEND.has(id.value)) {
      if (id.value === ID.TrackEntry) {
        current = { number: 0, type: 0, codec: '', codecPrivate: null, channels: 1, codecDelayNs: 0 };
        tracks.push(current);
      }
      pos = dataStart;                                  // step INTO it (unknown sizes included)
      continue;
    }
    if (size.unknown) return refuse('malformed', `Unsized element 0x${id.value.toString(16)} in the WebM.`);
    const dataEnd = dataStart + size.value;
    if (dataEnd > d.length) {
      // MediaRecorder can end on a partly-flushed block; a truncated block is dropped, not trusted.
      break;
    }
    switch (id.value) {
      case ID.TrackNumber: if (current) current.number = readUint(d, dataStart, size.value); break;
      case ID.TrackType: if (current) current.type = readUint(d, dataStart, size.value); break;
      case ID.CodecID: if (current) current.codec = ascii(d, dataStart, size.value); break;
      case ID.CodecPrivate: if (current) current.codecPrivate = d.slice(dataStart, dataEnd); break;
      case ID.CodecDelay: if (current) current.codecDelayNs = readUint(d, dataStart, size.value); break;
      case ID.Channels: if (current) current.channels = readUint(d, dataStart, size.value); break;
      case ID.SimpleBlock:
      case ID.Block: {
        const b = blockFrames(d, dataStart, dataEnd);
        if (!b) return refuse('malformed', 'A WebM audio block could not be read.');
        blocks.push(b);
        break;
      }
    }
    pos = dataEnd;
  }
  const audio = tracks.find((t) => t.codec === 'A_OPUS') ?? null;
  if (!audio) {
    const codecs = tracks.map((t) => t.codec).filter(Boolean).join(', ');
    return refuse('not_opus', codecs ? `The WebM audio is ${codecs}, not Opus.` : 'The WebM has no Opus track.');
  }
  const trackNo = audio.number || 1;
  const head = isOpusHead(audio.codecPrivate)
    ? audio.codecPrivate
    : opusHead(audio.channels || 1, Math.round((audio.codecDelayNs || 6_500_000) * 48000 / 1e9), 48000);
  const channels = head[9];
  if (channels !== 1) return refuse('not_mono', `The recording has ${channels} channels; a voice note must be mono.`);
  const packets: Uint8Array[] = [];
  for (const b of blocks) if (b.track === trackNo) for (const f of b.frames) if (f.length) packets.push(f);
  if (!packets.length) return refuse('no_audio', 'The recording contains no audio.');
  const ogg = writeOggOpus(head, packets);
  const checked = inspectOggOpus(ogg);                  // prove our own output before anyone sends it
  if (!checked.ok) return checked;
  return { ...checked, container: 'webm' };
}

/** Whatever the browser recorded → Ogg/Opus mono, or the reason it cannot be a voice note. */
export function toVoiceNoteOgg(data: Uint8Array): VoiceAudioResult {
  if (!data.length) return refuse('empty', 'The recording is empty.');
  if (ascii(data, 0, 4) === 'OggS') return inspectOggOpus(data);
  if (data.length >= 4 && readUint(data, 0, 4) === ID.EBML) return webmOpusToOgg(data);
  return refuse('unrecognised_container', 'The recording is neither WebM nor Ogg.');
}

/* ── bytes ────────────────────────────────────────────────────────────────────────────────────── */

function ascii(d: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len && i < d.length; i++) s += String.fromCharCode(d[i]);
  return s;
}

function bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
