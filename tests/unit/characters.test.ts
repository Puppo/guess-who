import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHARACTERS,
  type Character,
  SHARED_TRAIT_CLUSTERS,
  getCharacterById,
  resolvePublicAssetUrl,
  validateCharacterDataset,
} from "../../src/data/characters.ts";
import { buildRoundSchema } from "../../src/engine/schema.ts";

describe("Character dataset (CHARACTERS)", () => {
  it("contains exactly 12 characters in the specified order", () => {
    expect(CHARACTERS).toHaveLength(12);
    const expectedIds = [
      "nora",
      "milo",
      "ada",
      "theo",
      "priya",
      "sam",
      "elena",
      "omar",
      "lin",
      "mateo",
      "clara",
      "jun",
    ];
    expect(CHARACTERS.map((c) => c.id)).toEqual(expectedIds);
  });

  it("passes validateCharacterDataset with valid: true and 0 errors", () => {
    const result = validateCharacterDataset(CHARACTERS);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("has non-empty biography mentioning occupation and no physical appearance terms", () => {
    const bannedWords = ["glasses", "hat", "beard", "mustache", "hair"];

    const occupationKeywords: Record<string, string> = {
      nora: "astronomer",
      milo: "baker",
      ada: "mechanic",
      theo: "illustrator",
      priya: "paramedic",
      sam: "marine biologist",
      elena: "jazz pianist",
      omar: "accessibility consultant",
      lin: "botanical archivist",
      mateo: "sound engineer",
      clara: "nurse",
      jun: "translator",
    };

    for (const char of CHARACTERS) {
      expect(char.biography.trim().length).toBeGreaterThan(0);

      // Verify occupation is mentioned
      const expectedOccupation = occupationKeywords[char.id];
      expect(char.biography.toLowerCase()).toContain(expectedOccupation);

      // Verify no physical appearance traits are described in biography or avatarAlt
      for (const banned of bannedWords) {
        const wordRegex = new RegExp(`\\b${banned}\\b`, "i");
        expect(char.biography).not.toMatch(wordRegex);
        expect(char.avatarAlt).not.toMatch(wordRegex);
      }

      // Verify avatarUrl conforms to convention
      expect(char.avatarUrl).toBe(`/avatars/${char.id}.jpg`);

      // Verify avatarAlt describes the editorial portrait photo
      expect(char.avatarAlt.toLowerCase()).toContain(
        "editorial portrait photo"
      );
    }
  });

  it("ships 12 photorealistic JPEG portrait avatars matching JPEG header and web size budget", () => {
    for (const char of CHARACTERS) {
      const jpgPath = path.resolve(
        process.cwd(),
        `public/avatars/${char.id}.jpg`
      );
      const legacySvgPath = path.resolve(
        process.cwd(),
        `public/avatars/${char.id}.svg`
      );
      expect(fs.existsSync(jpgPath)).toBe(true);
      expect(fs.existsSync(legacySvgPath)).toBe(false);
      const buf = fs.readFileSync(jpgPath);
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
      expect(buf[2]).toBe(0xff);
      expect(buf.byteLength).toBeGreaterThanOrEqual(5_000);
      expect(buf.byteLength).toBeLessThanOrEqual(250_000);
    }
  });

  it("ensures every character's serialized facts are strictly under 600 characters", () => {
    for (const char of CHARACTERS) {
      const serialized = char.facts.map((f) => `- ${f}`).join("\n");
      expect(serialized.length).toBeLessThan(600);
      expect(char.facts.length).toBeGreaterThanOrEqual(4);
      expect(char.facts.length).toBeLessThanOrEqual(8);
    }
  });

  it("encodes explicit gender parity (6 women / 6 men) and excludes names/ids from both schema variants", () => {
    const women = CHARACTERS.filter((c) =>
      c.facts.includes("Is a woman (female)")
    );
    const men = CHARACTERS.filter((c) => c.facts.includes("Is a man (male)"));
    expect(women).toHaveLength(6);
    expect(men).toHaveLength(6);

    for (const char of CHARACTERS) {
      const crossSchemaStr = JSON.stringify(
        buildRoundSchema(char.facts, { variant: "cross-encoder" })
      ).toLowerCase();
      const biSchemaStr = JSON.stringify(
        buildRoundSchema(char.facts, { variant: "bi-encoder" })
      ).toLowerCase();

      expect(crossSchemaStr).not.toContain(char.id.toLowerCase());
      expect(crossSchemaStr).not.toContain(char.name.toLowerCase());
      expect(biSchemaStr).not.toContain(char.id.toLowerCase());
      expect(biSchemaStr).not.toContain(char.name.toLowerCase());
    }
  });

  it("ensures all shared trait clusters have between 3 and 6 characters with exact counts", () => {
    const expectedCounts: Record<string, number> = {
      "woman (female)": 6,
      "man (male)": 6,
      "night shifts": 4,
      "daytime schedule": 5,
      "starts before sunrise": 3,
      "works from home": 3,
      "travels by bicycle": 3,
      "enjoys hiking": 3,
      "enjoys camping": 6,
      "dislikes camping": 6,
      "plays chess": 3,
      "repairs gear": 3,
      "baking/plants": 4,
      "owns a cat": 4,
      "owns a dog": 3,
      "owns no pets": 6,
    };

    for (const [cluster, predicate] of Object.entries(SHARED_TRAIT_CLUSTERS)) {
      const matching = CHARACTERS.filter(predicate);
      expect(matching.length).toBeGreaterThanOrEqual(3);
      expect(matching.length).toBeLessThanOrEqual(6);
      expect(matching.length).toBe(expectedCounts[cluster]);
    }
  });

  it("provides getCharacterById lookup for known and unknown ids", () => {
    for (const char of CHARACTERS) {
      const found = getCharacterById(char.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(char.id);
      expect(found?.name).toBe(char.name);
    }

    expect(getCharacterById("unknown_id")).toBeUndefined();
    expect(getCharacterById("")).toBeUndefined();
  });

  describe("validateCharacterDataset error handling", () => {
    it("reports an error when character count is not 12", () => {
      const partial = CHARACTERS.slice(0, 11);
      const result = validateCharacterDataset(partial);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Dataset must contain exactly 12 characters, found 11"
      );
    });

    it("reports an error for duplicate IDs or duplicate names", () => {
      const duplicateIdList: Character[] = [
        ...CHARACTERS.slice(0, 11),
        { ...CHARACTERS[0], id: "nora" },
      ];
      const result = validateCharacterDataset(duplicateIdList);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Duplicate character id: "nora"'))
      ).toBe(true);
    });

    it("reports an error for duplicate fact sets", () => {
      const duplicateFactsList: Character[] = [
        ...CHARACTERS.slice(0, 11),
        {
          ...CHARACTERS[11],
          id: "extra",
          name: "Extra",
          facts: [...CHARACTERS[0].facts],
        },
      ];
      const result = validateCharacterDataset(duplicateFactsList);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("duplicate fact set"))
      ).toBe(true);
    });

    it("reports an error when facts length is outside 4 to 8", () => {
      const invalidFactsList: Character[] = [
        {
          ...CHARACTERS[0],
          facts: ["Only one fact"],
        },
        ...CHARACTERS.slice(1),
      ];
      const result = validateCharacterDataset(invalidFactsList);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes('Character "nora" must have 4 to 8 facts')
        )
      ).toBe(true);
    });
  });

  describe("resolvePublicAssetUrl", () => {
    it("resolves root-relative paths against root base URL", () => {
      expect(resolvePublicAssetUrl("/avatars/nora.jpg", "/")).toBe(
        "/avatars/nora.jpg"
      );
      expect(resolvePublicAssetUrl("avatars/nora.jpg", "/")).toBe(
        "/avatars/nora.jpg"
      );
    });

    it("resolves root-relative paths against subpath base URLs", () => {
      expect(resolvePublicAssetUrl("/avatars/nora.jpg", "/guess-who/")).toBe(
        "/guess-who/avatars/nora.jpg"
      );
      expect(resolvePublicAssetUrl("/avatars/nora.jpg", "/guess-who")).toBe(
        "/guess-who/avatars/nora.jpg"
      );
      expect(
        resolvePublicAssetUrl("/guess-who/avatars/nora.jpg", "/guess-who/")
      ).toBe("/guess-who/avatars/nora.jpg");
    });

    it("preserves external and data URLs", () => {
      expect(
        resolvePublicAssetUrl("https://example.com/nora.jpg", "/guess-who/")
      ).toBe("https://example.com/nora.jpg");
      expect(
        resolvePublicAssetUrl(
          "data:image/jpeg;base64,abc123",
          "/guess-who/"
        )
      ).toBe("data:image/jpeg;base64,abc123");
    });
  });
});
