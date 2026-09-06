// A minimal reader for the protocol buffer wire format.
//
// GTFS-realtime feeds are protobuf, but we only need a handful of scalar
// fields out of them. Walking the wire format directly keeps the dependency
// list short and runs only on the server. See
// https://protobuf.dev/programming-guides/encoding/ for the format itself.
//
// Unknown fields are kept rather than rejected: the wire format is designed so
// a reader can skip what it does not recognise, which is what lets this
// survive additions to the feed spec.

export type WireType = 0 | 1 | 2 | 5;
export type Field = {
  no: number;
  wire: WireType;
  /** Value for varint (0), fixed64 (1), and fixed32 (5) fields. */
  varint: bigint;
  /** Payload for length-delimited (2) fields, otherwise null. */
  bytes: Uint8Array | null;
};

function varintAt(buffer: Uint8Array, at: number): [bigint, number] {
  let value = 0n;
  let shift = 0n;
  let pos = at;
  while (pos < buffer.length) {
    const byte = buffer[pos];
    pos += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7n;
    // A 64-bit varint is at most ten groups of seven bits.
    if (shift > 63n) throw new Error("protobuf: varint is longer than 64 bits");
  }
  throw new Error("protobuf: varint ran past the end of the buffer");
}

function fixedAt(
  buffer: Uint8Array,
  at: number,
  size: number,
): [bigint, number] {
  const end = at + size;
  if (end > buffer.length)
    throw new Error("protobuf: fixed-width field ran past the end");
  let value = 0n;
  // Fixed-width fields are little-endian.
  for (let i = size - 1; i >= 0; i -= 1)
    value = (value << 8n) | BigInt(buffer[at + i]);
  return [value, end];
}

/** Reads every field of one protobuf message, in encounter order. */
export function fields(buffer: Uint8Array): Field[] {
  const found: Field[] = [];
  let pos = 0;
  while (pos < buffer.length) {
    const [tag, afterTag] = varintAt(buffer, pos);
    const no = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (no === 0) throw new Error("protobuf: field number 0 is not valid");
    pos = afterTag;
    if (wire === 0) {
      const [value, after] = varintAt(buffer, pos);
      found.push({ no, wire, varint: value, bytes: null });
      pos = after;
    } else if (wire === 2) {
      const [length, afterLength] = varintAt(buffer, pos);
      const end = afterLength + Number(length);
      if (end > buffer.length || end < afterLength)
        throw new Error("protobuf: length-delimited field ran past the end");
      found.push({
        no,
        wire,
        varint: 0n,
        bytes: buffer.subarray(afterLength, end),
      });
      pos = end;
    } else if (wire === 1 || wire === 5) {
      const [value, after] = fixedAt(buffer, pos, wire === 1 ? 8 : 4);
      found.push({ no, wire, varint: value, bytes: null });
      pos = after;
    } else {
      // Groups (3 and 4) are deprecated and absent from GTFS-realtime.
      throw new Error(`protobuf: unsupported wire type ${wire}`);
    }
  }
  return found;
}

/** Every length-delimited value carried by field `no`, decoded as a message. */
export function messages(parent: Field[], no: number): Field[][] {
  const out: Field[][] = [];
  for (const field of parent)
    if (field.no === no && field.bytes) out.push(fields(field.bytes));
  return out;
}

/** The last value of field `no` as a nested message, or null. */
export function message(parent: Field[], no: number): Field[] | null {
  const all = messages(parent, no);
  return all.length ? all[all.length - 1] : null;
}

/** The last value of field `no` as a UTF-8 string, or "". */
export function text(parent: Field[], no: number): string {
  let bytes: Uint8Array | null = null;
  for (const field of parent)
    if (field.no === no && field.bytes) bytes = field.bytes;
  return bytes ? new TextDecoder().decode(bytes) : "";
}

/** The last value of field `no` as a number, or null when absent. */
export function integer(parent: Field[], no: number): number | null {
  let value: bigint | null = null;
  for (const field of parent)
    if (field.no === no && field.bytes === null) value = field.varint;
  return value === null ? null : Number(value);
}
