// Tiny stack VM: a faithful interpreter of make.fun's ISA v1 (kit: program/generator/subject/ISA.md).
// Runs every /input/<id>/ program (program.bin + input.bin) and writes
// /output/<id>/stdout.bin and /output/<id>/exit.txt. One run, whole set, no clock/env reads.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Runs one program. Returns [stdout bytes, exit code 0..255].
function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const D = new Int32Array(256); // data stack
  const C = new Int32Array(64); // call stack (return addresses)
  const M = new Int32Array(256); // memory, 256 words
  const out = new Uint8Array(65536);
  const n = p.length;
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const done = (code: number): [Uint8Array, number] => [out.subarray(0, ol), code];
  for (;;) {
    if (st === 1000000) return done(10); // step limit
    if (pc < 0 || pc >= n) return done(9); // pc outside program
    const op = p[pc];
    // Opcode facts, packed as imm*100 + pops*10 + pushes; -1 = unknown opcode.
    let q = -1;
    if (op === 0x00 || op === 0x34) q = 0; // HALT, RET
    else if (op === 0x01) q = 101; // PUSH8
    else if (op === 0x02) q = 401; // PUSH32
    else if (op === 0x03 || op === 0x50 || op === 0x51 || op === 0x53) q = 10; // POP, PRINT, PUTC, EXIT
    else if (op === 0x04) q = 12; // DUP
    else if (op === 0x05) q = 22; // SWAP
    else if (op === 0x06) q = 23; // OVER
    else if (op === 0x07) q = 33; // ROT
    else if (op >= 0x10 && op <= 0x22 && op !== 0x1f) q = op === 0x17 || op === 0x1b ? 11 : 21; // ALU
    else if (op === 0x30 || op === 0x33) q = 200; // JMP, CALL
    else if (op === 0x31 || op === 0x32) q = 210; // JZ, JNZ
    else if (op === 0x40) q = 11; // LOAD
    else if (op === 0x41) q = 20; // STORE
    else if (op === 0x52) q = 1; // IN
    if (q < 0) return done(5); // unknown opcode
    const im = (q / 100) | 0, po = ((q / 10) | 0) % 10, pu = q % 10;
    if (pc + im >= n) return done(9); // immediate cut off by program end
    st++;
    const nx = pc + 1 + im;
    if (sp < po) return done(2); // stack underflow
    if (sp - po + pu > 256) return done(3); // stack overflow
    pc = nx;
    switch (op) {
      case 0x00: return done(0); // HALT
      case 0x01: D[sp++] = (p[nx - 1] << 24) >> 24; break; // PUSH8, sign-extended
      case 0x02: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break; // PUSH32
      case 0x03: sp--; break; // POP
      case 0x04: D[sp] = D[sp - 1]; sp++; break; // DUP
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; } // SWAP
      case 0x06: D[sp] = D[sp - 2]; sp++; break; // OVER
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; } // ROT
      case 0x17: D[sp - 1] = (-D[sp - 1]) | 0; break; // NEG (wraps: -(-2^31) is -2^31)
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break; // NOT
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b); // exact low 32 bits
        else if (op === 0x13) { if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return done(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16; // signed 16-bit offset
        let take = op === 0x30;
        if (!take) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33: // CALL
        if (cp === 64) return done(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34: // RET
        if (cp === 0) return done(8);
        pc = C[--cp];
        break;
      case 0x40: { // LOAD
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return done(6);
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: { // STORE (v addr --): addr is the top
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a >= 256) return done(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 0x50: { // PRINT: decimal ASCII, no newline
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51: // PUTC: one byte, v AND 255
        if (ol + 1 > 65536) return done(11);
        out[ol++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break; // IN
      case 0x53: return done(D[--sp] & 255); // EXIT: code is the low byte
    }
  }
}

for (const ent of readdirSync(I, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
  if (!ent.isDirectory()) continue;
  const id = ent.name;
  const [out, code] = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))),
  );
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), `${code}\n`);
}
