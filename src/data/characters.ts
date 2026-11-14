export type Character = {
  id: string;
  name: string;
  avatarUrl: string;
  avatarAlt: string;
  biography: string;
  facts: string[];
};

export const CHARACTERS: readonly Character[] = [
  {
    id: "nora",
    name: "Nora",
    avatarUrl: "/avatars/nora.jpg",
    avatarAlt:
      "Editorial portrait photo of Nora in an observatory jacket at twilight",
    biography:
      "Nora is a woman who works as an astronomer onsite at a hilltop observatory, where she regularly works at night and does not start work before sunrise. Away from the telescope, she enjoys hiking and camping, and she owns a cat.",
    facts: [
      "Is a woman (female)",
      "Works as an astronomer",
      "Regularly works at night",
      "Works onsite at a hilltop observatory",
      "Enjoys hiking",
      "Enjoys camping",
      "Owns a cat",
    ],
  },
  {
    id: "milo",
    name: "Milo",
    avatarUrl: "/avatars/milo.jpg",
    avatarAlt:
      "Editorial portrait photo of Milo in a baker apron in a morning bakery",
    biography:
      "Milo is a man who works as a baker and starts work before sunrise, though he explicitly does not work at night. He travels by bicycle, grows indoor plants, explicitly dislikes camping, and explicitly owns no pets.",
    facts: [
      "Is a man (male)",
      "Works as a baker",
      "Starts work before sunrise",
      "Explicitly does not work at night",
      "Grows indoor plants",
      "Travels by bicycle",
      "Explicitly dislikes camping",
      "Explicitly owns no pets",
    ],
  },
  {
    id: "ada",
    name: "Ada",
    avatarUrl: "/avatars/ada.jpg",
    avatarAlt:
      "Editorial portrait photo of Ada in a workshop with vintage radios",
    biography:
      "Ada is a woman who works daytime hours as a mechanic, does not start work before sunrise, and explicitly does not work at night. She often repairs old radios, enjoys camping, and owns a dog.",
    facts: [
      "Is a woman (female)",
      "Works as a mechanic",
      "Explicitly does not work at night",
      "Repairs old radios",
      "Enjoys camping",
      "Owns a dog",
    ],
  },
  {
    id: "theo",
    name: "Theo",
    avatarUrl: "/avatars/theo.jpg",
    avatarAlt:
      "Editorial portrait photo of Theo in a sunlit home illustration studio",
    biography:
      "Theo is a man who works daytime hours as an illustrator from home, does not start work before sunrise, and explicitly does not work at night. During leisure hours, he plays chess, explicitly dislikes camping, and explicitly owns no pets.",
    facts: [
      "Is a man (male)",
      "Works as an illustrator",
      "Works from home",
      "Explicitly does not work at night",
      "Plays chess",
      "Explicitly dislikes camping",
      "Explicitly owns no pets",
    ],
  },
  {
    id: "priya",
    name: "Priya",
    avatarUrl: "/avatars/priya.jpg",
    avatarAlt:
      "Editorial portrait photo of Priya in a paramedic responder jacket at night",
    biography:
      "Priya is a woman who works as an emergency paramedic and regularly works at night rather than starting before sunrise. She travels by bicycle and enjoys distance running, though she explicitly dislikes camping and explicitly owns no pets.",
    facts: [
      "Is a woman (female)",
      "Works as an emergency paramedic",
      "Regularly works at night",
      "Travels by bicycle",
      "Enjoys distance running",
      "Explicitly dislikes camping",
      "Explicitly owns no pets",
    ],
  },
  {
    id: "sam",
    name: "Sam",
    avatarUrl: "/avatars/sam.jpg",
    avatarAlt:
      "Editorial portrait photo of Sam in a coastal field jacket by the ocean",
    biography:
      "Sam is a man who works as a marine biologist during daytime hours, does not start work before sunrise, and explicitly does not work at night. When taking time off, he enjoys camping and plays acoustic guitar, and at home he owns a cat.",
    facts: [
      "Is a man (male)",
      "Works as a marine biologist",
      "Explicitly does not work at night",
      "Enjoys camping",
      "Plays acoustic guitar",
      "Owns a cat",
    ],
  },
  {
    id: "elena",
    name: "Elena",
    avatarUrl: "/avatars/elena.jpg",
    avatarAlt:
      "Editorial portrait photo of Elena in an evening blazer near a grand piano",
    biography:
      "Elena is a woman who works as a jazz pianist and regularly works at night rather than starting before sunrise. She lives in a downtown apartment where she bakes sourdough bread, explicitly dislikes camping, and explicitly owns no pets.",
    facts: [
      "Is a woman (female)",
      "Works as a jazz pianist",
      "Regularly works at night",
      "Bakes sourdough bread",
      "Lives in a downtown apartment",
      "Explicitly dislikes camping",
      "Explicitly owns no pets",
    ],
  },
  {
    id: "omar",
    name: "Omar",
    avatarUrl: "/avatars/omar.jpg",
    avatarAlt:
      "Editorial portrait photo of Omar in a home study with vintage watch dials",
    biography:
      "Omar is a man who works daytime hours from home as an accessibility consultant, does not start work before sunrise, and explicitly does not work at night. In his spare time, he repairs vintage watches, enjoys hiking and camping, and owns a dog.",
    facts: [
      "Is a man (male)",
      "Works as an accessibility consultant",
      "Works from home",
      "Explicitly does not work at night",
      "Repairs vintage watches",
      "Enjoys hiking",
      "Enjoys camping",
      "Owns a dog",
    ],
  },
  {
    id: "lin",
    name: "Lin",
    avatarUrl: "/avatars/lin.jpg",
    avatarAlt:
      "Editorial portrait photo of Lin in a morning glasshouse with orchids",
    biography:
      "Lin is a woman who works as a botanical archivist, starts work before sunrise, and explicitly does not work at night. Outside of research, she grows orchids and herbs, plays chess, enjoys camping, and owns a cat.",
    facts: [
      "Is a woman (female)",
      "Works as a botanical archivist",
      "Starts work before sunrise",
      "Explicitly does not work at night",
      "Grows orchids and herbs",
      "Plays chess",
      "Enjoys camping",
      "Owns a cat",
    ],
  },
  {
    id: "mateo",
    name: "Mateo",
    avatarUrl: "/avatars/mateo.jpg",
    avatarAlt:
      "Editorial portrait photo of Mateo near a live venue mixing console",
    biography:
      "Mateo is a man who works as a live-venue sound engineer and regularly works at night rather than starting before sunrise. He travels by bicycle, plays acoustic guitar, explicitly dislikes camping, and explicitly owns no pets.",
    facts: [
      "Is a man (male)",
      "Works as a live-venue sound engineer",
      "Regularly works at night",
      "Travels by bicycle",
      "Plays acoustic guitar",
      "Explicitly dislikes camping",
      "Explicitly owns no pets",
    ],
  },
  {
    id: "clara",
    name: "Clara",
    avatarUrl: "/avatars/clara.jpg",
    avatarAlt:
      "Editorial portrait photo of Clara in medical scrubs with a stethoscope",
    biography:
      "Clara is a woman who works as a pediatric nurse, starts work before sunrise, and explicitly does not work at night. On her days off, she enjoys hiking and camping, bakes pastries, and owns both a cat and a dog.",
    facts: [
      "Is a woman (female)",
      "Works as a pediatric nurse",
      "Starts work before sunrise",
      "Explicitly does not work at night",
      "Enjoys hiking",
      "Enjoys camping",
      "Bakes pastries",
      "Owns both a cat and a dog",
    ],
  },
  {
    id: "jun",
    name: "Jun",
    avatarUrl: "/avatars/jun.jpg",
    avatarAlt:
      "Editorial portrait photo of Jun in a home study with a vintage film camera",
    biography:
      "Jun is a man who works daytime hours as a technical translator from home, does not start work before sunrise, and explicitly does not work at night. For hobbies, he plays chess and repairs old film cameras, explicitly dislikes camping, and explicitly owns no pets.",
    facts: [
      "Is a man (male)",
      "Works as a technical translator",
      "Works from home",
      "Explicitly does not work at night",
      "Plays chess",
      "Repairs old film cameras",
      "Explicitly dislikes camping",
      "Explicitly owns no pets",
    ],
  },
] as const;

