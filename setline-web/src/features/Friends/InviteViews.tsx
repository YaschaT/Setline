// InviteViews.swift — the invite landing sheet, the QR code and Account ›
// Privacy › Blocked people.
//
// Web: CoreImage's QR generator is replaced by the encoder below (byte mode,
// correction level M, as `CIFilter.qrCodeGenerator()` with "M" builds it);
// `ShareLink` is `navigator.share`, else the link is copied.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { SLSheet } from "../../design/components/SLSheet";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import { PressButton } from "../../design/support";
import { SocialProfile, useSocial } from "../../data/SocialStore";

/** `ProgressView().tint(...)`: the system's spinning spokes. */
export function ProgressView({ color = SL.Ink.secondary, size = 20, style }: { color?: string; size?: number; style?: CSSProperties }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const animation = ref.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 1000, iterations: Infinity, easing: "steps(8, end)" });
    return () => animation?.cancel();
  }, []);
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 20 20" role="progressbar" aria-label="Loading" style={{ display: "block", flexShrink: 0, ...style }}>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={9} y={1} width={2} height={5.5} rx={1} fill={color} opacity={0.25 + (0.75 * i) / 7} transform={`rotate(${i * 45} 10 10)`} />
      ))}
    </svg>
  );
}

const firstWord = (name: string) => name.split(" ").filter((s) => s !== "")[0];

/**
 * What opens when someone follows an invite link (SETLINE Social S6): who
 * invited you, what you'll share, and one button.
 */
export function InviteLandingSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const social = useSocial();
  const [person, setPerson] = useState<SocialProfile | undefined>(undefined);
  const [looked, setLooked] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      if (social.phase.kind === "loading") await social.load();
      try {
        setPerson(await social.find({ username }));
      } catch {
        setPerson(undefined);
      }
      setLooked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const action = (person: SocialProfile) => {
    if (person.user_id === social.myID) {
      return <Text {...slBody()} color={SL.Ink.secondary}>This is your own invite link.</Text>;
    }
    if (social.friends.some((f) => f.user_id === person.user_id)) {
      return (
        <>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Signal.action}>You're already friends.</Text>
          <SLPrimaryButton onPress={onClose}>Done</SLPrimaryButton>
        </>
      );
    }
    if (sent || social.outgoing.some((f) => f.addressee_id === person.user_id)) {
      return (
        <>
          <Text {...slBody()} color={SL.Ink.secondary} align="center">
            Request sent. You'll see each other's posts once it's accepted.
          </Text>
          <SLPrimaryButton onPress={onClose}>Done</SLPrimaryButton>
        </>
      );
    }
    const incoming = social.incoming.find((f) => f.requester_id === person.user_id);
    if (incoming) {
      return (
        <SLPrimaryButton
          onPress={() => {
            void (async () => {
              try {
                await social.accept(incoming);
              } catch {
                /* `try?` */
              }
              onClose();
            })();
          }}
        >
          {`Accept ${firstWord(person.display_name) ?? ""}`}
        </SLPrimaryButton>
      );
    }
    return (
      <>
        <SLPrimaryButton
          onPress={() => {
            void (async () => {
              try {
                await social.request(person);
                setSent(true);
              } catch {
                setFailure("Couldn't send the request. Try again.");
              }
            })();
          }}
        >
          {`Add ${firstWord(person.display_name) ?? person.username} as a friend`}
        </SLPrimaryButton>
        <PressButton onPress={onClose} style={{ ...slFont(SL.TypeSize.body, SL.Weight.medium), color: SL.Ink.secondary, minHeight: SL.Space.hitMin, background: "transparent" }}>
          Not now
        </PressButton>
      </>
    );
  };

  return (
    <SLSheet title="Train together" onClose={onClose}>
      <VStack spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
        {!looked ? (
          <ProgressView color={SL.Ink.secondary} style={{ marginTop: SL.Space.s8, marginBottom: SL.Space.s8 }} />
        ) : person ? (
          <>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
              <Text color={SL.Signal.action} lineHeight={1} style={slFixed(38, SL.Weight.semibold)}>{SocialProfile.initial(person)}</Text>
            </div>
            <VStack spacing={SL.Space.s1}>
              <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary} align="center">
                {`${firstWord(person.display_name) ?? person.display_name} invited you to train together`}
              </Text>
              <Text {...slBody()} color={SL.Ink.secondary}>{`@${person.username}`}</Text>
            </VStack>
            <Text {...slMeta()} color={SL.Ink.meta} align="center">
              You'll see each other's workouts, medals and streaks, and can give kudos. Never your log, body weight or photos.
            </Text>
            {action(person)}
          </>
        ) : (
          <Text {...slBody()} color={SL.Ink.secondary} align="center" style={{ paddingTop: SL.Space.s6, paddingBottom: SL.Space.s6 }}>
            {social.me === undefined ? "Make your Friends profile first, in the Friends tab. Then open the link again." : `Nobody called @${username} on Setline.`}
          </Text>
        )}
        {failure !== undefined && <Text {...slMeta()} color={SL.Signal.attention}>{failure}</Text>}
      </VStack>
    </SLSheet>
  );
}

