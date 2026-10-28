/**
 * Browser port of Who Touched Oils Blish EVTC parser.
 * Same rules: Rapid Decay skill IDs, first-touch per oil, skip downed/dead.
 */
(function (global) {
  "use strict";

  const DEIMOS_SPECIES_ID = 17154;
  const OIL_SKILL_IDS = new Set([37716, 72779]);
  const RESULT_BLOCK = 3;
  const RESULT_EVADE = 4;
  const RESULT_ABSORB = 6;
  const RESULT_BLIND = 7;
  const HIT_DEBOUNCE_MS = 900;
  const PLAYER_ELITE_SENTINEL = 0xffffffff;
  const STATE_CHANGE_UP = 3;
  const STATE_CHANGE_DEAD = 4;
  const STATE_CHANGE_DOWN = 5;

  class Reader {
    constructor(bytes) {
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.offset = 0;
      this.length = bytes.byteLength;
    }

    get remaining() {
      return this.length - this.offset;
    }

    readBytes(n) {
      const start = this.offset;
      this.offset += n;
      return new Uint8Array(this.view.buffer, this.view.byteOffset + start, n);
    }

    readU8() {
      const v = this.view.getUint8(this.offset);
      this.offset += 1;
      return v;
    }

    readU16() {
      const v = this.view.getUint16(this.offset, true);
      this.offset += 2;
      return v;
    }

    readI16() {
      const v = this.view.getInt16(this.offset, true);
      this.offset += 2;
      return v;
    }

    readU32() {
      const v = this.view.getUint32(this.offset, true);
      this.offset += 4;
      return v;
    }

    readI32() {
      const v = this.view.getInt32(this.offset, true);
      this.offset += 4;
      return v;
    }

    readU64() {
      const lo = this.view.getUint32(this.offset, true);
      const hi = this.view.getUint32(this.offset + 4, true);
      this.offset += 8;
      return BigInt(hi) * 0x100000000n + BigInt(lo);
    }

    readI64() {
      // Combat times fit comfortably in Number for our purposes.
      const lo = this.view.getUint32(this.offset, true);
      const hi = this.view.getInt32(this.offset + 4, true);
      this.offset += 8;
      return hi * 0x100000000 + lo;
    }
  }

  function decodeAgentName(bytes) {
    let end = bytes.length;
    const parts = [];
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) {
        parts.push(new TextDecoder("utf-8").decode(bytes.subarray(start, i)).trim());
        start = i + 1;
        if (parts.length >= 2) break;
      }
    }
    if (parts.length === 0) {
      parts.push(new TextDecoder("utf-8").decode(bytes).replace(/\0/g, "").trim());
    }
    return {
      characterName: parts[0] || "",
      accountName: parts[1] || "",
    };
  }

  function displayName(agent) {
    return agent.characterName || agent.accountName || "Unknown";
  }

  function parseEvtcBuffer(bytes, fileName) {
    const reader = new Reader(bytes);
    const magic = reader.readBytes(4);
    if (magic[0] !== 0x45 || magic[1] !== 0x56 || magic[2] !== 0x54 || magic[3] !== 0x43) {
      return { success: false, errorMessage: "Not an EVTC file." };
    }

    reader.readBytes(8); // build date
    const revision = reader.readU8();
    const encounterId = reader.readU16();
    reader.readU8();

    if (encounterId !== DEIMOS_SPECIES_ID) {
      return {
        success: false,
        errorMessage: `Not a Deimos log (species ${encounterId}).`,
      };
    }

    if (revision !== 1) {
      return {
        success: false,
        errorMessage: `Unsupported EVTC revision ${revision} (need 1).`,
      };
    }

    const agentCount = reader.readU32();
    const agentsByAddress = new Map();

    for (let i = 0; i < agentCount; i++) {
      const address = reader.readU64();
      reader.readU32(); // prof
      const isElite = reader.readU32();
      reader.readU16();
      reader.readU16();
      reader.readU16();
      reader.readU16();
      reader.readI16();
      reader.readU16();
      const nameBytes = reader.readBytes(68);
      const names = decodeAgentName(nameBytes);
      agentsByAddress.set(address, {
        address,
        isPlayer: isElite !== PLAYER_ELITE_SENTINEL,
        characterName: names.characterName,
        accountName: names.accountName,
      });
    }

    const skillCount = reader.readU32();
    for (let i = 0; i < skillCount; i++) {
      reader.readU32();
      reader.readBytes(64);
    }

    const hitCounts = new Map();
    const lastHitTime = new Map();
    const addressByInstId = new Map();
    const playerStatus = new Map(); // 0 alive, 1 downed, 2 dead
    const firstTouchByOil = new Map();
    const firstTouchOrder = [];

    while (reader.remaining >= 64) {
      const time = reader.readI64();
      const srcAgent = reader.readU64();
      const dstAgent = reader.readU64();
      const value = reader.readI32();
      const buffDmg = reader.readI32();
      reader.readU32(); // overstack
      const skillId = reader.readU32();
      const srcInstId = reader.readU16();
      const dstInstId = reader.readU16();
      reader.readU16();
      reader.readU16();
      reader.readU8();
      const buff = reader.readU8();
      const result = reader.readU8();
      const isActivation = reader.readU8();
      reader.readU8();
      reader.readU8();
      reader.readU8();
      reader.readU8();
      const isStateChange = reader.readU8();
      reader.readU8();
      reader.readU8();
      const isOffcycle = reader.readU8();
      reader.readU32();

      if (srcInstId !== 0 && srcAgent !== 0n) {
        addressByInstId.set(srcInstId, srcAgent);
      }
      if (dstInstId !== 0 && dstAgent !== 0n) {
        addressByInstId.set(dstInstId, dstAgent);
      }

      if (
        isStateChange === STATE_CHANGE_UP ||
        isStateChange === STATE_CHANGE_DEAD ||
        isStateChange === STATE_CHANGE_DOWN
      ) {
        const statusAgent = agentsByAddress.get(srcAgent);
        if (statusAgent && statusAgent.isPlayer) {
          if (isStateChange === STATE_CHANGE_UP) playerStatus.set(srcAgent, 0);
          else if (isStateChange === STATE_CHANGE_DOWN) playerStatus.set(srcAgent, 1);
          else playerStatus.set(srcAgent, 2);
        }
        continue;
      }

      if (isStateChange !== 0 || isActivation !== 0) continue;
      if (!OIL_SKILL_IDS.has(skillId)) continue;

      let playerAddress = dstAgent;
      if (playerAddress === 0n && dstInstId !== 0 && addressByInstId.has(dstInstId)) {
        playerAddress = addressByInstId.get(dstInstId);
      }

      const player = agentsByAddress.get(playerAddress);
      if (!player || !player.isPlayer) continue;
      if (isOffcycle !== 0) continue;

      const life = playerStatus.has(playerAddress) ? playerStatus.get(playerAddress) : 0;
      if (life !== 0) continue;

      if (
        result === RESULT_BLOCK ||
        result === RESULT_EVADE ||
        result === RESULT_ABSORB ||
        result === RESULT_BLIND
      ) {
        continue;
      }

      const isDirect = buff === 0 && value > 0;
      const isConditionTick = buff === 1 && buffDmg > 0;
      if (!isDirect && !isConditionTick) continue;

      if (srcInstId !== 0 && !firstTouchByOil.has(srcInstId)) {
        firstTouchByOil.set(srcInstId, {
          oilNumber: firstTouchOrder.length + 1,
          characterName: player.characterName,
          accountName: player.accountName,
          displayName: displayName(player),
          timeMs: time,
        });
        firstTouchOrder.push(srcInstId);
      }

      const previous = lastHitTime.get(playerAddress);
      if (previous !== undefined && time - previous < HIT_DEBOUNCE_MS) continue;

      lastHitTime.set(playerAddress, time);
      hitCounts.set(playerAddress, (hitCounts.get(playerAddress) || 0) + 1);
    }

    const firstTouches = firstTouchOrder.map((id) => firstTouchByOil.get(id));
    const players = [...hitCounts.entries()]
      .map(([addr, hitCount]) => {
        const agent = agentsByAddress.get(addr);
        return {
          characterName: agent.characterName,
          accountName: agent.accountName,
          displayName: displayName(agent),
          hitCount,
        };
      })
      .sort((a, b) => b.hitCount - a.hitCount || a.displayName.localeCompare(b.displayName));

    const totalHits = players.reduce((sum, p) => sum + p.hitCount, 0);

    return {
      success: true,
      fileName: fileName || "",
      firstTouches,
      players,
      totalHits,
    };
  }

  async function openEvtcBytes(file) {
    const name = (file.name || "").toLowerCase();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (name.endsWith(".zevtc") || name.endsWith(".zip")) {
      if (typeof JSZip === "undefined") {
        throw new Error("JSZip failed to load.");
      }
      const zip = await JSZip.loadAsync(bytes);
      const entry = Object.values(zip.files).find((f) => !f.dir);
      if (!entry) throw new Error("Empty .zevtc archive.");
      const inner = await entry.async("uint8array");
      return inner;
    }

    return bytes;
  }

  async function parseLogFile(file) {
    try {
      const bytes = await openEvtcBytes(file);
      return parseEvtcBuffer(bytes, file.name);
    } catch (err) {
      return {
        success: false,
        errorMessage: err && err.message ? err.message : String(err),
      };
    }
  }

  global.WhoTouchedOils = {
    parseLogFile,
    parseEvtcBuffer,
  };
})(window);