export type TraitClusterPredicate = (character: Character) => boolean;

export const SHARED_TRAIT_CLUSTERS: Record<string, TraitClusterPredicate> = {
  "woman (female)": (c) => c.facts.includes("Is a woman (female)"),
  "man (male)": (c) => c.facts.includes("Is a man (male)"),
  "night shifts": (c) => c.facts.includes("Regularly works at night"),
  "daytime schedule": (c) =>
    c.facts.includes("Explicitly does not work at night") &&
    !c.facts.includes("Starts work before sunrise"),
  "starts before sunrise": (c) =>
    c.facts.includes("Starts work before sunrise"),
  "works from home": (c) => c.facts.includes("Works from home"),
  "travels by bicycle": (c) => c.facts.includes("Travels by bicycle"),
  "enjoys hiking": (c) => c.facts.includes("Enjoys hiking"),
  "enjoys camping": (c) => c.facts.includes("Enjoys camping"),
  "dislikes camping": (c) => c.facts.includes("Explicitly dislikes camping"),
  "plays chess": (c) => c.facts.includes("Plays chess"),
  "repairs gear": (c) => c.facts.some((f) => f.startsWith("Repairs ")),
  "baking/plants": (c) =>
    c.facts.some((f) => f.startsWith("Bakes ") || f.startsWith("Grows ")),
  "owns a cat": (c) => c.facts.some((f) => f.toLowerCase().includes("cat")),
  "owns a dog": (c) => c.facts.some((f) => f.toLowerCase().includes("dog")),
  "owns no pets": (c) => c.facts.includes("Explicitly owns no pets"),
};

