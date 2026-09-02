import type { DeckEntry, DisorderDefinition, DrugDefinition } from './types'

const disorder = (
  definitionId: DisorderDefinition['definitionId'],
  displayName: string,
  therapyAllowed: boolean,
): DisorderDefinition => ({
  definitionId,
  displayName,
  cardType: 'disorder',
  episodeEffect: { kind: 'disorder-specific' },
  therapyAllowed,
})

const drug = (
  definitionId: DrugDefinition['definitionId'],
  displayName: string,
  treats: DrugDefinition['treats'],
  sideEffects: DrugDefinition['sideEffects'],
): DrugDefinition => ({
  definitionId,
  displayName,
  cardType: 'drug',
  treats,
  sideEffects,
})

export const baseDeckEntries: readonly DeckEntry[] = [
  { definition: disorder('depression', 'Depression', true), copies: 5 },
  { definition: disorder('anxiety', 'Anxiety', true), copies: 5 },
  { definition: disorder('impotence', 'Impotence', true), copies: 5 },
  {
    definition: disorder('gambling-addiction', 'Gambling Addiction', true),
    copies: 5,
  },
  {
    definition: disorder('suicidal-thoughts', 'Suicidal Thoughts', true),
    copies: 5,
  },
  { definition: disorder('tremors', 'Tremors', false), copies: 5 },
  { definition: disorder('anorexia', 'Anorexia', true), copies: 4 },
  { definition: disorder('madness', 'Madness', true), copies: 4 },

  {
    definition: drug('depression-treatment', 'Fluoxetine', 'depression', [
      'impotence',
      'suicidal-thoughts',
      'anorexia',
    ]),
    copies: 5,
  },
  {
    definition: drug('anxiety-treatment', 'Lorazepam', 'anxiety', [
      'suicidal-thoughts',
      'depression',
      'madness',
    ]),
    copies: 5,
  },
  {
    definition: drug('impotence-treatment', 'Sildenafil', 'impotence', [
      'anxiety',
    ]),
    copies: 5,
  },
  {
    definition: drug(
      'gambling-addiction-treatment',
      'Lithium',
      'gambling-addiction',
      ['impotence'],
    ),
    copies: 5,
  },
  {
    definition: drug(
      'suicidal-thoughts-treatment',
      'Clozapine',
      'suicidal-thoughts',
      ['madness'],
    ),
    copies: 5,
  },
  {
    definition: drug('tremors-treatment', 'Pramipexole', 'tremors', [
      'gambling-addiction',
      'depression',
      'madness',
    ]),
    copies: 6,
  },
  {
    definition: drug('madness-treatment', 'Chlorpromazine', 'madness', [
      'tremors',
    ]),
    copies: 5,
  },

  {
    definition: {
      definitionId: 'episode',
      displayName: "You're Having an Episode",
      cardType: 'episode',
    },
    copies: 20,
  },
  {
    definition: {
      definitionId: 'therapy',
      displayName: 'Therapy',
      cardType: 'therapy',
    },
    copies: 5,
  },
]