/** Your invite as a QR code, to show a friend at the gym. */
export function InviteQRSheet({ url, username, onClose }: { url: string; username: string; onClose: () => void }) {
  const matrix = InviteQRSheet.qr(url);
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ url, text: "Train with me on Setline" });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* nothing to hand over */
    }
  };
  return (
    <SLSheet title="My QR code" subtitle="Let a friend scan this with their camera" onClose={onClose}>
      <VStack spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
        {matrix && (
          <div
            role="img"
            aria-label="QR code for your invite link"
            style={{ width: "100%", maxWidth: 260, padding: SL.Space.s4, background: "#fff", borderRadius: SL.Radius.lg, boxSizing: "border-box" }}
          >
            <svg viewBox={`-1 -1 ${matrix.length + 2} ${matrix.length + 2}`} shapeRendering="crispEdges" style={{ display: "block", width: "100%", height: "auto" }}>
              <path
                fill="#000"
                d={matrix.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ""))).join("")}
              />
            </svg>
          </div>
        )}
        <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{`@${username}`}</Text>
        <SLPrimaryButton onPress={() => void share()}>
          <HStack spacing={SL.Space.s2}>
            <SLGlyph name="share" size={16} />
            <span>Share invite link</span>
          </HStack>
        </SLPrimaryButton>
      </VStack>
    </SLSheet>
  );
}

/** `InviteQRSheet.qr(_:)`: the modules of the code, dark = true. Undefined when the text does not fit. */
InviteQRSheet.qr = (text: string): boolean[][] | undefined => QR.encode(new TextEncoder().encode(text));