export function getCharacterById(id: string): Character | undefined {
  return CHARACTERS.find((char) => char.id === id);
}

export function validateCharacterDataset(characters: readonly Character[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (characters.length !== 12) {
    errors.push(
      `Dataset must contain exactly 12 characters, found ${characters.length}`
    );
  }

  const ids = new Set<string>();
  for (const c of characters) {
    if (!c.id || c.id.trim() === "") {
      errors.push("Character missing id");
    } else if (ids.has(c.id)) {
      errors.push(`Duplicate character id: "${c.id}"`);
    } else {
      ids.add(c.id);
    }
  }

  const names = new Set<string>();
  for (const c of characters) {
    if (!c.name || c.name.trim() === "") {
      errors.push(`Character "${c.id || "unknown"}" missing name`);
    } else if (names.has(c.name)) {
      errors.push(`Duplicate character name: "${c.name}"`);
    } else {
      names.add(c.name);
    }
  }

  for (const c of characters) {
    if (!c.avatarUrl || c.avatarUrl.trim() === "") {
      errors.push(`Character "${c.id}" missing avatarUrl`);
    }
    if (!c.avatarAlt || c.avatarAlt.trim() === "") {
      errors.push(`Character "${c.id}" missing avatarAlt`);
    }
    if (!c.biography || c.biography.trim() === "") {
      errors.push(`Character "${c.id}" missing biography`);
    }
    if (!Array.isArray(c.facts) || c.facts.length < 4 || c.facts.length > 8) {
      errors.push(
        `Character "${c.id}" must have 4 to 8 facts, found ${c.facts?.length}`
      );
    } else {
      for (const fact of c.facts) {
        if (!fact || fact.trim() === "") {
          errors.push(`Character "${c.id}" has an empty fact`);
        }
      }
      const serialized = c.facts.map((f) => `- ${f}`).join("\n");
      if (serialized.length >= 600) {
        errors.push(
          `Character "${c.id}" serialized facts exceed 600 characters (${serialized.length})`
        );
      }
    }
  }

  const factSignatures = new Set<string>();
  for (const c of characters) {
    if (Array.isArray(c.facts)) {
      const signature = [...c.facts]
        .map((f) => f.trim().toLowerCase())
        .sort()
        .join("|");
      if (factSignatures.has(signature)) {
        errors.push(`Character "${c.id}" has a duplicate fact set`);
      } else {
        factSignatures.add(signature);
      }
    }
  }

  for (const [clusterName, predicate] of Object.entries(SHARED_TRAIT_CLUSTERS)) {
    const count = characters.filter(predicate).length;
    if (count < 3 || count > 6) {
      errors.push(
        `Trait cluster "${clusterName}" count must be between 3 and 6, found ${count}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
