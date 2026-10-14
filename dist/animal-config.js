export const ANIMAL_SPECIES = ['rabbit', 'fox', 'duck', 'deer', 'turtle'];

// Optional on every section. Omitting animals, or using [], leaves a shore empty.
export function expandAnimals(section) {
  return (section.animals || []).flatMap(({species, count = 1, scale = 1}) =>
    Array.from({length: count}, () => ({species, scale}))
  );
}
