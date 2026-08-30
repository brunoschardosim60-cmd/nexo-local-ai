export const PRODUCT_BRAND = Object.freeze({
  displayName: 'Nexo',
  tagline: 'Inteligência local',
  description:
    'Assistente local para conhecimento, programação, documentos e mídia.',
  technicalNamespace: 'nexo',
  candidateNames: ['Whaleye', 'BlueGaze', 'DeepEye', 'AbyssEye'] as const,
  assets: Object.freeze({
    livingEye: '/nexo/living-eye-base.png',
    livingEyeClosed: '/nexo/living-eye-closed.png',
  }),
  identity: Object.freeze({
    concepts: ['depth', 'intelligence', 'living-presence', 'blue-bioluminescence'],
    livingEye: 'whale-inspired-organic-eye',
  }),
});

export const BRAND_NAME = PRODUCT_BRAND.displayName;