/** Account › Privacy › Blocked people. */
export function BlockedPeopleSheet({ onClose }: { onClose: () => void }) {
  const social = useSocial();
  useEffect(() => {
    void social.loadBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <SLSheet title="Blocked people" subtitle="They can't send you a request or see your posts" onClose={onClose}>
      <VStack spacing={0} style={{ alignSelf: "stretch" }}>
        {social.blocked.length === 0 ? (
          <Text {...slBody()} color={SL.Ink.secondary} align="center" style={{ alignSelf: "stretch", paddingTop: SL.Space.s6, paddingBottom: SL.Space.s6 }}>
            Nobody is blocked.
          </Text>
        ) : (
          <div style={{ alignSelf: "stretch", background: SL.Surface.raised2, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
            {social.blocked.map((person, index) => (
              <div key={person.user_id} style={{ position: "relative" }}>
                <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
                  <VStack alignment="leading" spacing={1}>
                    <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{person.display_name}</Text>
                    <Text {...slMeta()} color={SL.Ink.secondary}>{`@${person.username}`}</Text>
                  </VStack>
                  <Spacer />
                  <PressButton
                    onPress={() => {
                      void social.unblock(person.user_id).catch(() => {});
                    }}
                    style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action, minHeight: SL.Space.hitMin, background: "transparent" }}
                  >
                    Unblock
                  </PressButton>
                </HStack>
                {index > 0 && (
                  <div style={{ position: "absolute", top: 0, left: SL.Space.s4, right: 0 }}>
                    <SLHairline />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </VStack>
    </SLSheet>
  );
}

// MARK: - QR code (ISO/IEC 18004), byte mode, correction level M, versions 1–6

const QR = {
  // Level M, versions 1…6.
  eccPerBlock: [10, 16, 26, 18, 24, 16],
  blocks: [1, 1, 1, 2, 2, 4],

  rawModules(ver: number): number {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  },

  dataCodewords(ver: number): number {
    return Math.floor(QR.rawModules(ver) / 8) - QR.eccPerBlock[ver - 1] * QR.blocks[ver - 1];
  },

  multiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  },

  divisor(degree: number): number[] {
    const result = new Array<number>(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = QR.multiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = QR.multiply(root, 0x02);
    }
    return result;
  },

  remainder(data: number[], divisor: number[]): number[] {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ (result.shift() as number);
      result.push(0);
      divisor.forEach((coef, i) => (result[i] ^= QR.multiply(coef, factor)));
    }
    return result;
  },

  encode(bytes: Uint8Array): boolean[][] | undefined {
    let ver = 1;
    while (ver <= 6 && 4 + 8 + bytes.length * 8 > QR.dataCodewords(ver) * 8) ver++;
    if (ver > 6) return undefined;
    const capacity = QR.dataCodewords(ver) * 8;
    const bits: number[] = [];
    const append = (value: number, length: number) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    append(0b0100, 4);
    append(bytes.length, 8);
    for (const b of bytes) append(b, 8);
    append(0, Math.min(4, capacity - bits.length));
    append(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);
    const data: number[] = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));

    // Error correction, interleaved.
    const numBlocks = QR.blocks[ver - 1];
    const eccLen = QR.eccPerBlock[ver - 1];
    const rawCodewords = Math.floor(QR.rawModules(ver) / 8);
    const numShort = numBlocks - (rawCodewords % numBlocks);
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const divisor = QR.divisor(eccLen);
    const blocks: number[][] = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = QR.remainder(dat, divisor);
      if (i < numShort) dat.push(0);
      blocks.push([...dat, ...ecc]);
    }
    const codewords: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortLen - eccLen || j >= numShort) codewords.push(block[i]);
      });
    }

    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const set = (x: number, y: number, dark: boolean) => {
      modules[y][x] = dark;
      isFunction[y][x] = true;
    };
    for (let i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
    const align: number[] = [];
    if (ver > 1) {
      const numAlign = Math.floor(ver / 7) + 2;
      const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
      align.push(6);
      for (let pos = size - 7; align.length < numAlign; pos -= step) align.splice(1, 0, pos);
    }
    align.forEach((ax, i) =>
      align.forEach((ay, j) => {
        const last = align.length - 1;
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    const drawFormat = (mask: number) => {
      const formatData = (0 << 3) | mask; // M is 0b00
      let rem = formatData;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const f = ((formatData << 10) | rem) ^ 0x5412;
      const bit = (i: number) => ((f >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);

    // The codewords, in the zig-zag.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && i < codewords.length * 8) {
            modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }

    const masked = (mask: number): boolean[][] =>
      modules.map((row, y) =>
        row.map((dark, x) => {
          if (isFunction[y][x]) return dark;
          let invert: boolean;
          switch (mask) {
            case 0: invert = (x + y) % 2 === 0; break;
            case 1: invert = y % 2 === 0; break;
            case 2: invert = x % 3 === 0; break;
            case 3: invert = (x + y) % 3 === 0; break;
            case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
            case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
            default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          }
          return dark !== invert;
        }),
      );
    const penalty = (m: boolean[][]): number => {
      let score = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let a = 0; a < size; a++) {
          let run = 1;
          for (let b = 1; b < size; b++) {
            const cur = pass === 0 ? m[a][b] : m[b][a];
            const prev = pass === 0 ? m[a][b - 1] : m[b - 1][a];
            if (cur === prev) {
              run++;
              if (run === 5) score += 3;
              else if (run > 5) score++;
            } else run = 1;
          }
        }
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
      const dark = m.reduce((n, row) => n + row.filter(Boolean).length, 0);
      const total = size * size;
      score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return score;
    };
    let best: boolean[][] | undefined;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      drawFormat(mask);
      const candidate = masked(mask);
      const score = penalty(candidate);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  },
};
